import { TOOL_NAME_TOKENS } from '@pipefx/brain-contracts';
import type { TaskTypeMetadata, AgentProfile } from '@pipefx/brain-contracts';

export function buildTaskCreateInputSchema(
  taskTypes: TaskTypeMetadata[],
  profiles: AgentProfile[]
): Record<string, unknown> {
  const typeEnum = taskTypes.map((t) => t.type);
  const agentNameEnum = profiles.map((p) => p.name);
  return {
    type: 'object',
    properties: {
      taskType: {
        type: 'string',
        enum: typeEnum.length > 0 ? typeEnum : ['local_agent'],
      },
      ...(agentNameEnum.length > 0 && {
        agentName: {
          type: 'string',
          enum: agentNameEnum,
          description:
            "Optional named profile that preconfigures the worker's system prompt and tool allowlist.",
        },
      }),
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
  };
}

export function buildTaskCreateDescription(
  taskTypes: TaskTypeMetadata[],
  profiles: AgentProfile[]
): string {
  const lines: string[] = [
    'Spawn a new task. Returns a taskId you can use with TaskGet/TaskUpdate/TaskStop/TaskOutput.',
  ];
  if (profiles.length) {
    lines.push('', 'Named agents:');
    for (const p of profiles) lines.push(`- ${p.name} (${p.type}): ${p.whenToUse}`);
  }
  if (taskTypes.length) {
    lines.push('', 'Task types:');
    for (const t of taskTypes) lines.push(`- ${t.type}: ${t.whenToUse}`);
  }
  const s = lines.join('\n');
  const MAX = 1000;
  return s.length <= MAX ? s : s.slice(0, MAX - 3) + '...';
}

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

export const TASK_GET_PROMPT = `Use ${TOOL_NAME_TOKENS.TASK_GET} to inspect a single task's metadata by id.`;

export const TASK_GET_DESCRIPTION = 'Return metadata for one task by id.';

export const TASK_GET_INPUT_SCHEMA = {
  type: 'object',
  properties: { taskId: { type: 'string' } },
  required: ['taskId'],
} as const;

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

export const TASK_STOP_PROMPT = `Use ${TOOL_NAME_TOKENS.TASK_STOP} the moment a task's direction is discarded. Don't let a worker keep burning tool calls on abandoned work.`;

export const TASK_STOP_DESCRIPTION = 'Kill a running task.';

export const TASK_STOP_INPUT_SCHEMA = {
  type: 'object',
  properties: { taskId: { type: 'string' } },
  required: ['taskId'],
} as const;

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
