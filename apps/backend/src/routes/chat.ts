import type { Router } from '../router.js';
import type { Agent } from '@pipefx/ai';
import type { ConnectorRegistry } from '@pipefx/mcp';
import type {
  AgentSessionStore,
  PlanApprovalBroker,
} from '@pipefx/agents';
import { agentsLog } from '@pipefx/agents';
import type { AsyncLocalStorage } from 'node:async_hooks';
import { readBody, jsonResponse, jsonError } from '../router.js';
import { memoryTaskManager, assembleProjectContext } from '../services/memory/index.js';
import {
  createChatSession,
  appendChatMessage,
  chatSessionExists,
} from '../services/memory/chat-sessions.js';
import { config } from '../config.js';

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
 * Build the system prompt for a chat request.
 */
function buildSystemPrompt(
  skill: any,
  activeApp: string | undefined,
  projectId: string | undefined
): string {
  let systemPrompt = skill?.systemInstruction;
  if (!systemPrompt && activeApp) {
    const appNames: Record<string, string> = {
      resolve: 'DaVinci Resolve',
      premiere: 'Adobe Premiere Pro',
      aftereffects: 'Adobe After Effects',
      blender: 'Blender',
      ableton: 'Ableton Live',
    };
    const appName = appNames[activeApp] || 'the Video Editing Software';
    systemPrompt = config.systemPrompt.replace(/DaVinci Resolve/g, appName);
  }

  if (projectId) {
    const brainContext = assembleProjectContext(projectId, '');
    if (brainContext) {
      systemPrompt = `${systemPrompt}${brainContext}`;
    }
  }

  return systemPrompt || config.systemPrompt;
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

      const systemPromptOverride = buildSystemPrompt(skill, activeApp, projectId);
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

      const systemPromptOverride = buildSystemPrompt(skill, activeApp, projectId);
      const resolvedTaskId = taskId || `chat-${Date.now()}`;
      const stepIndices = new Map<string, number>();

      memoryTaskManager.createTask(resolvedTaskId, 'AI Assistant Working', [], projectId);

      // Register an SSE emitter for this session so @pipefx/agents tool
      // handlers can push todo_updated / plan_proposed / subagent_* events.
      if (deps.sseBroker && resolvedSessionId) {
        deps.sseBroker.set(resolvedSessionId, (ev) => sseWrite(res, ev));
      }

      // Global timeout ΓÇö prevents zombie connections from hanging forever
      const streamTimeout = setTimeout(() => {
        abortController.abort();
        sseWrite(res, { type: 'error', error: 'Request timed out after 2 minutes.' });
        memoryTaskManager.finishTask(resolvedTaskId, 'error');
        if (!res.writableEnded) res.end();
      }, STREAM_TIMEOUT);

      const runChat = async () => deps.getAgent().chat(message, {
        providerOverride: llmModel,
        modelOverride: skill?.model,
        systemPromptOverride,
        allowedTools: skill?.allowedTools,
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
      });

      try {
        // Wrap agent invocation in AsyncLocalStorage so @pipefx/agents tool
        // handlers (TodoWrite, EnterPlanMode, AgentTool, Task*) can resolve
        // the current sessionId via sessionALS.getStore().
        const text = deps.sessionALS
          ? await deps.sessionALS.run(resolvedSessionId!, runChat)
          : await runChat();

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
