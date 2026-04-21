import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import type { TransportConfig } from './types.js';
import * as os from 'os';
import * as path from 'path';

/**
 * Resolve a platform-aware Python path from a venv root.
 * On Windows: venv/Scripts/python.exe
 * On macOS/Linux: venv/bin/python
 */
export function resolveVenvPython(venvRoot: string): string {
  if (os.platform() === 'win32') {
    return path.join(venvRoot, 'Scripts', 'python.exe');
  }
  return path.join(venvRoot, 'bin', 'python');
}

export function createTransport(config: TransportConfig) {
  switch (config.type) {
    case 'stdio':
      return new StdioClientTransport({
        command: config.command,
        args: config.args,
        env: config.env as Record<string, string> | undefined,
        cwd: config.cwd,
      });

    case 'sse':
      return new SSEClientTransport(new URL(config.url));

    default:
      throw new Error(
        `Unsupported transport type: ${(config as TransportConfig).type}`
      );
  }
}
