// ── @pipefx/media-gen/backend — HTTP routes ─────────────────────────────
// Mounts the two endpoints the desktop calls directly (bypassing the
// brain/agent loop):
//
//   POST /api/ai-models    — generate via the matching provider
//   POST /api/save-render  — persist a generated asset to disk
//
// We intentionally don't depend on `apps/backend`'s concrete `Router`
// class — `MediaGenRouter` is a structural interface, satisfied by any
// router with a `post` method. Same pattern `@pipefx/post-production`
// and `@pipefx/connectors` use, keeps this package independent of how
// the host wires its HTTP layer.
//
// Auth: not enforced here. The host wraps the router in its own auth
// middleware before mounting; see `apps/backend/src/main.ts`.

import type { IncomingMessage, ServerResponse } from 'node:http';

import type {
  MediaGenRequest,
  SaveRenderRequest,
} from '../contracts/types.js';
import {
  UnknownModelError,
  dispatchMediaGen,
  saveRender,
  type SaveRenderOptions,
} from '../jobs/index.js';

// ── Router shape ─────────────────────────────────────────────────────────

export interface MediaGenRouter {
  post(
    path: string,
    handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>,
    prefix?: boolean
  ): unknown;
}

// ── Deps ─────────────────────────────────────────────────────────────────

/**
 * Optional knobs for the mount. Today only the renders directory is
 * pluggable; future settings (per-user output paths, quota hooks) slot
 * in here without breaking the call site.
 */
export interface MountMediaGenRoutesDeps {
  /** Override the default `~/Desktop/RENDERS/` destination for saved
   *  assets. Pass-through to `saveRender(...)`. */
  saveRender?: SaveRenderOptions;
}

// ── Helpers ──────────────────────────────────────────────────────────────

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

// ── Mount ────────────────────────────────────────────────────────────────

/**
 * Mount the two media-gen HTTP endpoints. Idempotency is the host
 * router's responsibility — we just call `router.post(...)` twice.
 *
 * Errors:
 *   • Missing `prompt` or unknown model → 400 (request shape problem).
 *   • Anything else (provider failure, disk error) → 500 with the
 *     original message in the body. The dashboards already render this
 *     into their error toast.
 */
export function mountMediaGenRoutes(
  router: MediaGenRouter,
  deps: MountMediaGenRoutesDeps = {}
): void {
  // POST /api/ai-models
  router.post('/api/ai-models', async (req, res) => {
    try {
      const body = await readBody(req);
      const payload = JSON.parse(body) as Partial<MediaGenRequest>;

      if (!payload.prompt) {
        jsonResponse(res, { error: 'Prompt is required' }, 400);
        return;
      }
      if (!payload.model) {
        jsonResponse(res, { error: 'Model is required' }, 400);
        return;
      }

      const result = await dispatchMediaGen(payload as MediaGenRequest);
      jsonResponse(res, result);
    } catch (err) {
      if (err instanceof UnknownModelError) {
        jsonResponse(res, { error: err.message }, 400);
        return;
      }
      console.error('[MEDIA-GEN] /api/ai-models error:', err);
      jsonError(res, err);
    }
  });

  // POST /api/save-render
  router.post('/api/save-render', async (req, res) => {
    try {
      const body = await readBody(req);
      const payload = JSON.parse(body) as Partial<SaveRenderRequest>;

      if (!payload.url) {
        jsonResponse(res, { error: 'URL is required' }, 400);
        return;
      }

      const result = await saveRender(
        payload as SaveRenderRequest,
        deps.saveRender
      );
      jsonResponse(res, result);
    } catch (err) {
      console.error('[MEDIA-GEN] /api/save-render error:', err);
      jsonError(res, err);
    }
  });
}
