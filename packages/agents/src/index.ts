// ── Types ─────────────────────────────────────────────────────────────────
export type {
  TaskType,
  TaskStatus,
  TaskRecord,
} from './lib/Task.js';
export {
  TERMINAL_TASK_STATUSES,
  isTerminalTaskStatus,
  generateTaskId,
} from './lib/Task.js';

export type {
  TodoStatus,
  TodoItem,
  PlanModeState,
  AgentSessionState,
  AgentSessionStoreOptions,
} from './lib/sessionState.js';
export { AgentSessionStore } from './lib/sessionState.js';

export type { TaskTypeMetadata } from './lib/tasks.js';
export { getAllTaskTypes, getTaskTypeMetadata } from './lib/tasks.js';

// ── Output store ──────────────────────────────────────────────────────────
export type {
  TaskOutputStore,
  TaskOutputStoreOptions,
} from './lib/output/store.js';
export { createTaskOutputStore } from './lib/output/store.js';

// ── Sub-agent runtime ─────────────────────────────────────────────────────
export type {
  SubAgentEvent,
  SubAgentRuntime,
  SubAgentRuntimeConfig,
  RunSubAgentOptions,
} from './lib/runtime/runAgent.js';
export { createSubAgentRuntime } from './lib/runtime/runAgent.js';

// ── Coordinator mode ──────────────────────────────────────────────────────
export type { CoordinatorOptions } from './lib/coordinator/createCoordinatorAgent.js';
export {
  createCoordinatorAgent,
  COORDINATOR_ONLY_TOOLS,
  filterToolsForCoordinatorMode,
} from './lib/coordinator/createCoordinatorAgent.js';

// ── Plan approval ─────────────────────────────────────────────────────────
export type { PlanDecision, PlanApprovalBroker } from './lib/planApproval.js';
export {
  autoApproveBroker,
  createInMemoryPlanApprovalBroker,
} from './lib/planApproval.js';

// ── Tool registration ─────────────────────────────────────────────────────
export type { RegisterAgentToolsDeps } from './lib/tools/register.js';
export { registerAgentTools } from './lib/tools/register.js';

// ── Prompts (exposed for app-level system-prompt composition) ─────────────
export {
  TODO_WRITE_PROMPT,
  TODO_WRITE_DESCRIPTION,
  ENTER_PLAN_MODE_PROMPT,
  ENTER_PLAN_MODE_DESCRIPTION,
  EXIT_PLAN_MODE_PROMPT,
  EXIT_PLAN_MODE_DESCRIPTION,
  AGENT_TOOL_PROMPT,
  AGENT_TOOL_DESCRIPTION,
  COORDINATOR_SYSTEM_PROMPT,
  WORKER_SYSTEM_PROMPT,
  TASK_CREATE_PROMPT,
  TASK_LIST_PROMPT,
  TASK_GET_PROMPT,
  TASK_UPDATE_PROMPT,
  TASK_STOP_PROMPT,
  TASK_OUTPUT_PROMPT,
} from './lib/prompts/index.js';

// ── Constants ─────────────────────────────────────────────────────────────
export {
  TOOL_NAME_TOKENS,
  TASK_OUTPUT_MAX_BYTES,
  MAX_CONCURRENT_SUBAGENTS,
  AGENT_SESSION_IDLE_TTL_MS,
} from './lib/constants.js';
export type { ToolNameToken } from './lib/constants.js';

// ── Logging ───────────────────────────────────────────────────────────────
export { agentsLog } from './lib/log.js';
export type { LogLevel } from './lib/log.js';
