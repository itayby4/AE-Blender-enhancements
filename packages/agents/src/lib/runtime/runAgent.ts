/**
 * Sub-agent runtime — spawn, track, resume, and fork worker agents.
 *
 * Mirrors OpenClaude's src/tools/AgentTool/ lifecycle: create task record →
 * run a fresh agent with worker prompt → stream chunks to output file →
 * resolve with final text. Extended with:
 *   - per-task transcripts (for resume + fork)
 *   - `resume()` — feed a follow-up user message into an existing worker
 *     with its accumulated history.
 *   - `fork()`  — spawn a new worker seeded with a parent task's history.
 *   - named agent profiles (`AgentProfile`) — map a profile name to
 *     systemPromptOverride + allowedTools.
 */

import type { Agent, AgentConfig, ChatOptions } from '@pipefx/ai';
import { createAgent } from '@pipefx/ai';
import { MAX_CONCURRENT_SUBAGENTS } from '../constants.js';
import { generateTaskId, type TaskRecord, type TaskType } from '../Task.js';
import type { AgentSessionStore } from '../sessionState.js';
import type { TaskOutputStore } from '../output/store.js';
import { WORKER_SYSTEM_PROMPT } from '../prompts/worker.js';
import { agentsLog } from '../log.js';
import {
  createTaskTranscriptStore,
  type TaskTranscriptStore,
} from './taskTranscripts.js';
import type { AgentProfile } from './builtInAgents.js';

export type SubAgentEvent =
  | { type: 'start'; taskId: string; description: string }
  | { type: 'chunk'; taskId: string; text: string }
  | { type: 'tool_start'; taskId: string; name: string; args: unknown }
  | { type: 'tool_done'; taskId: string; name: string; error?: string }
  | { type: 'done'; taskId: string; outputRef: string }
  | { type: 'error'; taskId: string; message: string }
  | { type: 'resumed'; taskId: string; followUp: string }
  | { type: 'forked'; taskId: string; parentTaskId: string };

export interface RunSubAgentOptions {
  sessionId: string;
  taskType: TaskType;
  description: string;
  prompt: string;
  allowedTools?: string[];
  /** Per-call system-prompt override. Falls back to WORKER_SYSTEM_PROMPT. */
  systemPromptOverride?: string;
  /** Resolve an `AgentProfile` by name (supplies systemPrompt/allowedTools). */
  agentName?: string;
  onEvent?: (ev: SubAgentEvent) => void;
  signal?: AbortSignal;
}

export interface ResumeSubAgentOptions {
  sessionId: string;
  taskId: string;
  followUp: string;
  onEvent?: (ev: SubAgentEvent) => void;
  signal?: AbortSignal;
}

export interface ForkSubAgentOptions {
  sessionId: string;
  /** Task to fork from — its transcript becomes the new worker's seed history. */
  parentTaskId: string;
  /** Task type for the forked worker. Defaults to parent's type. */
  taskType?: TaskType;
  description: string;
  prompt: string;
  allowedTools?: string[];
  systemPromptOverride?: string;
  agentName?: string;
  onEvent?: (ev: SubAgentEvent) => void;
  signal?: AbortSignal;
}

export interface SubAgentRuntime {
  run(opts: RunSubAgentOptions): Promise<{ taskId: string; output: string }>;
  resume(opts: ResumeSubAgentOptions): Promise<{ taskId: string; output: string }>;
  fork(opts: ForkSubAgentOptions): Promise<{ taskId: string; output: string }>;
  stop(taskId: string): void;
  running(sessionId: string): number;
  /** Exposed for debugging / tests — not part of the public surface. */
  transcripts(): TaskTranscriptStore;
}

export interface SubAgentRuntimeConfig {
  /** Base config cloned for each worker. `systemPrompt` is overridden per-run. */
  agentConfigBase: AgentConfig;
  sessions: AgentSessionStore;
  taskOutput: TaskOutputStore;
  maxConcurrentPerSession?: number;
  /**
   * Registry of named agent profiles the runtime can resolve by `agentName`.
   * Optional — if empty, only direct `taskType` + `systemPromptOverride`
   * selection is supported.
   */
  agentProfiles?: AgentProfile[];
  /** Inject a custom transcript store (tests). Defaults to in-memory. */
  transcripts?: TaskTranscriptStore;
}

/** Internal: pick the system prompt + tool allowlist for a run. */
function resolveAgentSelection(
  cfg: SubAgentRuntimeConfig,
  agentName: string | undefined,
  systemPromptOverride: string | undefined,
  allowedTools: string[] | undefined
): {
  systemPrompt: string;
  allowedTools: string[] | undefined;
  profile?: AgentProfile;
} {
  if (agentName) {
    const profile = (cfg.agentProfiles ?? []).find((p) => p.name === agentName);
    if (!profile) {
      agentsLog.warn('agent profile not found', { agentName });
    } else {
      return {
        systemPrompt:
          systemPromptOverride ?? profile.systemPrompt ?? WORKER_SYSTEM_PROMPT,
        allowedTools: allowedTools ?? profile.allowedTools,
        profile,
      };
    }
  }
  return {
    systemPrompt: systemPromptOverride ?? WORKER_SYSTEM_PROMPT,
    allowedTools,
  };
}

export function createSubAgentRuntime(
  cfg: SubAgentRuntimeConfig
): SubAgentRuntime {
  const maxConcurrent =
    cfg.maxConcurrentPerSession ?? MAX_CONCURRENT_SUBAGENTS;
  const abortMap = new Map<string, AbortController>();
  const transcripts = cfg.transcripts ?? createTaskTranscriptStore();

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

  /**
   * Core worker-drive routine. Shared by `run`, `resume`, and `fork` — each
   * caller sets up the transcript + record appropriately, then invokes this.
   */
  async function drive(opts: {
    sessionId: string;
    taskId: string;
    description: string;
    prompt: string;
    systemPrompt: string;
    allowedTools: string[] | undefined;
    seedHistory?: ReturnType<TaskTranscriptStore['toChatHistory']>;
    onEvent?: (ev: SubAgentEvent) => void;
    parentSignal?: AbortSignal;
    record: TaskRecord;
  }): Promise<string> {
    const {
      sessionId,
      taskId,
      description,
      prompt,
      systemPrompt,
      allowedTools,
      seedHistory,
      onEvent,
      parentSignal,
      record,
    } = opts;

    const ctrl = new AbortController();
    abortMap.set(taskId, ctrl);
    const onParentAbort = () => ctrl.abort();
    parentSignal?.addEventListener('abort', onParentAbort);

    const workerAgent: Agent = createAgent({
      ...cfg.agentConfigBase,
      systemPrompt,
    });

    const chatOpts: ChatOptions = {
      allowedTools,
      history: seedHistory,
      signal: ctrl.signal,
      onStreamChunk: async (chunk) => {
        onEvent?.({ type: 'chunk', taskId, text: chunk });
        try {
          await cfg.taskOutput.write(sessionId, taskId, chunk);
        } catch {
          // non-fatal
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
    record.startedAt = record.startedAt ?? Date.now();

    try {
      const finalText = await workerAgent.chat(prompt, chatOpts);
      try {
        await cfg.taskOutput.write(
          sessionId,
          taskId,
          finalText.endsWith('\n') ? finalText : finalText + '\n'
        );
      } catch {
        /* ignore */
      }
      transcripts.appendAssistant(taskId, finalText);
      record.status = 'completed';
      record.finishedAt = Date.now();
      agentsLog.info('sub-agent done', {
        sessionId,
        taskId,
        durationMs:
          record.finishedAt - (record.startedAt ?? record.finishedAt),
        outputChars: finalText.length,
        outputRef: record.outputPath,
        description,
      });
      onEvent?.({ type: 'done', taskId, outputRef: record.outputPath });
      return finalText;
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
      parentSignal?.removeEventListener('abort', onParentAbort);
    }
  }

  return {
    running: countRunning,
    transcripts: () => transcripts,

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
        agentName,
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

      const selection = resolveAgentSelection(
        cfg,
        agentName,
        systemPromptOverride,
        allowedTools
      );

      const taskId = generateTaskId(taskType);
      const outputPath = cfg.taskOutput.pathFor(sessionId, taskId);

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
      transcripts.start(taskId, prompt);

      agentsLog.info('sub-agent spawn', {
        sessionId,
        taskId,
        taskType,
        description,
        promptChars: prompt.length,
        allowedToolsCount: selection.allowedTools?.length ?? 0,
        agentName,
        profileResolved: Boolean(selection.profile),
      });
      onEvent?.({ type: 'start', taskId, description });

      const output = await drive({
        sessionId,
        taskId,
        description,
        prompt,
        systemPrompt: selection.systemPrompt,
        allowedTools: selection.allowedTools,
        onEvent,
        parentSignal: signal,
        record,
      });

      return { taskId, output };
    },

    async resume(opts) {
      const { sessionId, taskId, followUp, onEvent, signal } = opts;
      const state = cfg.sessions.get(sessionId);
      const record = state.tasks.get(taskId);
      if (!record) {
        throw new Error(`Task ${taskId} not found in session ${sessionId}.`);
      }
      if (record.status === 'running' || record.status === 'pending') {
        throw new Error(
          `Task ${taskId} is still ${record.status}; cannot resume until it completes.`
        );
      }

      if (countRunning(sessionId) >= maxConcurrent) {
        throw new Error(
          `Sub-agent concurrency limit reached for session ${sessionId} (max ${maxConcurrent}).`
        );
      }

      const seedHistory = transcripts.toChatHistory(taskId);
      transcripts.appendUser(taskId, followUp);

      agentsLog.info('sub-agent resume', {
        sessionId,
        taskId,
        priorEntries: seedHistory.length,
        followUpChars: followUp.length,
      });
      onEvent?.({ type: 'resumed', taskId, followUp });

      // Resume reuses the original profile selection: we don't have it stored
      // on the record, so default to WORKER_SYSTEM_PROMPT unless the profile
      // is re-resolvable from the task type alone.
      const output = await drive({
        sessionId,
        taskId,
        description: record.description,
        prompt: followUp,
        systemPrompt: WORKER_SYSTEM_PROMPT,
        allowedTools: undefined,
        seedHistory,
        onEvent,
        parentSignal: signal,
        record,
      });

      return { taskId, output };
    },

    async fork(opts) {
      const {
        sessionId,
        parentTaskId,
        description,
        prompt,
        allowedTools,
        systemPromptOverride,
        agentName,
        onEvent,
        signal,
      } = opts;

      const state = cfg.sessions.get(sessionId);
      const parent = state.tasks.get(parentTaskId);
      if (!parent) {
        throw new Error(
          `Parent task ${parentTaskId} not found in session ${sessionId}.`
        );
      }

      if (countRunning(sessionId) >= maxConcurrent) {
        throw new Error(
          `Sub-agent concurrency limit reached for session ${sessionId} (max ${maxConcurrent}).`
        );
      }

      const selection = resolveAgentSelection(
        cfg,
        agentName,
        systemPromptOverride,
        allowedTools
      );

      const taskType = opts.taskType ?? parent.type;
      const childId = generateTaskId(taskType);
      const outputPath = cfg.taskOutput.pathFor(sessionId, childId);

      const record: TaskRecord = {
        id: childId,
        type: taskType,
        status: 'pending',
        description,
        prompt,
        outputPath,
        sessionId,
        createdAt: Date.now(),
      };
      state.tasks.set(childId, record);

      // Seed the child's transcript with the parent's full history + the
      // new user prompt. The child inherits context but has its own record.
      const parentEntries = transcripts.entries(parentTaskId);
      transcripts.start(childId, prompt, parentEntries);

      const seedHistory = transcripts
        .toChatHistory(childId)
        // Last entry is the new user prompt; strip it since chat() will append
        // the prompt itself. We want only the parent-inherited history.
        .slice(0, -1);

      agentsLog.info('sub-agent fork', {
        sessionId,
        parentTaskId,
        childId,
        taskType,
        seedEntries: seedHistory.length,
      });
      onEvent?.({ type: 'forked', taskId: childId, parentTaskId });
      onEvent?.({ type: 'start', taskId: childId, description });

      const output = await drive({
        sessionId,
        taskId: childId,
        description,
        prompt,
        systemPrompt: selection.systemPrompt,
        allowedTools: selection.allowedTools,
        seedHistory,
        onEvent,
        parentSignal: signal,
        record,
      });

      return { taskId: childId, output };
    },
  };
}
