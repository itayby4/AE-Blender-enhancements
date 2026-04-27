export const TOOL_NAME_TOKENS = {
  TODO_WRITE: 'TodoWrite',
  ENTER_PLAN_MODE: 'EnterPlanMode',
  EXIT_PLAN_MODE: 'ExitPlanMode',
  AGENT: 'Agent',
  TASK_CREATE: 'TaskCreate',
  TASK_LIST: 'TaskList',
  TASK_GET: 'TaskGet',
  TASK_UPDATE: 'TaskUpdate',
  TASK_STOP: 'TaskStop',
  TASK_OUTPUT: 'TaskOutput',
} as const;

export type ToolNameToken = (typeof TOOL_NAME_TOKENS)[keyof typeof TOOL_NAME_TOKENS];

export const TASK_OUTPUT_MAX_BYTES = 2 * 1024 * 1024; // 2 MB

export const MAX_CONCURRENT_SUBAGENTS = 3;

export const AGENT_SESSION_IDLE_TTL_MS = 60 * 60 * 1000; // 1 hour
