import type { IncomingMessage, ServerResponse } from 'http';

export type RouteHandler = (
  req: IncomingMessage,
  res: ServerResponse
) => void | Promise<void>;

interface Route {
  method: string;
  path: string;
  /** If true, match paths that start with `path` (prefix matching). */
  prefix?: boolean;
  handler: RouteHandler;
}

/**
 * Minimal HTTP router ΓÇö maps method+path ΓåÆ handler.
 * Replaces the giant if/else chain in main.ts.
 */
export class Router {
  private routes: Route[] = [];

  get(path: string, handler: RouteHandler, prefix = false) {
    this.routes.push({ method: 'GET', path, handler, prefix });
    return this;
  }

  post(path: string, handler: RouteHandler, prefix = false) {
    this.routes.push({ method: 'POST', path, handler, prefix });
    return this;
  }

  delete(path: string, handler: RouteHandler, prefix = false) {
    this.routes.push({ method: 'DELETE', path, handler, prefix });
    return this;
  }

  /**
   * Handle an incoming request. Returns true if a route was matched.
   */
  async handle(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
    const method = req.method ?? '';
    const url = req.url ?? '';
    // Strip query string before matching — handlers still see the full
    // url via req.url and parse `?` themselves.
    const pathOnly = url.split('?', 1)[0];

    for (const route of this.routes) {
      if (route.method !== method) continue;
      if (route.prefix ? pathOnly.startsWith(route.path) : pathOnly === route.path) {
        await route.handler(req, res);
        return true;
      }
    }

    return false;
  }
}

/**
 * Helper: read the full request body as a string.
 */
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

/**
 * Helper: send a JSON response.
 */
export function jsonResponse(
  res: ServerResponse,
  data: unknown,
  status = 200
) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

/**
 * Helper: send a JSON error response.
 */
export function jsonError(
  res: ServerResponse,
  error: unknown,
  status = 500
) {
  const message = error instanceof Error ? error.message : String(error);
  jsonResponse(res, { error: message }, status);
}
