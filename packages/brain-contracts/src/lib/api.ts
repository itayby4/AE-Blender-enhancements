import type {
  AgentSessionState,
  ChatHistoryEntry,
  ForkSubAgentOptions,
  PlanDecision,
  RunSubAgentOptions,
  SubAgentEvent,
  TaskId,
} from './types.js';

// ── BrainLoopApi ──────────────────────────────────────────────────────────
// Implemented by @pipefx/brain-loop

export interface BrainLoopApi {
  chat(
    message: string,
    opts?: {
      sessionId?: string;
      allowedTools?: string[];
      history?: ChatHistoryEntry[];
      signal?: AbortSignal;
    }
  ): Promise<string>;
}

// ── TasksApi ──────────────────────────────────────────────────────────────
// Implemented by @pipefx/brain-tasks

export interface TasksApi {
  getSession(sessionId: string): AgentSessionState;
  hasSession(sessionId: string): boolean;
  deleteSession(sessionId: string): void;
}

// ── MemoryApi ─────────────────────────────────────────────────────────────
// Implemented by @pipefx/brain-memory

export interface MemoryApi {
  remember(namespace: string, key: string, value: string): void;
  recall(namespace: string, key: string): string | undefined;
  forget(namespace: string, key: string): void;
  list(namespace: string): Record<string, string>;
  deleteNamespace(namespace: string): void;
}

// ── PlanningApi ───────────────────────────────────────────────────────────
// Implemented by @pipefx/brain-planning

export interface PlanningApi {
  requestApproval(
    sessionId: string,
    taskId: TaskId,
    plan: string
  ): Promise<PlanDecision>;
  resolveApproval(
    sessionId: string,
    taskId: TaskId,
    decision: PlanDecision
  ): void;
}

// ── SubAgentsApi ──────────────────────────────────────────────────────────
// Implemented by @pipefx/brain-subagents

export interface SubAgentsApi {
  run(opts: RunSubAgentOptions): Promise<{ taskId: TaskId; output: string }>;
  resume(opts: {
    sessionId: string;
    taskId: TaskId;
    followUp: string;
    onEvent?: (ev: SubAgentEvent) => void;
    signal?: AbortSignal;
  }): Promise<{ taskId: TaskId; output: string }>;
  fork(opts: ForkSubAgentOptions): Promise<{ taskId: TaskId; output: string }>;
  stop(taskId: TaskId): void;
  running(sessionId: string): number;
}
