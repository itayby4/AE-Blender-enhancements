import type { ConnectorRegistry } from '@pipefx/mcp';
import { TOOL_NAME_TOKENS } from '../constants.js';
import { agentsLog } from '../log.js';
import {
  ENTER_PLAN_MODE_DESCRIPTION,
  ENTER_PLAN_MODE_INPUT_SCHEMA,
  EXIT_PLAN_MODE_DESCRIPTION,
  EXIT_PLAN_MODE_INPUT_SCHEMA,
} from '../prompts/index.js';
import type { AgentSessionStore } from '../sessionState.js';
import type { PlanApprovalBroker } from '../planApproval.js';

export interface PlanModeDeps {
  sessions: AgentSessionStore;
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
  agentsLog.info('register tool', { tool: TOOL_NAME_TOKENS.ENTER_PLAN_MODE });
  agentsLog.info('register tool', { tool: TOOL_NAME_TOKENS.EXIT_PLAN_MODE });

  registry.registerLocalTool(
    TOOL_NAME_TOKENS.ENTER_PLAN_MODE,
    ENTER_PLAN_MODE_DESCRIPTION,
    ENTER_PLAN_MODE_INPUT_SCHEMA as unknown as Record<string, unknown>,
    async (args) => {
      const sessionId = deps.getSessionId();
      if (!sessionId) {
        agentsLog.warn('EnterPlanMode rejected', { reason: 'no-session' });
        return 'No active session — cannot enter plan mode.';
      }

      const plan = (args as { plan?: string }).plan;
      if (!plan || typeof plan !== 'string') {
        agentsLog.warn('EnterPlanMode rejected', {
          sessionId,
          reason: 'empty-plan',
        });
        return 'Rejected: `plan` must be a non-empty string.';
      }

      const state = deps.sessions.get(sessionId);
      // Use the session id + a monotonic suffix for the plan "task".
      const planTaskId = `plan-${Date.now().toString(36)}`;
      state.planMode = { active: true, plan };
      agentsLog.info('EnterPlanMode proposed', {
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
      agentsLog.info('EnterPlanMode resolved', {
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
      agentsLog.info('ExitPlanMode', { sessionId, reason });
      return `Exited plan mode: ${reason}`;
    }
  );
}
