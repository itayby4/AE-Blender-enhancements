// ── Task model ────────────────────────────────────────────────────────────

export type TaskType =
  | 'local_bash'
  | 'local_agent'
  | 'remote_agent'
  | 'in_process_teammate'
  | 'local_workflow'
  | 'monitor_mcp'
  | 'dream';

export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'killed';

export const TERMINAL_TASK_STATUSES: readonly TaskStatus[] = [
  'completed',
  'failed',
  'killed',
];

export function isTerminalTaskStatus(status: TaskStatus): boolean {
  return TERMINAL_TASK_STATUSES.includes(status);
}

export type TaskId = string;

export interface TaskRecord {
  id: TaskId;
  type: TaskType;
  status: TaskStatus;
  description: string;
  prompt: string;
  outputPath: string;
  sessionId: string;
  createdAt: number;
  startedAt?: number;
  finishedAt?: number;
  error?: string;
  notified?: boolean;
}

export interface TaskTypeMetadata {
  type: TaskType;
  label: string;
  whenToUse: string;
  allowedTools: string[] | 'inherit';
}

// ── Todo / plan-mode session state ────────────────────────────────────────

export type TodoStatus = 'pending' | 'in_progress' | 'completed';

export interface TodoItem {
  content: string;
  activeForm: string;
  status: TodoStatus;
}

export interface PlanModeState {
  active: boolean;
  plan?: string;
  approved?: boolean;
  feedback?: string;
}

export interface AgentSessionState {
  sessionId: string;
  todos: TodoItem[];
  planMode: PlanModeState;
  tasks: Map<TaskId, TaskRecord>;
  lastUpdated: number;
}

// ── Agent profiles ────────────────────────────────────────────────────────

export interface AgentProfile {
  name: string;
  type: TaskType;
  whenToUse: string;
  systemPrompt?: string;
  allowedTools?: string[];
}

// ── Task transcript types ─────────────────────────────────────────────────

export interface TranscriptEntry {
  role: 'user' | 'assistant';
  text: string;
}

export interface ChatHistoryEntry {
  role: 'user' | 'model';
  parts: { text: string }[];
}

// ── Sub-agent event stream ────────────────────────────────────────────────

export type SubAgentEvent =
  | { type: 'start'; taskId: TaskId; description: string }
  | { type: 'chunk'; taskId: TaskId; text: string }
  | { type: 'tool_start'; taskId: TaskId; name: string; args: unknown }
  | { type: 'tool_done'; taskId: TaskId; name: string; error?: string }
  | { type: 'done'; taskId: TaskId; outputRef: string }
  | { type: 'error'; taskId: TaskId; message: string }
  | { type: 'resumed'; taskId: TaskId; followUp: string }
  | { type: 'forked'; taskId: TaskId; parentTaskId: TaskId };

// ── Sub-agent run options ─────────────────────────────────────────────────

export interface RunSubAgentOptions {
  sessionId: string;
  taskType: TaskType;
  description: string;
  prompt: string;
  allowedTools?: string[];
  systemPromptOverride?: string;
  agentName?: string;
  onEvent?: (ev: SubAgentEvent) => void;
  signal?: AbortSignal;
}

export interface ForkSubAgentOptions {
  sessionId: string;
  parentTaskId: TaskId;
  taskType?: TaskType;
  description: string;
  prompt: string;
  allowedTools?: string[];
  systemPromptOverride?: string;
  agentName?: string;
  onEvent?: (ev: SubAgentEvent) => void;
  signal?: AbortSignal;
}

// ── Plan approval ─────────────────────────────────────────────────────────

export interface PlanDecision {
  approved: boolean;
  feedback?: string;
}

export interface PlanApprovalBroker {
  request(sessionId: string, taskId: TaskId, plan: string): Promise<PlanDecision>;
  resolve(sessionId: string, taskId: TaskId, decision: PlanDecision): void;
}

// ── Self-check state ──────────────────────────────────────────────────────

export interface CallFingerprint {
  round: number;
  key: string;
  isError: boolean;
}

export interface SelfCheckState {
  roundsSinceLastTodoWrite: number;
  recentCalls: CallFingerprint[];
}

// ── Future-phase stubs (Phase 5+) ─────────────────────────────────────────

/** Opaque reference to a stored memory entry. */
export type MemoryRef = string;

/** Opaque reference to an active or archived plan. */
export type PlanRef = string;

/** Handle returned when a sub-agent is forked or spawned. */
export interface SubAgentHandle {
  taskId: TaskId;
  sessionId: string;
}

/** A single step in an approved plan. */
export interface Step {
  index: number;
  description: string;
  status: 'pending' | 'active' | 'done' | 'skipped';
}
