// ── Tool registry interface (avoids scope:mcp dep) ────────────────────────
export type { LocalToolRegistry } from './lib/domain/local-tool-registry.js';

// ── Domain ────────────────────────────────────────────────────────────────
export { generateTaskId } from './lib/domain/task.js';
export { AgentSessionStore } from './lib/domain/session-store.js';
export type { AgentSessionStoreOptions } from './lib/domain/session-store.js';
export { getAllTaskTypes, getTaskTypeMetadata } from './lib/domain/task-catalog.js';
export { createTaskTranscriptStore } from './lib/domain/task-transcripts.js';
export type { TaskTranscriptStore } from './lib/domain/task-transcripts.js';

// ── Data ──────────────────────────────────────────────────────────────────
export { createTaskOutputStore } from './lib/data/output-store.js';
export type { TaskOutputStore, TaskOutputStoreOptions } from './lib/data/output-store.js';

// ── Tools ─────────────────────────────────────────────────────────────────
export { registerTodoWrite } from './lib/domain/tools/todo-write.js';
export type { TodoWriteDeps } from './lib/domain/tools/todo-write.js';
export {
  TODO_WRITE_PROMPT,
  TODO_WRITE_DESCRIPTION,
  TODO_WRITE_INPUT_SCHEMA,
} from './lib/domain/tools/todo-write-prompts.js';

export { registerTaskTools } from './lib/domain/tools/task-tools.js';
export type { TaskToolsDeps } from './lib/domain/tools/task-tools.js';
export {
  buildTaskCreateDescription,
  buildTaskCreateInputSchema,
  TASK_CREATE_PROMPT,
  TASK_CREATE_DESCRIPTION,
  TASK_CREATE_INPUT_SCHEMA,
  TASK_LIST_PROMPT,
  TASK_LIST_DESCRIPTION,
  TASK_LIST_INPUT_SCHEMA,
  TASK_GET_PROMPT,
  TASK_GET_DESCRIPTION,
  TASK_GET_INPUT_SCHEMA,
  TASK_UPDATE_PROMPT,
  TASK_UPDATE_DESCRIPTION,
  TASK_UPDATE_INPUT_SCHEMA,
  TASK_STOP_PROMPT,
  TASK_STOP_DESCRIPTION,
  TASK_STOP_INPUT_SCHEMA,
  TASK_OUTPUT_PROMPT,
  TASK_OUTPUT_DESCRIPTION,
  TASK_OUTPUT_INPUT_SCHEMA,
} from './lib/domain/tools/task-tools-prompts.js';

// ── Backend routes ────────────────────────────────────────────────────────
export { mountAgentTaskRoutes } from './lib/backend/routes/index.js';
export type {
  AgentTaskRouter,
  AgentTaskRouteDeps,
} from './lib/backend/routes/index.js';

// ── Log ───────────────────────────────────────────────────────────────────
export { brainTasksLog } from './lib/log.js';
