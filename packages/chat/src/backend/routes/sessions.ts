// ── @pipefx/chat/backend/routes/sessions ────────────────────────────────
// REST shell over the ChatSessionStore + TranscriptStore ports. Keeps the
// chat package free of brain-memory imports — the concrete adapter is
// wired by apps/backend.

import { readBody, jsonResponse, jsonError } from '../internal/http.js';
import type { RouterLike } from '../internal/http.js';
import type {
  ChatSessionStore,
  TranscriptStore,
} from '../../contracts/index.js';

export interface SessionRouteDeps {
  sessions: ChatSessionStore;
  transcript: TranscriptStore;
}

/**
 * Registers REST endpoints for chat session persistence.
 *
 * GET  /api/sessions              → list sessions (optional ?projectId=)
 * GET  /api/sessions/latest       → get latest session (optional ?projectId=)
 * GET  /api/sessions/:id          → get session details
 * GET  /api/sessions/:id/messages → get messages (optional ?limit=&offset=)
 * POST /api/sessions              → create new session
 * POST /api/sessions/:id/title    → update session title
 * DELETE /api/sessions/:id        → delete session
 */
export function registerSessionRoutes(
  router: RouterLike,
  deps: SessionRouteDeps
) {
  const { sessions, transcript } = deps;

  // GET /api/sessions — list all sessions
  router.get('/api/sessions', async (req, res) => {
    try {
      const url = new URL(req.url!, `http://localhost`);
      const projectId = url.searchParams.get('projectId') || undefined;
      const limit = parseInt(url.searchParams.get('limit') || '50', 10);
      const list = sessions.list(projectId, limit);
      jsonResponse(res, list);
    } catch (err) {
      jsonError(res, err);
    }
  });

  // GET /api/sessions/latest — get the most recent session
  router.get('/api/sessions/latest', async (req, res) => {
    try {
      const url = new URL(req.url!, `http://localhost`);
      const projectId = url.searchParams.get('projectId') || undefined;
      const session = sessions.latest(projectId);
      jsonResponse(res, session);
    } catch (err) {
      jsonError(res, err);
    }
  });

  // GET /api/sessions/:id (prefix match — handles both /api/sessions/:id and /api/sessions/:id/messages)
  router.get('/api/sessions/', async (req, res) => {
    try {
      const urlPath = req.url!.split('?')[0];
      const parts = urlPath.replace('/api/sessions/', '').split('/');
      const sessionId = parts[0];
      const sub = parts[1]; // 'messages' or undefined

      if (!sessionId || sessionId === 'latest') {
        // Already handled by the explicit /latest route
        jsonResponse(res, { error: 'Session ID required' }, 400);
        return;
      }

      if (sub === 'messages') {
        // GET /api/sessions/:id/messages
        const url = new URL(req.url!, `http://localhost`);
        const limit = url.searchParams.get('limit')
          ? parseInt(url.searchParams.get('limit')!, 10)
          : undefined;
        const offset = url.searchParams.get('offset')
          ? parseInt(url.searchParams.get('offset')!, 10)
          : undefined;
        const messages = transcript.list(sessionId, { limit, offset });
        jsonResponse(res, messages);
      } else {
        // GET /api/sessions/:id
        const session = sessions.get(sessionId);
        if (!session) {
          jsonResponse(res, { error: 'Session not found' }, 404);
          return;
        }
        jsonResponse(res, session);
      }
    } catch (err) {
      jsonError(res, err);
    }
  }, true); // prefix match

  // POST /api/sessions — create new session
  router.post('/api/sessions', async (req, res) => {
    try {
      const body = await readBody(req);
      const { id, projectId, model } = JSON.parse(body);
      const sessionId = id || `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const session = sessions.create(sessionId, projectId, model);
      jsonResponse(res, session, 201);
    } catch (err) {
      jsonError(res, err);
    }
  });

  // POST /api/sessions/:id/title — update session title
  router.post('/api/sessions/', async (req, res) => {
    try {
      const urlPath = req.url!.split('?')[0];
      const parts = urlPath.replace('/api/sessions/', '').split('/');
      const sessionId = parts[0];
      const sub = parts[1];

      if (sub !== 'title') {
        jsonResponse(res, { error: 'Unknown action' }, 400);
        return;
      }

      const body = await readBody(req);
      const { title } = JSON.parse(body);
      if (!title) {
        jsonResponse(res, { error: 'title is required' }, 400);
        return;
      }

      sessions.rename(sessionId, title);
      jsonResponse(res, { success: true });
    } catch (err) {
      jsonError(res, err);
    }
  }, true); // prefix match

  // DELETE /api/sessions/:id
  router.delete('/api/sessions/', async (req, res) => {
    try {
      const sessionId = req.url!.replace('/api/sessions/', '').split('?')[0];
      if (!sessionId) {
        jsonResponse(res, { error: 'Session ID required' }, 400);
        return;
      }
      const deleted = sessions.delete(sessionId);
      jsonResponse(res, { success: deleted });
    } catch (err) {
      jsonError(res, err);
    }
  }, true); // prefix match
}
