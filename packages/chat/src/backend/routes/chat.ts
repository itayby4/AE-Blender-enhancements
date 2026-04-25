// ── @pipefx/chat/backend/routes/chat ────────────────────────────────────
// Thin HTTP shell. Parses the request, opens the response (JSON or SSE),
// and delegates the orchestration to chat-service. The service is the
// boundary that depends on @pipefx/brain-contracts only — nothing in this
// file imports brain-* impl packages.

import type { ServerResponse } from 'node:http';
import {
  readBody,
  jsonResponse,
  jsonError,
  type RouterLike,
} from '../internal/http.js';
import {
  runChatStream,
  runChatTurn,
  type ChatServiceDeps,
} from '../services/chat-service.js';

// Backwards-compat names: external code referenced `ChatRouteDeps` and the
// structural cost/usage types via this module. Keep the alias so consumers
// don't have to chase the rename in the same phase.
export type ChatRouteDeps = ChatServiceDeps;
export type {
  CostShape,
  UsageStoreLike,
} from '../services/chat-service.js';

function sseWriter(res: ServerResponse) {
  return (event: Record<string, unknown>) => {
    if (res.destroyed || res.writableEnded) return;
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };
}

export function registerChatRoutes(router: RouterLike, deps: ChatServiceDeps) {
  // ── POST /chat (legacy non-streaming JSON) ──
  router.post('/chat', async (req, res) => {
    const abortController = new AbortController();
    req.on('aborted', () => abortController.abort());
    res.on('close', () => {
      if (!res.writableFinished) abortController.abort();
    });

    try {
      const body = await readBody(req);
      const parsed = JSON.parse(body);
      if (!parsed.message) {
        jsonResponse(res, { error: 'Message is required' }, 400);
        return;
      }

      try {
        const result = await runChatTurn(parsed, deps, abortController.signal);
        if (!res.headersSent) jsonResponse(res, result);
      } catch (agentError) {
        if (!res.headersSent) {
          const msg =
            agentError instanceof Error ? agentError.message : String(agentError);
          if (msg.includes('AbortError')) {
            jsonResponse(res, { error: 'Request cancelled' }, 499);
          } else {
            jsonError(res, agentError);
          }
        }
      }
    } catch (err) {
      jsonError(res, err);
    }
  });

  // ── POST /chat/stream (SSE) ──
  router.post('/chat/stream', async (req, res) => {
    const abortController = new AbortController();
    // For SSE: listen on `res` close (client disconnect). `req` close fires
    // as soon as the body is read — that would instantly kill the stream.
    res.on('close', () => abortController.abort());

    try {
      const body = await readBody(req);
      const parsed = JSON.parse(body);
      if (!parsed.message) {
        jsonResponse(res, { error: 'Message is required' }, 400);
        return;
      }

      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      });

      await runChatStream(parsed, deps, sseWriter(res), abortController.signal);
      if (!res.writableEnded) res.end();
    } catch (err) {
      if (!res.headersSent) {
        jsonError(res, err);
      } else {
        try {
          const msg = err instanceof Error ? err.message : String(err);
          res.write(`data: ${JSON.stringify({ type: 'error', error: msg })}\n\n`);
        } catch {
          /* response already torn down */
        }
        if (!res.writableEnded) res.end();
      }
    }
  });
}
