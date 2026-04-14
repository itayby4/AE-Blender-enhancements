/**
 * @pipefx/tasks — Pure reducer functions for computing task state from events.
 *
 * These reducers are used by BOTH the backend (to materialize task rows
 * from the event log) and the frontend (to maintain local state from
 * the SSE event stream). Using the same reducer guarantees consistency.
 *
 * All functions are pure — no side effects, no I/O, fully testable.
 */

import type { TaskDTO, TaskStep, TaskStatus } from './types.js';
import type { TaskEvent } from './events.js';

// ──────────────────────── Helpers ────────────────────────

/** Compute the overall task status from its step statuses. */
export function deriveTaskStatus(steps: TaskStep[]): TaskStatus {
  if (steps.length === 0) return 'pending';
  const hasError = steps.some((s) => s.status === 'error');
  if (hasError) return 'error';
  const allDone = steps.every((s) => s.status === 'done');
  if (allDone) return 'done';
  const hasInProgress = steps.some((s) => s.status === 'in-progress');
  if (hasInProgress) return 'in-progress';
  return 'pending';
}

/** Create a fresh TaskDTO from a task_created event. */
function createEmptyTask(
  taskId: string,
  name: string,
  steps: string[],
  timestamp: number,
  projectId?: string,
  sessionId?: string
): TaskDTO {
  return {
    id: taskId,
    projectId: projectId ?? null,
    sessionId: sessionId ?? null,
    name,
    status: 'pending',
    steps: steps.map((desc) => ({
      description: desc,
      status: 'pending' as TaskStatus,
    })),
    thoughts: [],
    resultSummary: null,
    createdAt: timestamp,
    completedAt: null,
  };
}

// ──────────────────────── Single Task Reducer ────────────────────────

/**
 * Apply a single event to a task's state.
 *
 * Returns the updated TaskDTO, or `undefined` if the event doesn't
 * apply to this task (e.g. different taskId) or creates no task.
 */
export function taskReducer(
  state: TaskDTO | undefined,
  event: TaskEvent
): TaskDTO | undefined {
  switch (event.type) {
    case 'task_created':
      return createEmptyTask(
        event.taskId,
        event.name,
        event.steps,
        event.timestamp,
        event.projectId,
        event.sessionId
      );

    case 'step_added': {
      if (!state) return state;
      const newStep: TaskStep = {
        description: event.description,
        status: event.status,
        startedAt: event.status === 'in-progress' ? event.timestamp : undefined,
      };
      const updatedSteps = [...state.steps, newStep];
      return {
        ...state,
        steps: updatedSteps,
        status: deriveTaskStatus(updatedSteps),
      };
    }

    case 'step_updated': {
      if (!state) return state;
      if (event.stepIndex < 0 || event.stepIndex >= state.steps.length) {
        return state;
      }
      const updatedSteps = state.steps.map((step, idx) => {
        if (idx !== event.stepIndex) return step;
        return {
          ...step,
          status: event.status,
          startedAt:
            event.status === 'in-progress'
              ? step.startedAt ?? event.timestamp
              : step.startedAt,
          completedAt:
            event.status === 'done' ||
            event.status === 'error' ||
            event.status === 'cancelled'
              ? event.timestamp
              : step.completedAt,
        };
      });
      return {
        ...state,
        steps: updatedSteps,
        status: deriveTaskStatus(updatedSteps),
      };
    }

    case 'thought': {
      if (!state) return state;
      return {
        ...state,
        thoughts: [...state.thoughts, event.content],
      };
    }

    case 'task_finished': {
      if (!state) return state;
      return {
        ...state,
        status: event.status,
        resultSummary: event.resultSummary ?? state.resultSummary,
        completedAt: event.timestamp,
      };
    }

    // tasks_cleared is handled at the collection level, not per-task
    case 'tasks_cleared':
      return state;

    default:
      return state;
  }
}

// ──────────────────────── Collection Reducer ────────────────────────

/**
 * Apply a single event to the full tasks collection.
 *
 * Returns a new Map (immutable update) with the event applied.
 * This is the reducer used by the frontend SSE handler.
 */
export function tasksReducer(
  state: Map<string, TaskDTO>,
  event: TaskEvent
): Map<string, TaskDTO> {
  if (event.type === 'tasks_cleared') {
    return new Map();
  }

  // All other events operate on a specific taskId
  if (!('taskId' in event)) return state;

  const taskId = event.taskId;
  const currentTask = state.get(taskId);
  const updatedTask = taskReducer(currentTask, event);

  if (updatedTask === currentTask) return state;

  const newState = new Map(state);
  if (updatedTask) {
    newState.set(taskId, updatedTask);
  } else {
    newState.delete(taskId);
  }
  return newState;
}

/**
 * Convert a tasks Map to a sorted array (newest first).
 * Convenience helper for UI rendering.
 */
export function taskMapToSortedArray(tasks: Map<string, TaskDTO>): TaskDTO[] {
  return Array.from(tasks.values()).sort(
    (a, b) => b.createdAt - a.createdAt
  );
}
