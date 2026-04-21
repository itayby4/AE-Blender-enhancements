/**
 * @pipefx/tasks — Canonical type definitions for the task domain model.
 *
 * These types are shared between backend (SQLite storage, SSE streaming)
 * and frontend (state management, UI rendering). They are the single
 * source of truth — no duplicates allowed elsewhere.
 */

/** The lifecycle status of a task or individual step. */
export type TaskStatus = 'pending' | 'in-progress' | 'done' | 'error' | 'cancelled';

/** A single step within a task's execution plan. */
export interface TaskStep {
  /** Human-readable description of what this step does. */
  description: string;

  /** Current status of this step. */
  status: TaskStatus;

  /** Epoch ms when this step started executing. */
  startedAt?: number;

  /** Epoch ms when this step completed (done, error, or cancelled). */
  completedAt?: number;
}

/**
 * Data Transfer Object for a task.
 *
 * This is the shape that flows over the wire (SSE, REST) and is used
 * by both backend and frontend. It can be computed from a stream of
 * TaskEvents via the `taskReducer`.
 */
export interface TaskDTO {
  /** Unique identifier (e.g. `chat-1713100000000` or `autopod-run-1`). */
  id: string;

  /** Associated project ID, if any. */
  projectId: string | null;

  /** Associated session ID, if any. */
  sessionId: string | null;

  /** Human-readable task name. */
  name: string;

  /** Overall task status (derived from step statuses). */
  status: TaskStatus;

  /** Ordered list of execution steps. */
  steps: TaskStep[];

  /** Chain of Thought — AI reasoning log visible to the user. */
  thoughts: string[];

  /** Summary of the task result (set on completion). */
  resultSummary: string | null;

  /** Epoch ms when the task was created. */
  createdAt: number;

  /** Epoch ms when the task completed (null if still running). */
  completedAt: number | null;
}
