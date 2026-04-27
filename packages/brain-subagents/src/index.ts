// ── Sub-agent runtime ─────────────────────────────────────────────────────
export type {
  SubAgentEvent,
  SubAgentRuntime,
  SubAgentRuntimeConfig,
  RunSubAgentOptions,
  ResumeSubAgentOptions,
  ForkSubAgentOptions,
} from './lib/domain/run-agent.js';
export { createSubAgentRuntime } from './lib/domain/run-agent.js';

// ── Built-in + user-loaded agent profiles ─────────────────────────────────
export type { AgentProfile } from './lib/domain/built-in-agents.js';
export {
  BUILT_IN_AGENTS,
  findBuiltInAgent,
} from './lib/domain/built-in-agents.js';
export {
  loadAgentsDir,
  composeProfiles,
} from './lib/domain/load-agents-dir.js';

// ── Coordinator mode ──────────────────────────────────────────────────────
export type { CoordinatorOptions } from './lib/domain/coordinator.js';
export {
  createCoordinatorAgent,
  COORDINATOR_ONLY_TOOLS,
  filterToolsForCoordinatorMode,
} from './lib/domain/coordinator.js';

// ── AgentTool prompts ─────────────────────────────────────────────────────
export {
  AGENT_TOOL_PROMPT,
  AGENT_TOOL_DESCRIPTION,
  AGENT_TOOL_INPUT_SCHEMA,
  buildAgentToolDescription,
  buildAgentToolInputSchema,
} from './lib/domain/prompts/agent-tool.js';

// ── Tool registration ─────────────────────────────────────────────────────
export type { AgentToolDeps } from './lib/tools/register-agent-tool.js';
export { registerAgentTool } from './lib/tools/register-agent-tool.js';

export type { RegisterAgentToolsDeps } from './lib/tools/register.js';
export { registerAgentTools } from './lib/tools/register.js';

// ── Logging ───────────────────────────────────────────────────────────────
export { brainSubagentsLog } from './lib/log.js';
export type { LogLevel } from './lib/log.js';
