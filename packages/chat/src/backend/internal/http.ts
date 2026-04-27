import type { IncomingMessage, ServerResponse } from 'node:http';

export type RouteHandler = (
  req: IncomingMessage,
  res: ServerResponse
) => void | Promise<void>;

/**
 * Minimal duck-typed router shape. The real Router class in `apps/backend`
 * satisfies this structurally. Kept here so `@pipefx/chat/backend` doesn't
 * depend on the app-local router implementation.
 */
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
