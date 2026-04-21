import type { Router } from '../router.js';
import type { Agent, AggregatedUsage } from '@pipefx/ai';
import type { UsageData } from '@pipefx/providers';
import type { ConnectorRegistry } from '@pipefx/mcp';
import type {
  AgentSessionStore,
  PlanApprovalBroker,
} from '@pipefx/agents';
import {
  agentsLog,
  freshSelfCheckState,
  buildPostRoundReminder,
} from '@pipefx/agents';
import type { AsyncLocalStorage } from 'node:async_hooks';
import { readBody, jsonResponse, jsonError } from '../router.js';
import { memoryTaskManager, assembleProjectContext } from '../services/memory/index.js';
import {
  createChatSession,
  appendChatMessage,
  chatSessionExists,
} from '../services/memory/chat-sessions.js';
import { config } from '../config.js';
import { composeSystemPrompt } from '../prompts/index.js';
import {
  calculateCost,
  createUsageEvent,
} from '@pipefx/usage';
import type { UsageStore } from '@pipefx/usage';

export interface ChatRouteDeps {
  getAgent: () => Agent;
  registry: ConnectorRegistry;
  sessionALS?: AsyncLocalStorage<string>;
  sseBroker?: {
    set: (sessionId: string, emit: (ev: Record<string, unknown>) => void) => void;
    clear: (sessionId: string) => void;
  };
  agentSessions?: AgentSessionStore;
  planBroker?: PlanApprovalBroker;
  usageStore?: UsageStore;
}

/**
 * SSE helper: write a typed event to the response stream.
 */
function sseWrite(res: any, event: Record<string, unknown>) {
  if (res.destroyed || res.writableEnded) return;
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

/** Global timeout for a single chat stream request (2 minutes). */
const STREAM_TIMEOUT = 120_000;

/**
 * Build the system prompt for a chat request via the section composer.
 *
 * The composer assembles identity / doing-tasks / tone / executing-actions /
 * planning-discipline / (AE bridge contract when applicable) / legacy-md
 * sections, with per-section caching keyed by activeApp. The planning
 * section is the important addition: without it Gemini skipped
 * EnterPlanMode + TodoWrite entirely on multi-step AE tasks.
 *
 * Stays `async` so compute functions can do real work in the future
 * (memory fetches, MCP instructions, etc.) without touching callers.
 */
async function buildSystemPrompt(
  skill: any,
  activeApp: string | undefined,
  projectId: string | undefined
): Promise<string> {
  // Skill with a full systemInstruction still takes over — matches prior
  // behavior so in-flight skills don't break.
  if (skill?.systemInstruction && !activeApp) {
    return skill.systemInstruction;
  }

  const projectContext = projectId
    ? assembleProjectContext(projectId, '') || undefined
    : undefined;

  return composeSystemPrompt({
    activeApp,
    skillSystemInstruction: skill?.systemInstruction,
    projectContext,
    legacySections: config.systemPromptLegacy,
  });
}

/**
 * Registers the POST /chat and POST /chat/stream routes.
 */
export function registerChatRoutes(router: Router, deps: ChatRouteDeps) {
  // ΓöÇΓöÇ POST /chat (legacy ΓÇö full response) ΓöÇΓöÇ
  router.post('/chat', async (req, res) => {
    const abortController = new AbortController();
    req.on('aborted', () => abortController.abort());
    res.on('close', () => {
      if (!res.writableFinished) {
        abortController.abort();
      }
    });

    try {
      const body = await readBody(req);
      const { message, skill, history, llmModel, activeApp, projectId, taskId } =
        JSON.parse(body);

      if (!message) {
        jsonResponse(res, { error: 'Message is required' }, 400);
        return;
      }

      const systemPromptOverride = await buildSystemPrompt(skill, activeApp, projectId);
      const resolvedTaskId = taskId || `chat-${Date.now()}`;

      try {
        memoryTaskManager.createTask(resolvedTaskId, 'AI Assistant Working', [], projectId);
        const stepIndices = new Map<string, number>();

        const text = await deps.getAgent().chat(message, {
          providerOverride: llmModel,
          modelOverride: skill?.model,
          systemPromptOverride,
          allowedTools: skill?.allowedTools,
          history,
          signal: abortController.signal,
          onToolCallStart: (toolName) => {
            const idx = memoryTaskManager.addTaskStep(resolvedTaskId, `Calling ${toolName}`, 'in-progress');
            stepIndices.set(toolName, idx);
          },
          onToolCallComplete: (toolName, _result, err) => {
            const idx = stepIndices.get(toolName);
            if (idx !== undefined && idx >= 0) {
              memoryTaskManager.updateTaskStep(resolvedTaskId, idx, err ? 'error' : 'done');
            }
          },
          onThought: (thought) => {
            memoryTaskManager.emitThought(resolvedTaskId, thought);
          },
        });

        memoryTaskManager.finishTask(resolvedTaskId, 'done');

        let cleanText = text;
        const actions: any[] = [];
        const actionBlockRegex = /```(?:pipeline_actions|json)?\s*\n([\s\S]*?)```/g;
        let match;
        while ((match = actionBlockRegex.exec(text)) !== null) {
          try {
            const jsonString = match[1].replace(/^\s*\/\/.*$/gm, '').replace(/,\s*([\]}])/g, '$1');
            const parsed = JSON.parse(jsonString);
            if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].type) {
              actions.push(...parsed);
              cleanText = cleanText.replace(match[0], '').trim();
            }
          } catch (_e) { /* ignore malformed JSON in pipeline actions */ }
        }

        if (actions.length === 0) {
          try {
            const jsonString = text.replace(/^\s*\/\/.*$/gm, '').replace(/,\s*([\]}])/g, '$1');
            const arrStart = jsonString.indexOf('[');
            const arrEnd = jsonString.lastIndexOf(']');
            if (arrStart !== -1 && arrEnd !== -1 && arrEnd > arrStart) {
              const parsed = JSON.parse(jsonString.substring(arrStart, arrEnd + 1));
              if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].type) {
                actions.push(...parsed);
                cleanText = cleanText.replace(text.substring(arrStart, arrEnd + 1), '').trim();
              }
            }
          } catch (_e) { /* ignore fallback parse attempt */ }
        }

        if (!res.headersSent) {
          jsonResponse(res, { text: cleanText, actions: actions.length > 0 ? actions : undefined });
        }
      } catch (agentError: any) {
        memoryTaskManager.finishTask(resolvedTaskId, 'error');
        if (!res.headersSent) {
          if (agentError.message?.includes('AbortError')) {
            jsonResponse(res, { error: 'Request cancelled' }, 499);
          } else {
            jsonError(res, agentError);
          }
        }
      }
    } catch (err) {
      jsonError(res, err);
    }
  });

  // ΓöÇΓöÇ POST /chat/stream (new ΓÇö SSE streaming) ΓöÇΓöÇ
  router.post('/chat/stream', async (req, res) => {
    agentsLog.info('POST /chat/stream opened');
    const abortController = new AbortController();
    // For SSE: listen on `res` close (client disconnect), NOT `req` close
    // (`req` close fires as soon as the POST body is read ΓÇö instantly killing the stream)
    res.on('close', () => abortController.abort());

    try {
      const body = await readBody(req);
      const { message, skill, history, llmModel, activeApp, projectId, taskId, sessionId } =
        JSON.parse(body);

      if (!message) {
        jsonResponse(res, { error: 'Message is required' }, 400);
        return;
      }

      // ΓöÇΓöÇ Session persistence: ensure session exists ΓöÇΓöÇ
      let resolvedSessionId = sessionId as string | undefined;
      if (!resolvedSessionId) {
        resolvedSessionId = `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      }
      const sessionIsNew = !chatSessionExists(resolvedSessionId);
      if (sessionIsNew) {
        createChatSession(resolvedSessionId, projectId, llmModel);
      }
      agentsLog.info('chat turn start', {
        sessionId: resolvedSessionId,
        sessionIsNew,
        projectId,
        llmModel,
        activeApp,
        messageChars: typeof message === 'string' ? message.length : 0,
      });

      // Save user message BEFORE calling AI
      appendChatMessage(resolvedSessionId, 'user', message);

      // Start SSE response
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      });

      // Tell the desktop the resolved sessionId IMMEDIATELY. Without this
      // the desktop only learns sessionId from the final `done` event, so
      // mid-turn events that require a sessionId (plan_proposed → modal,
      // todo_updated → list) silently no-op on the very first request.
      sseWrite(res, { type: 'session', sessionId: resolvedSessionId });

      const systemPromptOverride = await buildSystemPrompt(skill, activeApp, projectId);
      const resolvedTaskId = taskId || `chat-${Date.now()}`;
      const stepIndices = new Map<string, number>();

      memoryTaskManager.createTask(resolvedTaskId, 'AI Assistant Working', [], projectId);

      // Register an SSE emitter for this session so @pipefx/agents tool
      // handlers can push todo_updated / plan_proposed / subagent_* events.
      if (deps.sseBroker && resolvedSessionId) {
        deps.sseBroker.set(resolvedSessionId, (ev) => sseWrite(res, ev));
      }

      // Fresh turn ΓÇö drop any cached idempotency entries from the
      // previous turn so a genuine re-run of the same (tool, args) is
      // allowed to actually re-fire.
      deps.registry.clearIdempotencyCaches();

      // Global timeout ΓÇö prevents zombie connections from hanging forever
      const streamTimeout = setTimeout(() => {
        abortController.abort();
        sseWrite(res, { type: 'error', error: 'Request timed out after 2 minutes.' });
        memoryTaskManager.finishTask(resolvedTaskId, 'error');
        if (!res.writableEnded) res.end();
      }, STREAM_TIMEOUT);

      // ── AE bridge preflight ─────────────────────────────────────────
      // If the user targets After Effects, probe the bridge once before
      // spending tokens. A dead bridge means every AE tool call will
      // silently queue forever — fail fast and tell the user to bring
      // AE to the front. The *prompt-side* AE contract (tool choice,
      // whitelist, async semantics) now lives in prompts/library.ts —
      // see `aeBridgeContract`. This block only does the live probe.
      const excludedTools: string[] = [];

      // ── Plan-mode anti-loop: drop EnterPlanMode if already approved ──
      // Once a plan has been approved for this session, keep the tool out
      // of the model's tool list entirely. Without this, GPT-5.4 in
      // particular re-proposes the same plan after every intermediate
      // tool call and never executes. The server-side handler also
      // guards against this, but excluding from the tool list is the
      // cleaner fix — the model physically can't call what it doesn't
      // see. ExitPlanMode stays available.
      if (deps.agentSessions && resolvedSessionId) {
        const existing = deps.agentSessions.has(resolvedSessionId)
          ? deps.agentSessions.get(resolvedSessionId)
          : undefined;
        if (existing?.planMode.approved === true) {
          excludedTools.push('EnterPlanMode');
          agentsLog.info('chat turn excluding EnterPlanMode', {
            sessionId: resolvedSessionId,
            reason: 'plan-already-approved',
          });
        }
      }
      if (activeApp === 'aftereffects') {
        try {
          // Ensure the tool index is populated before probing. On the very
          // first request of a process, `callTool` throws `Unknown tool` if
          // `getAllTools()` has not run yet — which silently skipped the
          // preflight and left `bridge-health` in the model's tool list,
          // causing it to re-probe after every step.
          await deps.registry.getAllTools();
          const probe = await deps.registry.callTool('bridge-health', {});
          const probeText = (() => {
            const c = probe.content as unknown;
            if (typeof c === 'string') return c;
            if (Array.isArray(c)) {
              return c
                .map((p: unknown) =>
                  typeof p === 'string'
                    ? p
                    : (p as { text?: string })?.text ?? ''
                )
                .join('');
            }
            return '';
          })();
          let verdict = 'unknown';
          try {
            const parsed = JSON.parse(probeText);
            verdict = parsed.verdict ?? 'unknown';
          } catch {
            // keep verdict = unknown
          }
          agentsLog.info('bridge-health preflight', {
            sessionId: resolvedSessionId,
            verdict,
          });
          if (verdict !== 'alive') {
            clearTimeout(streamTimeout);
            memoryTaskManager.finishTask(resolvedTaskId, 'error');
            const msg =
              `The After Effects bridge isn't responding (verdict: ${verdict}). ` +
              `Bring After Effects to the front, dismiss any open dialogs, then retry.`;
            appendChatMessage(resolvedSessionId!, 'assistant', msg);
            sseWrite(res, { type: 'done', text: msg, sessionId: resolvedSessionId });
            res.end();
            return;
          }
          excludedTools.push('bridge-health');
        } catch (err) {
          agentsLog.error('bridge-health preflight failed', {
            sessionId: resolvedSessionId,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      // Self-check state: tracks rounds-since-last-TodoWrite for reminder nudges.
      const selfCheck = freshSelfCheckState();

      const runChat = async () => deps.getAgent().chat(message, {
        providerOverride: llmModel,
        modelOverride: skill?.model,
        systemPromptOverride,
        allowedTools: skill?.allowedTools,
        excludedTools,
        history,
        signal: abortController.signal,
        onStreamChunk: (chunk) => {
          sseWrite(res, { type: 'chunk', text: chunk });
        },
        onToolCallStart: (toolName, args) => {
          const idx = memoryTaskManager.addTaskStep(resolvedTaskId, `Calling ${toolName}`, 'in-progress');
          stepIndices.set(toolName, idx);
          sseWrite(res, { type: 'tool_start', name: toolName, args });
        },
        onToolCallComplete: (toolName, _result, err) => {
          const idx = stepIndices.get(toolName);
          if (idx !== undefined && idx >= 0) {
            memoryTaskManager.updateTaskStep(resolvedTaskId, idx, err ? 'error' : 'done');
          }
          sseWrite(res, { type: 'tool_done', name: toolName, error: err?.message });
        },
        onThought: (thought) => {
          memoryTaskManager.emitThought(resolvedTaskId, thought);
          sseWrite(res, { type: 'thought', text: thought });
        },
        onCompaction: (removedCount, summary) => {
          sseWrite(res, { type: 'compaction', removedCount, summary });
        },
        getPostRoundReminder: (ctx) => {
          const session =
            deps.agentSessions && resolvedSessionId && deps.agentSessions.has(resolvedSessionId)
              ? deps.agentSessions.get(resolvedSessionId)
              : null;
          return buildPostRoundReminder(ctx, selfCheck, session);
        },
        onRoundUsage: (usage: UsageData, roundNumber: number) => {
          // Emit per-round usage to the SSE stream for real-time cost display
          const cost = calculateCost(usage);
          sseWrite(res, {
            type: 'usage_round',
            roundNumber,
            usage: {
              inputTokens: usage.inputTokens,
              outputTokens: usage.outputTokens,
              thinkingTokens: usage.thinkingTokens,
              cachedTokens: usage.cachedTokens,
              model: usage.model,
              provider: usage.provider,
            },
            cost: {
              costUsd: cost.costUsd,
              credits: cost.credits,
            },
          });

          // Record to SQLite
          if (deps.usageStore) {
            const event = createUsageEvent({
              userId: 'local-user',
              sessionId: resolvedSessionId!,
              requestId: resolvedTaskId,
              roundIndex: roundNumber,
              usage,
              cost,
              isByok: true,
            });
            deps.usageStore.record(event);
          }
        },
        onUsage: (aggregated: AggregatedUsage) => {
          // Emit aggregated usage in the SSE stream
          sseWrite(res, {
            type: 'usage_total',
            totalInputTokens: aggregated.totalInputTokens,
            totalOutputTokens: aggregated.totalOutputTokens,
            totalThinkingTokens: aggregated.totalThinkingTokens,
            totalCachedTokens: aggregated.totalCachedTokens,
            toolCallRounds: aggregated.toolCallRounds,
            rounds: aggregated.rounds.length,
          });
        },
      });

      try {
        // Wrap agent invocation in AsyncLocalStorage so @pipefx/agents tool
        // handlers (TodoWrite, EnterPlanMode, AgentTool, Task*) can resolve
        // the current sessionId via sessionALS.getStore().
        console.log(
          `[chat] calling runChat sessionId=${resolvedSessionId} activeApp=${activeApp} excludedToolsCount=${excludedTools.length}`
        );
        const text = deps.sessionALS
          ? await deps.sessionALS.run(resolvedSessionId!, runChat)
          : await runChat();
        console.log(
          `[chat] runChat returned sessionId=${resolvedSessionId} outputChars=${text?.length ?? 0}`
        );

        memoryTaskManager.finishTask(resolvedTaskId, 'done');
        agentsLog.info('chat turn done', {
          sessionId: resolvedSessionId,
          outputChars: text?.length ?? 0,
        });

        // Save AI response AFTER streaming completes
        appendChatMessage(resolvedSessionId!, 'assistant', text || '');

        sseWrite(res, { type: 'done', text, sessionId: resolvedSessionId });
        res.end();
      } catch (agentError: any) {
        memoryTaskManager.finishTask(resolvedTaskId, 'error');
        if (agentError.message?.includes('AbortError')) {
          agentsLog.warn('chat turn aborted', { sessionId: resolvedSessionId });
          sseWrite(res, { type: 'error', error: 'Request cancelled' });
        } else {
          agentsLog.error('chat turn failed', {
            sessionId: resolvedSessionId,
            error: agentError?.message || String(agentError),
          });
          sseWrite(res, { type: 'error', error: agentError.message || String(agentError) });
        }
        res.end();
      } finally {
        clearTimeout(streamTimeout);
        if (deps.sseBroker && resolvedSessionId) {
          deps.sseBroker.clear(resolvedSessionId);
        }
      }
    } catch (err) {
      if (!res.headersSent) {
        jsonError(res, err);
      } else {
        sseWrite(res, { type: 'error', error: err instanceof Error ? err.message : String(err) });
        res.end();
      }
    }
  });
}
