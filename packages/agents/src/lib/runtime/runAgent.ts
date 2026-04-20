/**
 * Sub-agent runtime — spawn, track, and collect output from worker agents.
 *
 * Mirrors OpenClaude's src/tools/AgentTool/runAgent.ts lifecycle (create
 * task record → run fresh agent with worker prompt → stream chunks to
 * output file → resolve with final text), adapted to use PipeFX's
 * createAgent + shared ConnectorRegistry.
 */

import type { Agent, AgentConfig, ChatOptions } from '@pipefx/ai';
import { createAgent } from '@pipefx/ai';
import { MAX_CONCURRENT_SUBAGENTS } from '../constants.js';
import { generateTaskId, type TaskRecord, type TaskType } from '../Task.js';
import type { AgentSessionStore } from '../sessionState.js';
import type { TaskOutputStore } from '../output/store.js';
import { WORKER_SYSTEM_PROMPT } from '../prompts/worker.js';
import { agentsLog } from '../log.js';

export type SubAgentEvent =
  | { type: 'start'; taskId: string; description: string }
  | { type: 'chunk'; taskId: string; text: string }
  | { type: 'tool_start'; taskId: string; name: string; args: unknown }
  | { type: 'tool_done'; taskId: string; name: string; error?: string }
  | { type: 'done'; taskId: string; outputRef: string }
  | { type: 'error'; taskId: string; message: string };

export interface RunSubAgentOptions {
  sessionId: string;
  taskType: TaskType;
  description: string;
  prompt: string;
  allowedTools?: string[];
  /**
   * Optional per-call system-prompt override. If omitted, the worker system
   * prompt is used.
   */
  systemPromptOverride?: string;
  /** Called for each streamed event from the worker. */
  onEvent?: (ev: SubAgentEvent) => void;
  signal?: AbortSignal;
}

export interface SubAgentRuntime {
  run(opts: RunSubAgentOptions): Promise<{ taskId: string; output: string }>;
  stop(taskId: string): void;
  running(sessionId: string): number;
}

export interface SubAgentRuntimeConfig {
  /** Base config cloned for each worker. `systemPrompt` is overridden per-run. */
  agentConfigBase: AgentConfig;
  sessions: AgentSessionStore;
  taskOutput: TaskOutputStore;
  maxConcurrentPerSession?: number;
}

/**
 * Build a sub-agent runtime bound to a shared registry + session store.
 *
 * The underlying AgentConfig is cloned per run — each worker gets its own
 * AbortController but the MCP ConnectorRegistry is shared (no double
 * connections) and the parent's API keys and model default.
 */
export function createSubAgentRuntime(
  cfg: SubAgentRuntimeConfig
): SubAgentRuntime {
  const maxConcurrent =
    cfg.maxConcurrentPerSession ?? MAX_CONCURRENT_SUBAGENTS;
  const abortMap = new Map<string, AbortController>();

  function countRunning(sessionId: string): number {
    const state = cfg.sessions.has(sessionId)
      ? cfg.sessions.get(sessionId)
      : null;
    if (!state) return 0;
    let n = 0;
    for (const task of state.tasks.values()) {
      if (task.status === 'running' || task.status === 'pending') n++;
    }
    return n;
  }

  return {
    running: countRunning,
    stop(taskId: string) {
      const ctrl = abortMap.get(taskId);
      if (ctrl) ctrl.abort();
    },

    async run(opts) {
      const {
        sessionId,
        taskType,
        description,
        prompt,
        allowedTools,
        systemPromptOverride,
        onEvent,
        signal,
      } = opts;

      const state = cfg.sessions.get(sessionId);
      if (countRunning(sessionId) >= maxConcurrent) {
        agentsLog.warn('sub-agent rejected', {
          sessionId,
          reason: 'concurrency-cap',
          cap: maxConcurrent,
        });
        throw new Error(
          `Sub-agent concurrency limit reached for session ${sessionId} (max ${maxConcurrent}).`
        );
      }

      const taskId = generateTaskId(taskType);
      const outputPath = cfg.taskOutput.pathFor(sessionId, taskId);
      agentsLog.info('sub-agent spawn', {
        sessionId,
        taskId,
        taskType,
        description,
        promptChars: prompt.length,
        allowedToolsCount: allowedTools?.length ?? 0,
      });

      const record: TaskRecord = {
        id: taskId,
        type: taskType,
        status: 'pending',
        description,
        prompt,
        outputPath,
        sessionId,
        createdAt: Date.now(),
      };
      state.tasks.set(taskId, record);

      const ctrl = new AbortController();
      abortMap.set(taskId, ctrl);
      const onParentAbort = () => ctrl.abort();
      signal?.addEventListener('abort', onParentAbort);

      onEvent?.({ type: 'start', taskId, description });

      // Clone config and override system prompt + tool allowlist for this run.
      const workerAgent: Agent = createAgent({
        ...cfg.agentConfigBase,
        systemPrompt: systemPromptOverride ?? WORKER_SYSTEM_PROMPT,
      });

      const chatOpts: ChatOptions = {
        allowedTools,
        signal: ctrl.signal,
        onStreamChunk: async (chunk) => {
          onEvent?.({ type: 'chunk', taskId, text: chunk });
          try {
            await cfg.taskOutput.write(sessionId, taskId, chunk);
          } catch {
            // Non-fatal: output persistence is best-effort.
          }
        },
        onToolCallStart: (name, args) => {
          agentsLog.debug('sub-agent tool_start', { taskId, tool: name });
          onEvent?.({ type: 'tool_start', taskId, name, args });
        },
        onToolCallComplete: (name, _result, err) => {
          if (err) {
            agentsLog.warn('sub-agent tool_error', {
              taskId,
              tool: name,
              error: err.message,
            });
          } else {
            agentsLog.debug('sub-agent tool_done', { taskId, tool: name });
          }
          onEvent?.({ type: 'tool_done', taskId, name, error: err?.message });
        },
      };

      record.status = 'running';
      record.startedAt = Date.now();

      try {
        const finalText = await workerAgent.chat(prompt, chatOpts);
        // Make sure the final text is in the output file even if provider
        // skipped streaming for the last segment.
        try {
          await cfg.taskOutput.write(
            sessionId,
            taskId,
            finalText.endsWith('\n') ? finalText : finalText + '\n'
          );
        } catch {
          /* ignore */
        }
        record.status = 'completed';
        record.finishedAt = Date.now();
        agentsLog.info('sub-agent done', {
          sessionId,
          taskId,
          durationMs: record.finishedAt - (record.startedAt ?? record.finishedAt),
          outputChars: finalText.length,
          outputRef: outputPath,
        });
        onEvent?.({ type: 'done', taskId, outputRef: outputPath });
        return { taskId, output: finalText };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (message.includes('AbortError')) {
          record.status = 'killed';
          agentsLog.warn('sub-agent killed', { sessionId, taskId });
        } else {
          record.status = 'failed';
          record.error = message;
          agentsLog.error('sub-agent failed', {
            sessionId,
            taskId,
            error: message,
          });
        }
        record.finishedAt = Date.now();
        onEvent?.({ type: 'error', taskId, message });
        throw err;
      } finally {
        abortMap.delete(taskId);
        signal?.removeEventListener('abort', onParentAbort);
      }
    },
  };
}
