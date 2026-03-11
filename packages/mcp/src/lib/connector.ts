import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { createTransport } from './transport.js';
import type { Connector, ConnectorConfig, Tool, ToolResult } from './types.js';

export function createConnector(config: ConnectorConfig): Connector {
  const client = new Client(
    { name: `pipefx-${config.id}`, version: '1.0.0' },
    { capabilities: {} }
  );

  let connected = false;

  return {
    config,

    async connect() {
      const transport = createTransport(config.transport);
      await client.connect(transport);
      connected = true;
    },

    async disconnect() {
      await client.close();
      connected = false;
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
      const result = await client.callTool({ name, arguments: args });
      return { content: result.content, isError: result.isError as boolean | undefined };
    },

    isConnected() {
      return connected;
    },
  };
}
