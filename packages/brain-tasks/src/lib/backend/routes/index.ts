import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AgentSessionStore } from '../../domain/session-store.js';
import type { TaskOutputStore } from '../../data/output-store.js';
import { brainTasksLog } from '../../log.js';

// Minimal router interface — structurally satisfied by apps/backend Router.
export interface AgentTaskRouter {
  get(
    path: string,
    handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>,
    prefix?: boolean
  ): unknown;
}

export interface AgentTaskRouteDeps {
  agentSessions: AgentSessionStore;
  taskOutput: TaskOutputStore;
}

function jsonResponse(res: ServerResponse, data: unknown, status = 200): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function jsonError(res: ServerResponse, error: unknown, status = 500): void {
  const message = error instanceof Error ? error.message : String(error);
  jsonResponse(res, { error: message }, status);
}

export function mountAgentTaskRoutes(
  router: AgentTaskRouter,
  deps: AgentTaskRouteDeps
): void {
  // ── GET /agents/tasks/:id/output ──
  router.get(
    '/agents/tasks/',
    async (req, res) => {
      try {
        const url = new URL(req.url ?? '', 'http://localhost');
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
        brainTasksLog.error('GET /agents/tasks/:id/output', {
          error: err instanceof Error ? err.message : String(err),
        });
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
        brainTasksLog.error('GET /agents/sessions/:id/todos', {
          error: err instanceof Error ? err.message : String(err),
        });
        jsonError(res, err);
      }
    },
    /* prefix */ true
  );
}
