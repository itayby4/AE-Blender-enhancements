import type { IncomingMessage, ServerResponse } from 'node:http';

import type {
  ConnectorId,
  ConnectorSnapshot,
  ToolCallResult,
  ToolDescriptor,
} from '@pipefx/connectors-contracts';

/**
 * Minimal router shape — structurally satisfied by `apps/backend`'s Router.
 * We intentionally do not depend on the backend's concrete Router class,
 * so `@pipefx/connectors` stays app-agnostic.
 */
export interface ConnectorsRouter {
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

/**
 * Minimal registry surface this module needs — a subset of `ConnectorsApi`.
 * Declared structurally so we do not pull the full concrete `ConnectorRegistry`
 * type through the backend wiring surface.
 */
export interface ConnectorsRegistryLike {
  listConnectors(): ConnectorSnapshot[];
  getActiveConnectorId(): ConnectorId | null;
  switchActiveConnector(activeId: ConnectorId): Promise<void>;
  connect(id: ConnectorId): Promise<unknown>;
  getConnector(id: ConnectorId): { disconnect(): Promise<void> };
  getAllTools(): Promise<ToolDescriptor[]>;
  callTool(
    name: string,
    args: Record<string, unknown>
  ): Promise<ToolCallResult>;
}

export interface MountConnectorRoutesDeps {
  registry: ConnectorsRegistryLike;
}

// ── Helpers (inlined to avoid importing from backend) ─────────────────────

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

/** Extract the `{id}` trailing segment from URLs like `/connectors/:id/connect`. */
function segment(url: string | undefined, prefix: string, suffix: string): string | null {
  if (!url) return null;
  const q = url.indexOf('?');
  const path = q >= 0 ? url.slice(0, q) : url;
  if (!path.startsWith(prefix) || !path.endsWith(suffix)) return null;
  const mid = path.slice(prefix.length, path.length - suffix.length);
  return mid.length > 0 && !mid.includes('/') ? decodeURIComponent(mid) : null;
}

/**
 * Mount HTTP routes for the connectors subsystem:
 *
 *  - `GET  /connectors`               — list connectors with status
 *  - `POST /connectors/switch`        — body `{ activeId }`, set the active one
 *  - `POST /connectors/:id/connect`    — connect a specific connector
 *  - `POST /connectors/:id/disconnect` — disconnect a specific connector
 *  - `GET  /tools`                    — aggregate tool list
 *  - `POST /tools/call`               — body `{ name, args? }`, route to owner
 *
 * No authentication enforced here — the host app (e.g. `apps/backend`) wraps
 * the entire router in its own auth middleware before mounting.
 */
export function mountConnectorRoutes(
  router: ConnectorsRouter,
  deps: MountConnectorRoutesDeps
): void {
  const { registry } = deps;

  router.get('/connectors', async (_req, res) => {
    try {
      const connectors = registry.listConnectors();
      const activeId = registry.getActiveConnectorId();
      jsonResponse(res, { connectors, activeId });
    } catch (err) {
      jsonError(res, err);
    }
  });

  router.post('/connectors/switch', async (req, res) => {
    try {
      const body = await readBody(req);
      const { activeId } = JSON.parse(body) as { activeId?: string };
      if (!activeId || typeof activeId !== 'string') {
        jsonResponse(res, { error: 'activeId is required' }, 400);
        return;
      }
      await registry.switchActiveConnector(activeId);
      jsonResponse(res, { ok: true, activeId });
    } catch (err) {
      jsonError(res, err);
    }
  });

  // Prefix-matched handlers for `/connectors/:id/{connect,disconnect}`.
  // We branch inside a single registered route per verb so the path parser
  // stays in this module (no router library features required).
  router.post(
    '/connectors/',
    async (req, res) => {
      try {
        const connectId = segment(req.url, '/connectors/', '/connect');
        const disconnectId = segment(req.url, '/connectors/', '/disconnect');
        if (connectId) {
          await registry.connect(connectId);
          jsonResponse(res, { ok: true, id: connectId });
          return;
        }
        if (disconnectId) {
          await registry.getConnector(disconnectId).disconnect();
          jsonResponse(res, { ok: true, id: disconnectId });
          return;
        }
        jsonResponse(res, { error: 'Unknown connector action' }, 404);
      } catch (err) {
        jsonError(res, err);
      }
    },
    true
  );

  router.get('/tools', async (_req, res) => {
    try {
      const tools = await registry.getAllTools();
      jsonResponse(res, { tools });
    } catch (err) {
      jsonError(res, err);
    }
  });

  router.post('/tools/call', async (req, res) => {
    try {
      const body = await readBody(req);
      const parsed = JSON.parse(body) as {
        name?: string;
        args?: Record<string, unknown>;
      };
      if (!parsed.name || typeof parsed.name !== 'string') {
        jsonResponse(res, { error: 'name is required' }, 400);
        return;
      }
      const result = await registry.callTool(parsed.name, parsed.args ?? {});
      jsonResponse(res, result);
    } catch (err) {
      jsonError(res, err);
    }
  });
}
