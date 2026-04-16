import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { createTransport } from './transport.js';
import type { Connector, ConnectorConfig, Tool, ToolResult } from './types.js';

export function createConnector(config: ConnectorConfig): Connector {
  const TOOL_TIMEOUT = 600_000; // 10 minutes
  const RECONNECT_COOLDOWN = 15_000; // Don't reconnect more than once per 15 seconds

  let client = new Client(
    { name: `pipefx-${config.id}`, version: '1.0.0' },
    { capabilities: {} }
  );
  client.onerror = (err) => console.error('MCP Client Error:', err);

  let connected = false;
  let lastReconnectAttempt = 0;

  async function connectClient(): Promise<void> {
    const transport = createTransport(config.transport);

    // Track connection drops so isConnected() returns accurate state.
    client.onclose = () => {
      connected = false;
    };

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

      // Create a fresh client ΓÇö the old one may be in a broken state
      client = new Client(
        { name: `pipefx-${config.id}`, version: '1.0.0' },
        { capabilities: {} }
      );
      client.onerror = (err) =>
        console.error(`MCP Client Error (${config.id}):`, err);
      await connectClient();
      lastReconnectAttempt = Date.now();
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
        // Cooldown: don't reconnect if we just reconnected recently.
        // This prevents storm-reconnect when the external app isn't running.
        const now = Date.now();
        if (now - lastReconnectAttempt < RECONNECT_COOLDOWN) {
          throw new Error(
            `Tool call "${name}" on "${config.id}" failed. ` +
            `Reconnect skipped (cooldown). Is the external application running?`
          );
        }

        console.warn(
          `Tool call "${name}" on "${config.id}" failed, attempting reconnect...`
        );
        lastReconnectAttempt = now;

        try {
          await this.reconnect();
          const result = await executeWithTimeout();
          return {
            content: result.content,
            isError: result.isError as boolean | undefined,
          };
        } catch (reconnectErr) {
          // Reconnect failed too ΓÇö throw without the massive stack trace
          throw new Error(
            `Tool call "${name}" on "${config.id}" failed after reconnect attempt. ` +
            `Is the external application running?`
          );
        }
      }
    },

    isConnected() {
      return connected;
    },
  };
}
