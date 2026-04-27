/**
 * Plan approval broker.
 *
 * EnterPlanMode's handler needs to pause the agent loop until the user
 * accepts or rejects the proposed plan. The broker is the integration seam:
 *  - The desktop UI receives a `plan_proposed` event from the chat SSE stream.
 *  - The user responds via a separate HTTP POST.
 *  - That POST calls `resolve()` here, unblocking the tool handler.
 *
 * A default no-op broker is provided so the package is usable standalone
 * and in tests. Production wiring should replace it with one that waits
 * for the UI response.
 */

import type { PlanApprovalBroker, PlanDecision } from '@pipefx/brain-contracts';
import { brainPlanningLog } from '../log.js';

export type { PlanApprovalBroker, PlanDecision };

/**
 * Default broker that auto-approves immediately. Useful for local dev and
 * tests; MUST be replaced in production wiring with an interactive broker.
 */
export const autoApproveBroker: PlanApprovalBroker = {
  async request() {
    return { approved: true };
  },
  resolve() {
    /* no-op */
  },
};

/**
 * In-memory broker that parks requests and resolves when the desktop posts
 * its decision. Wired by the backend; the package ships the interface and
 * this default implementation.
 */
export function createInMemoryPlanApprovalBroker(): PlanApprovalBroker {
  const pending = new Map<string, (d: PlanDecision) => void>();
  const key = (sid: string, tid: string) => `${sid}::${tid}`;

  return {
    request(sessionId, taskId) {
      brainPlanningLog.info('plan-broker park', { sessionId, taskId });
      return new Promise<PlanDecision>((resolve) => {
        pending.set(key(sessionId, taskId), resolve);
      });
    },
    resolve(sessionId, taskId, decision) {
      const k = key(sessionId, taskId);
      const r = pending.get(k);
      if (r) {
        pending.delete(k);
        brainPlanningLog.info('plan-broker resolve', {
          sessionId,
          taskId,
          approved: decision.approved,
        });
        r(decision);
      } else {
        brainPlanningLog.warn('plan-broker resolve (no match)', { sessionId, taskId });
      }
    },
  };
}
