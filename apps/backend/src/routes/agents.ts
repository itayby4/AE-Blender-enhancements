import type { Router } from '../router.js';
import type {
  AgentSessionStore,
  PlanApprovalBroker,
} from '@pipefx/agents';
import type { TaskOutputStore } from '@pipefx/agents';
import { agentsLog } from '@pipefx/agents';
import { readBody, jsonResponse, jsonError } from '../router.js';

export interface AgentRouteDeps {
  planBroker: PlanApprovalBroker;
  agentSessions: AgentSessionStore;
  taskOutput: TaskOutputStore;
}

/**
 * Registers agent-system HTTP routes:
 *  - POST /agents/plan-response — desktop PlanApprovalModal posts the user's
 *    approve/reject decision here; the broker resolves the pending
 *    EnterPlanMode tool-handler promise and the agent loop resumes.
 *  - GET  /agents/tasks/:id/output — read a worker's streamed output file
 *    (accepts `?sessionId=...&tail=<bytes>` query params).
 *  - GET  /agents/sessions/:id/todos — snapshot of the session's todo list.
 */
export function registerAgentRoutes(router: Router, deps: AgentRouteDeps) {
  // ── POST /agents/plan-response ──
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
        agentsLog.warn('POST /agents/plan-response rejected', {
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

      agentsLog.info('POST /agents/plan-response', {
        sessionId,
        taskId,
        approved,
        hasFeedback: Boolean(feedback),
      });
      deps.planBroker.resolve(sessionId, taskId, { approved, feedback });

      // Mirror decision into session state so the UI snapshot stays coherent
      // even if the SSE stream was dropped between plan_proposed and the
      // user's response. `get()` auto-bumps lastUpdated and returns an
      // initialised state if one doesn't exist yet.
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

  // ── GET /agents/tasks/:id/output ──
  // Path matches `/agents/tasks/<taskId>/output` with an optional query string.
  router.get(
    '/agents/tasks/',
    async (req, res) => {
      try {
        const url = new URL(req.url ?? '', 'http://localhost');
        // pathname is `/agents/tasks/<taskId>/output`
        const parts = url.pathname.split('/').filter(Boolean);
        // ['agents', 'tasks', '<taskId>', 'output']
        if (parts.length < 4 || parts[3] !== 'output') {
          jsonResponse(res, { error: 'Not found' }, 404);
          return;
        }
        const taskId = decodeURIComponent(parts[2]);
        const sessionId = url.searchParams.get('sessionId');
        if (!sessionId) {
          jsonResponse(res, { error: 'sessionId query param required' }, 400);
          return;
        }

        const tailParam = url.searchParams.get('tail');
        const content = tailParam
          ? await deps.taskOutput.tail(sessionId, taskId, Number(tailParam))
          : await deps.taskOutput.read(sessionId, taskId);

        jsonResponse(res, { taskId, sessionId, content });
      } catch (err) {
        jsonError(res, err);
      }
    },
    /* prefix */ true
  );

  // ── GET /agents/sessions/:id/todos ──
  router.get(
    '/agents/sessions/',
    async (req, res) => {
      try {
        const url = new URL(req.url ?? '', 'http://localhost');
        const parts = url.pathname.split('/').filter(Boolean);
        // ['agents', 'sessions', '<sessionId>', 'todos']
        if (parts.length < 4 || parts[3] !== 'todos') {
          jsonResponse(res, { error: 'Not found' }, 404);
          return;
        }
        const sessionId = decodeURIComponent(parts[2]);
        if (!deps.agentSessions.has(sessionId)) {
          jsonResponse(res, {
            sessionId,
            todos: [],
            planMode: { active: false },
          });
          return;
        }
        const state = deps.agentSessions.get(sessionId);
        jsonResponse(res, {
          sessionId,
          todos: state.todos,
          planMode: state.planMode,
        });
      } catch (err) {
        jsonError(res, err);
      }
    },
    /* prefix */ true
  );
}
