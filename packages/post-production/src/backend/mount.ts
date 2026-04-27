// ── @pipefx/post-production/backend — workflow route mount ───────────────
// Mounts the four HTTP endpoints the desktop dashboards call directly
// (bypassing the brain/agent loop):
//
//   POST /api/subtitles/generate  — render → VAD → transcribe → translate → import
//   POST /api/audio-sync/run      — discover → correlate → inject
//   POST /api/autopod/discover    — timeline + audio-track snapshot
//   POST /api/autopod/run         — VAD-driven multicam cuts → XML
//
// We intentionally don't depend on `apps/backend`'s concrete `Router`
// class — `WorkflowsRouter` is a structural interface, satisfied by any
// router with `get` / `post`. Same pattern `@pipefx/connectors` uses.
//
// Auth: not enforced here. The host app (apps/backend) wraps the
// router in its own auth middleware before mounting; see Phase 3 (auth)
// for the gate.

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ConnectorRegistry } from '@pipefx/connectors';

import {
  autopodWorkflow,
  getTimelineInfoWorkflow,
  type LocalToolContext,
} from '../workflows/index.js';
import { createAudioSyncHandler } from './api/audio-sync.js';
import { createSubtitleHandler } from './api/subtitles.js';

// ── Router shape ─────────────────────────────────────────────────────────

export interface WorkflowsRouter {
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
}

// ── Deps ─────────────────────────────────────────────────────────────────

/**
 * Everything the workflow routes need from the host. We split it into
 * a `getContext` callable rather than passing the context directly
 * because the host's API keys may rotate at runtime (settings change,
 * cloud-mode flip), and a stale captured context would silently keep
 * using the old credentials.
 */
export interface MountWorkflowRoutesDeps {
  registry: ConnectorRegistry;
  /** Returns a fresh `LocalToolContext` each call. The host typically
   *  builds this once and re-uses it; the indirection is cheap and
   *  future-proofs against credential rotation. */
  getContext: () => LocalToolContext;
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
 * Mount the four workflow HTTP endpoints. Idempotency is the host
 * router's responsibility — we just call `router.post(...)` once per
 * route.
 */
export function mountWorkflowRoutes(
  router: WorkflowsRouter,
  deps: MountWorkflowRoutesDeps
): void {
  const { registry, getContext } = deps;

  // POST /api/subtitles/generate — wrapped in a closure so the handler
  // factory builds against a fresh context each request.
  router.post('/api/subtitles/generate', (req, res) => {
    const handler = createSubtitleHandler(registry, getContext());
    void handler(req, res);
  });

  // POST /api/audio-sync/run — same closure pattern.
  router.post('/api/audio-sync/run', (req, res) => {
    const handler = createAudioSyncHandler(getContext());
    void handler(req, res);
  });

  // POST /api/autopod/discover — invokes the discovery workflow
  // directly. Switches the active connector first when the body
  // specifies an app target so the workflow's connector-tool calls
  // land on the right MCP.
  router.post('/api/autopod/discover', async (req, res) => {
    try {
      const body = await readBody(req);
      const { app_target } = JSON.parse(body) as { app_target?: string };
      if (app_target) {
        await registry.switchActiveConnector(app_target);
      }
      // Force the registry to refresh the tool index before invoking
      // the workflow — ensures any newly-connected MCP's tools are
      // visible to the workflow's `registry.callTool(...)` calls.
      await registry.getAllTools();
      const result = await getTimelineInfoWorkflow.execute(
        { app_target: app_target || 'premiere' },
        getContext()
      );
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(result);
    } catch (err) {
      jsonError(res, err);
    }
  });

  // POST /api/autopod/run
  router.post('/api/autopod/run', async (req, res) => {
    try {
      const body = await readBody(req);
      // The autopod workflow declares mapping_json/fallback as strings and
      // use_generative as a boolean. Match the workflow's `execute` arg
      // shape here so the call site doesn't need a cast.
      const { app_target, mapping_json, fallback, use_generative } = JSON.parse(
        body
      ) as {
        app_target?: string;
        mapping_json?: string;
        fallback?: string;
        use_generative?: boolean;
      };
      if (app_target) {
        await registry.switchActiveConnector(app_target);
      }
      await registry.getAllTools();
      const result = await autopodWorkflow.execute(
        {
          app_target: app_target || 'premiere',
          mapping_json,
          fallback,
          use_generative,
        },
        getContext()
      );
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(result);
    } catch (err) {
      console.error('[AUTOPOD API] Error:', err);
      jsonError(res, err);
    }
  });
}

// ── Re-exports ───────────────────────────────────────────────────────────
// Surface the handler factories + context builder so consumers that need
// finer-grained control (e.g. mounting routes individually) don't have
// to import from sub-paths.

export { createAudioSyncHandler } from './api/audio-sync.js';
export { createSubtitleHandler } from './api/subtitles.js';
export { createLocalToolContext } from '../workflows/index.js';
export type { LocalToolContext } from '../workflows/index.js';
