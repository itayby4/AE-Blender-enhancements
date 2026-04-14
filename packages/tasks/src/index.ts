/**
 * @pipefx/tasks — Shared task domain model.
 *
 * Provides canonical type definitions, event types, and pure reducer
 * functions for the event-sourced task management system.
 *
 * Used by both `@pipefx/backend` (storage + SSE streaming) and
 * `@pipefx/desktop` (UI state management).
 */

// Types
export type { TaskStatus, TaskStep, TaskDTO } from './lib/types.js';

// Events
export type {
  TaskEvent,
  TaskCreatedEvent,
  StepAddedEvent,
  StepUpdatedEvent,
  ThoughtEvent,
  TaskFinishedEvent,
  TasksClearedEvent,
} from './lib/events.js';

// Reducers & helpers
export {
  taskReducer,
  tasksReducer,
  deriveTaskStatus,
  taskMapToSortedArray,
} from './lib/reducer.js';
