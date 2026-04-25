// ── @pipefx/skills/backend — http helpers ────────────────────────────────
// Duck-typed router shape + body / json helpers shared by the routes.
// Mirrors @pipefx/chat/backend/internal/http so apps/backend's Router
// satisfies both packages structurally without either depending on the
// app-local implementation.

import type { IncomingMessage, ServerResponse } from 'node:http';

export type RouteHandler = (
  req: IncomingMessage,
  res: ServerResponse
) => void | Promise<void>;

export interface RouterLike {
  get(path: string, handler: RouteHandler, prefix?: boolean): unknown;
  post(path: string, handler: RouteHandler, prefix?: boolean): unknown;
  delete(path: string, handler: RouteHandler, prefix?: boolean): unknown;
}

export function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk: Buffer) => {
      body += chunk.toString();
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

export function jsonResponse(
  res: ServerResponse,
  data: unknown,
  status = 200
) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

export function jsonError(
  res: ServerResponse,
  error: unknown,
  status = 500
) {
  const message = error instanceof Error ? error.message : String(error);
  jsonResponse(res, { error: message }, status);
}
