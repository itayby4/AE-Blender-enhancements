// ── Agent loop glue ───────────────────────────────────────────────────────
export { createAgent } from './lib/domain/agent.js';
export type { AgentConfig } from './lib/domain/types.js';

// ── System-prompt building blocks ─────────────────────────────────────────
export { COORDINATOR_SYSTEM_PROMPT } from './lib/domain/prompts/coordinator.js';
export { WORKER_SYSTEM_PROMPT } from './lib/domain/prompts/worker.js';

// ── Logging ───────────────────────────────────────────────────────────────
export { brainLoopLog } from './lib/log.js';
