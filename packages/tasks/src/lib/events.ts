/**
 * @pipefx/tasks — Task event definitions for event sourcing.
 *
 * Every task mutation is represented as an immutable event. Events are
 * appended to a log (SQLite `task_events` table) and streamed over SSE.
 * The current task state is computed by folding events through `taskReducer`.
 *
 * This is a discriminated union on the `type` field.
 */

import type { TaskStatus } from './types.js';

// ──────────────────────── Event Types ────────────────────────

/** A new task was created with an initial list of planned steps. */
export interface TaskCreatedEvent {
  type: 'task_created';
  taskId: string;
  name: string;
  steps: string[];
  projectId?: string;
  sessionId?: string;
  timestamp: number;
}

/** A new step was dynamically added to an existing task. */
export interface StepAddedEvent {
  type: 'step_added';
  taskId: string;
  description: string;
  status: TaskStatus;
  timestamp: number;
}

/** An existing step's status changed. */
export interface StepUpdatedEvent {
  type: 'step_updated';
  taskId: string;
  stepIndex: number;
  status: TaskStatus;
  timestamp: number;
}

/** AI emitted a Chain of Thought reasoning fragment. */
export interface ThoughtEvent {
  type: 'thought';
  taskId: string;
  content: string;
  timestamp: number;
}

/** The task reached a terminal state (done, error, or cancelled). */
export interface TaskFinishedEvent {
  type: 'task_finished';
  taskId: string;
  status: 'done' | 'error' | 'cancelled';
  resultSummary?: string;
  timestamp: number;
}

/** All tasks were cleared (user-initiated reset). */
export interface TasksClearedEvent {
  type: 'tasks_cleared';
  timestamp: number;
}

// ──────────────────────── Union ────────────────────────

/** Discriminated union of all task events. */
export type TaskEvent =
  | TaskCreatedEvent
  | StepAddedEvent
  | StepUpdatedEvent
  | ThoughtEvent
  | TaskFinishedEvent
  | TasksClearedEvent;
