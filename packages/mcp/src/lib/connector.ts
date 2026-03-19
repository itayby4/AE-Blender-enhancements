import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { createTransport } from './transport.js';
import type { Connector, ConnectorConfig, Tool, ToolResult } from './types.js';

export function createConnector(config: ConnectorConfig): Connector {
  let client = new Client(
    { name: `pipefx-${config.id}`, version: '1.0.0' },
    { capabilities: {} }
  );

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

    async callTool(name: string, args: Record<string, unknown>): Promise<ToolResult> {
      const executeWithTimeout = (): Promise<any> => {
        return Promise.race([
          client.callTool({ name, arguments: args }).catch(e => { throw e; }),
          new Promise((_, reject) => setTimeout(() => reject(new Error(`Tool call "${name}" timed out after 15s. DaVinci Resolve might be frozen.`)), 15000))
        ]);
      };

      try {
        const result = await executeWithTimeout();
        return { content: result.content, isError: result.isError as boolean | undefined };
      } catch (err) {
        console.warn(
          `Tool call "${name}" on "${config.id}" failed, attempting reconnect...`,
          err
        );
        await this.reconnect();
        const result = await executeWithTimeout();
        return { content: result.content, isError: result.isError as boolean | undefined };
      }
    },

    isConnected() {
      return connected;
    },
  };
}
