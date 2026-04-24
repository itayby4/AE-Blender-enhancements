// ── Types ─────────────────────────────────────────────────────────────────
export type {
  TaskType,
  TaskStatus,
  TaskId,
  TaskRecord,
  TaskTypeMetadata,
  TodoStatus,
  TodoItem,
  PlanModeState,
  AgentSessionState,
  AgentProfile,
  TranscriptEntry,
  ChatHistoryEntry,
  SubAgentEvent,
  RunSubAgentOptions,
  ForkSubAgentOptions,
  PlanDecision,
  PlanApprovalBroker,
  CallFingerprint,
  SelfCheckState,
  MemoryRef,
  PlanRef,
  SubAgentHandle,
  Step,
} from './lib/types.js';
export { TERMINAL_TASK_STATUSES, isTerminalTaskStatus } from './lib/types.js';

// ── Constants ─────────────────────────────────────────────────────────────
export {
  TOOL_NAME_TOKENS,
  TASK_OUTPUT_MAX_BYTES,
  MAX_CONCURRENT_SUBAGENTS,
  AGENT_SESSION_IDLE_TTL_MS,
} from './lib/constants.js';
export type { ToolNameToken } from './lib/constants.js';

// ── Events ────────────────────────────────────────────────────────────────
export type {
  BrainTaskStartedEvent,
  BrainTaskStepEvent,
  BrainTaskFinishedEvent,
  BrainPlanRequestedEvent,
  BrainPlanApprovedEvent,
  BrainPlanRejectedEvent,
  BrainSubAgentForkedEvent,
  BrainSubAgentResumedEvent,
  BrainSubAgentCompletedEvent,
  BrainTaskEvent,
  BrainPlanEvent,
  BrainSubAgentEvent,
  BrainEvent,
} from './lib/events.js';

// ── API interfaces ────────────────────────────────────────────────────────
export type {
  BrainLoopApi,
  TasksApi,
  MemoryApi,
  PlanningApi,
  SubAgentsApi,
} from './lib/api.js';
