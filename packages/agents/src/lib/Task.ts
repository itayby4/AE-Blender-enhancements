/**
 * Task type / status model, adapted from OpenClaude's src/Task.ts.
 *
 * A Task is a first-class, addressable, killable unit of work — typically an
 * agent or workflow spawned from the main conversation. Tasks write output
 * to a dedicated store (see ./output/store.ts) so their data stays out of
 * the parent conversation's context.
 */

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

/** Base fields every task record carries. */
export interface TaskRecord {
  id: string;
  type: TaskType;
  status: TaskStatus;
  description: string;
  prompt: string;
  /** Path on disk where this task's output is being streamed. */
  outputPath: string;
  /** Owning session (parent conversation). */
  sessionId: string;
  createdAt: number;
  startedAt?: number;
  finishedAt?: number;
  /** Populated on terminal error. */
  error?: string;
  /** One-character prefix plus 8 random alphanumerics. */
  notified?: boolean;
}

/**
 * Generate a task id: single-character type prefix + 8 random alphanumerics.
 *
 * The type prefix is a visual cue in logs/UI. Random suffix is crypto-lite
 * but is only used for uniqueness within a short-lived session; the output
 * file path still derives from sessionId + taskId so collisions across
 * sessions cannot co-locate files.
 */
export function generateTaskId(type: TaskType): string {
  const prefix = TASK_TYPE_PREFIX[type];
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let suffix = '';
  for (let i = 0; i < 8; i++) {
    suffix += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return `${prefix}${suffix}`;
}

const TASK_TYPE_PREFIX: Record<TaskType, string> = {
  local_bash: 'b',
  local_agent: 'a',
  remote_agent: 'r',
  in_process_teammate: 't',
  local_workflow: 'w',
  monitor_mcp: 'm',
  dream: 'd',
};
