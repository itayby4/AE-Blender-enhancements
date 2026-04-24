import type { ConnectorRegistry } from '@pipefx/mcp';
import type {
  AgentSessionState,
  PlanApprovalBroker,
} from '@pipefx/brain-contracts';
import { TOOL_NAME_TOKENS } from '@pipefx/brain-contracts';
import { brainPlanningLog } from '../log.js';
import {
  ENTER_PLAN_MODE_DESCRIPTION,
  ENTER_PLAN_MODE_INPUT_SCHEMA,
} from '../domain/prompts/enter-plan-mode.js';
import {
  EXIT_PLAN_MODE_DESCRIPTION,
  EXIT_PLAN_MODE_INPUT_SCHEMA,
} from '../domain/prompts/exit-plan-mode.js';

/**
 * Minimal structural interface for session-state access — satisfied by
 * `@pipefx/brain-tasks` `AgentSessionStore` but declared locally so
 * brain-planning doesn't depend on a sibling brain package.
 */
export interface PlanModeSessionStore {
  get(sessionId: string): AgentSessionState;
}

export interface PlanModeDeps {
  sessions: PlanModeSessionStore;
  broker: PlanApprovalBroker;
  getSessionId: () => string | undefined;
  /** Fired when a plan is proposed — integration point for SSE `plan_proposed`. */
  onPlanProposed?: (sessionId: string, taskId: string, plan: string) => void;
  /** Fired when the user's decision arrives. */
  onPlanResolved?: (
    sessionId: string,
    taskId: string,
    approved: boolean,
    feedback?: string
  ) => void;
}

export function registerPlanModeTools(
  registry: ConnectorRegistry,
  deps: PlanModeDeps
): void {
  brainPlanningLog.info('register tool', { tool: TOOL_NAME_TOKENS.ENTER_PLAN_MODE });
  brainPlanningLog.info('register tool', { tool: TOOL_NAME_TOKENS.EXIT_PLAN_MODE });

  registry.registerLocalTool(
    TOOL_NAME_TOKENS.ENTER_PLAN_MODE,
    ENTER_PLAN_MODE_DESCRIPTION,
    ENTER_PLAN_MODE_INPUT_SCHEMA as unknown as Record<string, unknown>,
    async (args) => {
      const sessionId = deps.getSessionId();
      if (!sessionId) {
        brainPlanningLog.warn('EnterPlanMode rejected', { reason: 'no-session' });
        return 'No active session — cannot enter plan mode.';
      }

      const plan = (args as { plan?: string }).plan;
      if (!plan || typeof plan !== 'string') {
        brainPlanningLog.warn('EnterPlanMode rejected', {
          sessionId,
          reason: 'empty-plan',
        });
        return 'Rejected: `plan` must be a non-empty string.';
      }

      const state = deps.sessions.get(sessionId);

      // ── Anti-loop guard ──────────────────────────────────────────────
      // If a plan was already approved for this session, REFUSE re-entry.
      if (state.planMode.approved === true) {
        brainPlanningLog.warn('EnterPlanMode blocked', {
          sessionId,
          reason: 'already-approved',
        });
        return (
          'A plan has ALREADY been approved in this session. Do NOT call ' +
          `${TOOL_NAME_TOKENS.ENTER_PLAN_MODE} again. Execute the approved ` +
          'plan by calling the actual connector tools (run-script, ' +
          'add_timeline_marker, etc.) and track progress with ' +
          `${TOOL_NAME_TOKENS.TODO_WRITE}. If the mission is genuinely ` +
          `finished or the user cancelled, call ${TOOL_NAME_TOKENS.EXIT_PLAN_MODE}.`
        );
      }
      const planTaskId = `plan-${Date.now().toString(36)}`;
      state.planMode = { active: true, plan };
      brainPlanningLog.info('EnterPlanMode proposed', {
        sessionId,
        planTaskId,
        planChars: plan.length,
      });
      deps.onPlanProposed?.(sessionId, planTaskId, plan);

      const decision = await deps.broker.request(sessionId, planTaskId, plan);
      state.planMode = {
        active: false,
        plan,
        approved: decision.approved,
        feedback: decision.feedback,
      };
      brainPlanningLog.info('EnterPlanMode resolved', {
        sessionId,
        planTaskId,
        approved: decision.approved,
        hasFeedback: Boolean(decision.feedback),
      });
      deps.onPlanResolved?.(
        sessionId,
        planTaskId,
        decision.approved,
        decision.feedback
      );

      if (decision.approved) {
        return `Plan approved. Proceed with execution.${
          decision.feedback ? `\n\nUser note: ${decision.feedback}` : ''
        }`;
      }
      return `Plan rejected.${
        decision.feedback
          ? `\n\nUser feedback: ${decision.feedback}\n\nRevise and re-propose, or call ${TOOL_NAME_TOKENS.EXIT_PLAN_MODE} to abandon.`
          : `\n\nAsk the user what to change, revise, and re-propose.`
      }`;
    }
  );

  registry.registerLocalTool(
    TOOL_NAME_TOKENS.EXIT_PLAN_MODE,
    EXIT_PLAN_MODE_DESCRIPTION,
    EXIT_PLAN_MODE_INPUT_SCHEMA as unknown as Record<string, unknown>,
    async (args) => {
      const sessionId = deps.getSessionId();
      if (!sessionId) return 'No active session.';
      const reason = (args as { reason?: string }).reason ?? '(no reason given)';
      const state = deps.sessions.get(sessionId);
      state.planMode = { active: false };
      brainPlanningLog.info('ExitPlanMode', { sessionId, reason });
      return `Exited plan mode: ${reason}`;
    }
  );
}
