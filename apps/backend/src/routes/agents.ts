import type { Router } from '../router.js';
import type {
  AgentSessionStore,
} from '@pipefx/agents';
import type { TaskOutputStore } from '@pipefx/agents';
import { jsonResponse, jsonError } from '../router.js';

export interface AgentRouteDeps {
  agentSessions: AgentSessionStore;
  taskOutput: TaskOutputStore;
}

/**
 * Registers agent-system HTTP routes:
 *  - GET  /agents/tasks/:id/output — read a worker's streamed output file
 *    (accepts `?sessionId=...&tail=<bytes>` query params).
 *  - GET  /agents/sessions/:id/todos — snapshot of the session's todo list.
 *
 * Plan-response is mounted separately via `mountPlanningRoutes` from
 * `@pipefx/brain-planning`.
 */
export function registerAgentRoutes(router: Router, deps: AgentRouteDeps) {
  // ── GET /agents/tasks/:id/output ──
  router.get(
    '/agents/tasks/',
    async (req, res) => {
      try {
        const url = new URL(req.url ?? '', 'http://localhost');
        const parts = url.pathname.split('/').filter(Boolean);
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
