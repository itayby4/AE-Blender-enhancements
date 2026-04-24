import type { Agent, AggregatedUsage } from '@pipefx/agent-loop-kernel';
import type { UsageData } from '@pipefx/llm-providers';
import type { ConnectorRegistry } from '@pipefx/connectors';
import type { AgentSessionStore } from '@pipefx/brain-tasks';
import { brainSubagentsLog as agentsLog } from '@pipefx/brain-subagents';
import type { PlanApprovalBroker } from '@pipefx/brain-planning';
import {
  freshSelfCheckState,
  buildPostRoundReminder,
} from '@pipefx/brain-planning';
import {
  memoryTaskManager,
  createChatSession,
  appendChatMessage,
  chatSessionExists,
} from '@pipefx/brain-memory';
import type { AsyncLocalStorage } from 'node:async_hooks';
import { readBody, jsonResponse, jsonError } from '../internal/http.js';
import type { RouterLike } from '../internal/http.js';

/**
 * Structural shapes for the cost / usage-store deps. `apps/backend` passes
 * the real `calculateCost` / `createUsageEvent` / `UsageStore` from
 * `@pipefx/usage` (scope:usage — not reachable from `feature:chat`), so we
 * keep duck-typed shapes here and let structural typing line them up.
 */
export interface CostShape {
  costUsd: number;
  credits: number;
  breakdown: {
    inputCost: number;
    outputCost: number;
    thinkingCost: number;
    cachedDiscount: number;
  };
}

export interface UsageStoreLike {
  record(event: unknown): void;
}

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
  usageStore?: UsageStoreLike;
  /**
   * Build the per-turn system prompt. Injected so the chat package stays
   * free of `apps/backend`'s `config` + `prompts/*` wiring.
   */
  buildSystemPrompt: (
    skill: any,
    activeApp: string | undefined,
    projectId: string | undefined
  ) => Promise<string>;
  /** Injected from `@pipefx/usage` by the app. */
  calculateCost: (usage: UsageData) => CostShape;
  /** Injected from `@pipefx/usage` by the app. */
  createUsageEvent: (args: {
    userId: string;
    sessionId: string;
    requestId: string;
    roundIndex: number;
    usage: UsageData;
    cost: CostShape;
    isByok: boolean;
  }) => unknown;
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
 * Registers the POST /chat and POST /chat/stream routes.
 */
export function registerChatRoutes(router: RouterLike, deps: ChatRouteDeps) {
  // ── POST /chat (legacy — full response) ──
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

      const systemPromptOverride = await deps.buildSystemPrompt(skill, activeApp, projectId);
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

  // ── POST /chat/stream (SSE streaming) ──
  router.post('/chat/stream', async (req, res) => {
    agentsLog.info('POST /chat/stream opened');
    const abortController = new AbortController();
    // For SSE: listen on `res` close (client disconnect), NOT `req` close
    // (`req` close fires as soon as the POST body is read — instantly killing the stream)
    res.on('close', () => abortController.abort());

    try {
      const body = await readBody(req);
      const { message, skill, history, llmModel, activeApp, projectId, taskId, sessionId } =
        JSON.parse(body);

      if (!message) {
        jsonResponse(res, { error: 'Message is required' }, 400);
        return;
      }

      // ── Session persistence: ensure session exists ──
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

      const systemPromptOverride = await deps.buildSystemPrompt(skill, activeApp, projectId);
      const resolvedTaskId = taskId || `chat-${Date.now()}`;
      const stepIndices = new Map<string, number>();

      memoryTaskManager.createTask(resolvedTaskId, 'AI Assistant Working', [], projectId);

      // Register an SSE emitter for this session so @pipefx/brain-subagents
      // tool handlers can push todo_updated / plan_proposed / subagent_* events.
      if (deps.sseBroker && resolvedSessionId) {
        deps.sseBroker.set(resolvedSessionId, (ev) => sseWrite(res, ev));
      }

      // Fresh turn — drop any cached idempotency entries from the
      // previous turn so a genuine re-run of the same (tool, args) is
      // allowed to actually re-fire.
      deps.registry.clearIdempotencyCaches();

      // Global timeout — prevents zombie connections from hanging forever
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
      // AE to the front.
      const excludedTools: string[] = [];

      // ── Plan-mode anti-loop: drop EnterPlanMode if already approved ──
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
        onRoundUsage: (usage, roundNumber) => {
          // Emit per-round usage to the SSE stream for real-time cost display
          const cost = deps.calculateCost(usage);
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
            const event = deps.createUsageEvent({
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
        // Wrap agent invocation in AsyncLocalStorage so the brain tool
        // handlers (TodoWrite, EnterPlanMode, AgentTool, Task*) registered
        // by @pipefx/brain-subagents can resolve the current sessionId via
        // sessionALS.getStore().
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
