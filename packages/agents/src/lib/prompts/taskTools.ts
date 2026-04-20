import { TOOL_NAME_TOKENS } from '../constants.js';

/**
 * Prompt + schema bundles for the Task* lifecycle tools.
 *
 * Kept together — they form one consistent toolset. Structure mirrors
 * OpenClaude's Task*Tool prompt files; prose rewritten. See ../../PROMPT_SOURCES.md.
 */

// ── TaskCreate ──────────────────────────────────────────────────────────────

export const TASK_CREATE_PROMPT = `Use ${TOOL_NAME_TOKENS.TASK_CREATE} to spawn a long-running or parallelizable worker. Prefer ${TOOL_NAME_TOKENS.AGENT} for one-shot scoped subtasks; use ${TOOL_NAME_TOKENS.TASK_CREATE} when you need the task to be independently addressable (kill-able, inspectable, persistent across a few turns).`;

export const TASK_CREATE_DESCRIPTION =
  'Spawn a new task. Returns a taskId you can use with TaskGet/TaskUpdate/TaskStop/TaskOutput.';

export const TASK_CREATE_INPUT_SCHEMA = {
  type: 'object',
  properties: {
    taskType: {
      type: 'string',
      enum: ['local_agent', 'local_workflow', 'monitor_mcp'],
    },
    description: {
      type: 'string',
      description: 'One-line label for the task, shown in UI.',
    },
    prompt: {
      type: 'string',
      description: 'Self-contained brief for the worker.',
    },
    allowedTools: {
      type: 'array',
      items: { type: 'string' },
      description:
        'Optional tool-name allowlist for the worker. Omit to inherit parent tool set.',
    },
  },
  required: ['taskType', 'description', 'prompt'],
} as const;

// ── TaskList ────────────────────────────────────────────────────────────────

export const TASK_LIST_PROMPT = `Use ${TOOL_NAME_TOKENS.TASK_LIST} to enumerate tasks in this session. Returns id, type, status, description, and timestamps — not the full output.`;

export const TASK_LIST_DESCRIPTION =
  'List tasks for this session. Does not return task output — use TaskOutput for that.';

export const TASK_LIST_INPUT_SCHEMA = {
  type: 'object',
  properties: {
    status: {
      type: 'string',
      enum: ['pending', 'running', 'completed', 'failed', 'killed'],
      description: 'Optional filter on task status.',
    },
  },
  required: [],
} as const;

// ── TaskGet ─────────────────────────────────────────────────────────────────

export const TASK_GET_PROMPT = `Use ${TOOL_NAME_TOKENS.TASK_GET} to inspect a single task's metadata by id.`;

export const TASK_GET_DESCRIPTION = 'Return metadata for one task by id.';

export const TASK_GET_INPUT_SCHEMA = {
  type: 'object',
  properties: { taskId: { type: 'string' } },
  required: ['taskId'],
} as const;

// ── TaskUpdate ──────────────────────────────────────────────────────────────

export const TASK_UPDATE_PROMPT = `Use ${TOOL_NAME_TOKENS.TASK_UPDATE} to send a follow-up instruction to a running task. The task's worker picks up the update and continues with the same context it already has.`;

export const TASK_UPDATE_DESCRIPTION =
  'Send follow-up instructions to a running task without killing it.';

export const TASK_UPDATE_INPUT_SCHEMA = {
  type: 'object',
  properties: {
    taskId: { type: 'string' },
    message: {
      type: 'string',
      description:
        'The follow-up instruction, treated as a new user message inside the task.',
    },
  },
  required: ['taskId', 'message'],
} as const;

// ── TaskStop ────────────────────────────────────────────────────────────────

export const TASK_STOP_PROMPT = `Use ${TOOL_NAME_TOKENS.TASK_STOP} the moment a task's direction is discarded. Don't let a worker keep burning tool calls on abandoned work.`;

export const TASK_STOP_DESCRIPTION = 'Kill a running task.';

export const TASK_STOP_INPUT_SCHEMA = {
  type: 'object',
  properties: { taskId: { type: 'string' } },
  required: ['taskId'],
} as const;

// ── TaskOutput ──────────────────────────────────────────────────────────────

export const TASK_OUTPUT_PROMPT = `Use ${TOOL_NAME_TOKENS.TASK_OUTPUT} to read a task's output file. Prefer tail when the output is large and only the recent bytes matter.`;

export const TASK_OUTPUT_DESCRIPTION =
  "Read a task's output. Pass bytes to tail the last N bytes instead of reading the whole file.";

export const TASK_OUTPUT_INPUT_SCHEMA = {
  type: 'object',
  properties: {
    taskId: { type: 'string' },
    bytes: {
      type: 'number',
      description: 'Optional — tail the last N bytes instead of reading all.',
    },
  },
  required: ['taskId'],
} as const;
