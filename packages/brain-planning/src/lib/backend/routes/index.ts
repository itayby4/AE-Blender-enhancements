import type { IncomingMessage, ServerResponse } from 'node:http';
import type {
  AgentSessionState,
  PlanApprovalBroker,
} from '@pipefx/brain-contracts';
import { brainPlanningLog } from '../../log.js';

// ── Minimal router shape — structurally satisfied by apps/backend Router. ──
export interface PlanningRouter {
  get(
    path: string,
    handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>,
    prefix?: boolean
  ): unknown;
  post(
    path: string,
    handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>,
    prefix?: boolean
  ): unknown;
  delete(
    path: string,
    handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>,
    prefix?: boolean
  ): unknown;
}

/**
 * Minimal structural interface for session-state access — satisfied by
 * `@pipefx/brain-tasks` `AgentSessionStore`.
 */
export interface PlanningSessionStore {
  has(sessionId: string): boolean;
  get(sessionId: string): AgentSessionState;
}

export interface PlanningRouteDeps {
  planBroker: PlanApprovalBroker;
  agentSessions: PlanningSessionStore;
}

// ── Helpers (inlined to avoid importing from backend) ──

function jsonResponse(res: ServerResponse, data: unknown, status = 200): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function jsonError(res: ServerResponse, error: unknown, status = 500): void {
  const message = error instanceof Error ? error.message : String(error);
  jsonResponse(res, { error: message }, status);
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/**
 * Mount planning HTTP routes:
 *  - POST /agents/plan-response — desktop PlanApprovalModal posts the user's
 *    approve/reject decision here; the broker resolves the pending
 *    EnterPlanMode tool-handler promise and the agent loop resumes.
 */
export function mountPlanningRoutes(
  router: PlanningRouter,
  deps: PlanningRouteDeps
): void {
  router.post('/agents/plan-response', async (req, res) => {
    try {
      const body = await readBody(req);
      const { sessionId, taskId, approved, feedback } = JSON.parse(body) as {
        sessionId?: string;
        taskId?: string;
        approved?: boolean;
        feedback?: string;
      };

      if (!sessionId || !taskId || typeof approved !== 'boolean') {
        brainPlanningLog.warn('POST /agents/plan-response rejected', {
          reason: 'missing-fields',
          hasSessionId: Boolean(sessionId),
          hasTaskId: Boolean(taskId),
          hasApproved: typeof approved === 'boolean',
        });
        jsonResponse(
          res,
          { error: 'sessionId, taskId, and approved are required' },
          400
        );
        return;
      }

      brainPlanningLog.info('POST /agents/plan-response', {
        sessionId,
        taskId,
        approved,
        hasFeedback: Boolean(feedback),
      });
      deps.planBroker.resolve(sessionId, taskId, { approved, feedback });

      // Mirror decision into session state so the UI snapshot stays coherent
      // even if the SSE stream was dropped between plan_proposed and the
      // user's response.
      if (deps.agentSessions.has(sessionId)) {
        const state = deps.agentSessions.get(sessionId);
        state.planMode = {
          active: false,
          plan: state.planMode.plan,
          approved,
          feedback,
        };
      }

      jsonResponse(res, { ok: true });
    } catch (err) {
      jsonError(res, err);
    }
  });
}
