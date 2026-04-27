import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { registerTools } from './tools.js';

// CEP exposes Node.js inside the panel via the `--enable-nodejs` CEF flag
// (see CSXS/manifest.xml). require() resolves Node builtins as in a normal
// Node process — that's how we get an http server.
declare const require: NodeRequire;
const http = require('http') as typeof import('http');

export interface McpServerHandle {
  port: number;
  close: () => void;
  onConnectionChange: (cb: (connected: boolean) => void) => () => void;
}

const DEFAULT_PORT = 7891;

/**
 * Boot an MCP server inside the CEP panel, exposed over HTTP+SSE on
 * localhost. The PipeFX backend connects with SSEClientTransport.
 *
 *  - GET  /sse       — long-lived event stream. One client at a time.
 *  - POST /messages  — JSON-RPC requests; responses stream back via /sse.
 *  - GET  /healthz   — sanity probe (also useful from a browser).
 */
export async function startMcpServer(
  port: number = DEFAULT_PORT
): Promise<McpServerHandle> {
  const server = new McpServer({
    name: 'pipefx-aftereffects',
    version: '0.2.0',
  });
  registerTools(server);

  let activeTransport: SSEServerTransport | null = null;
  const listeners = new Set<(connected: boolean) => void>();
  const notify = (connected: boolean) => {
    for (const cb of listeners) cb(connected);
  };

  const httpServer = http.createServer(async (req, res) => {
    try {
      if (!req.url) {
        res.statusCode = 400;
        res.end('missing url');
        return;
      }

      // CORS so the backend (different origin) can connect during dev.
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      if (req.method === 'OPTIONS') {
        res.statusCode = 204;
        res.end();
        return;
      }

      if (req.method === 'GET' && req.url.startsWith('/sse')) {
        if (activeTransport) {
          try {
            await activeTransport.close();
          } catch {
            /* ignored */
          }
        }
        const transport = new SSEServerTransport('/messages', res);
        activeTransport = transport;
        notify(true);
        transport.onclose = () => {
          if (activeTransport === transport) {
            activeTransport = null;
            notify(false);
          }
        };
        await server.connect(transport);
        return;
      }

      if (req.method === 'POST' && req.url.startsWith('/messages')) {
        if (!activeTransport) {
          res.statusCode = 409;
          res.end('no active SSE channel — open GET /sse first');
          return;
        }
        await activeTransport.handlePostMessage(req, res);
        return;
      }

      if (req.method === 'GET' && req.url === '/healthz') {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ ok: true, connected: !!activeTransport }));
        return;
      }

      res.statusCode = 404;
      res.end('not found');
    } catch (err) {
      console.error('[mcp-aftereffects] request handler error:', err);
      try {
        res.statusCode = 500;
        res.end(String(err));
      } catch {
        /* ignored */
      }
    }
  });

  await new Promise<void>((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(port, '127.0.0.1', () => resolve());
  });

  return {
    port,
    close: () => {
      activeTransport?.close().catch(() => undefined);
      httpServer.close();
    },
    onConnectionChange(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
  };
}
