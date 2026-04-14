import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { createTransport } from './transport.js';
import type { Connector, ConnectorConfig, Tool, ToolResult } from './types.js';

export function createConnector(config: ConnectorConfig): Connector {
  const TOOL_TIMEOUT = 600_000; // 10 minutes

  let client = new Client(
    { name: `pipefx-${config.id}`, version: '1.0.0' },
    { capabilities: {} }
  );
  client.onerror = (err) => console.error('MCP Client Error:', err);

  let connected = false;

  async function connectClient(): Promise<void> {
    const transport = createTransport(config.transport);
    await client.connect(transport);
    connected = true;
  }

  return {
    config,

    async connect() {
      await connectClient();
    },

    async disconnect() {
      try {
        await client.close();
      } catch {
        /* already closed */
      }
      connected = false;
    },

    async reconnect() {
      try {
        await client.close();
      } catch {
        /* ignore */
      }
      connected = false;

      // Create a fresh client — the old one may be in a broken state
      client = new Client(
        { name: `pipefx-${config.id}`, version: '1.0.0' },
        { capabilities: {} }
      );
      client.onerror = (err) =>
        console.error(`MCP Client Error (${config.id}):`, err);
      await connectClient();
      console.log(`Reconnected to "${config.id}" (${config.name})`);
    },

    async listTools(): Promise<Tool[]> {
      const { tools } = await client.listTools();
      return tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema as Record<string, unknown>,
        connectorId: config.id,
      }));
    },

    async callTool(
      name: string,
      args: Record<string, unknown>
    ): Promise<ToolResult> {
      const executeWithTimeout = (): Promise<any> => {
        return new Promise((resolve, reject) => {
          const timeoutId = setTimeout(() => {
            reject(
              new Error(
                `Tool call "${name}" timed out after 600s (10 minutes). DaVinci Resolve might be frozen.`
              )
            );
          }, TOOL_TIMEOUT);

          client
            .callTool(
              { name, arguments: args },
              undefined as any,
              { timeout: TOOL_TIMEOUT } as any
            )
            .then((res) => {
              clearTimeout(timeoutId);
              resolve(res);
            })
            .catch((err) => {
              clearTimeout(timeoutId);
              reject(err);
            });
        });
      };

      try {
        const result = await executeWithTimeout();
        return {
          content: result.content,
          isError: result.isError as boolean | undefined,
        };
      } catch (err) {
        console.warn(
          `Tool call "${name}" on "${config.id}" failed, attempting reconnect...`,
          err
        );
        await this.reconnect();
        const result = await executeWithTimeout();
        return {
          content: result.content,
          isError: result.isError as boolean | undefined,
        };
      }
    },

    isConnected() {
      return connected;
    },
  };
}
