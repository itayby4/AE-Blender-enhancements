// ── Plan approval ─────────────────────────────────────────────────────────
export type { PlanApprovalBroker, PlanDecision } from './lib/domain/plan-approval.js';
export {
  autoApproveBroker,
  createInMemoryPlanApprovalBroker,
} from './lib/domain/plan-approval.js';

// ── Self-check reminder system ────────────────────────────────────────────
export type { SelfCheckState } from './lib/domain/self-check.js';
export {
  freshSelfCheckState,
  buildPostRoundReminder,
} from './lib/domain/self-check.js';

// ── Plan-mode prompts ─────────────────────────────────────────────────────
export {
  ENTER_PLAN_MODE_PROMPT,
  ENTER_PLAN_MODE_DESCRIPTION,
  ENTER_PLAN_MODE_INPUT_SCHEMA,
} from './lib/domain/prompts/enter-plan-mode.js';
export {
  EXIT_PLAN_MODE_PROMPT,
  EXIT_PLAN_MODE_DESCRIPTION,
  EXIT_PLAN_MODE_INPUT_SCHEMA,
} from './lib/domain/prompts/exit-plan-mode.js';

// ── Tool registration ─────────────────────────────────────────────────────
export type {
  PlanModeDeps,
  PlanModeSessionStore,
} from './lib/tools/register-plan-mode.js';
export { registerPlanModeTools } from './lib/tools/register-plan-mode.js';

// ── Backend routes ────────────────────────────────────────────────────────
export type {
  PlanningRouter,
  PlanningRouteDeps,
  PlanningSessionStore,
} from './lib/backend/routes/index.js';
export { mountPlanningRoutes } from './lib/backend/routes/index.js';

// ── Logging ───────────────────────────────────────────────────────────────
export { brainPlanningLog } from './lib/log.js';
