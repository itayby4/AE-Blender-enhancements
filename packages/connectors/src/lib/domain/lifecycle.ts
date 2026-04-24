import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { RequestOptions } from '@modelcontextprotocol/sdk/shared/protocol.js';
import {
  CallToolResultSchema,
  type CallToolResult,
} from '@modelcontextprotocol/sdk/types.js';
import { createTransport } from '@pipefx/mcp-transport';
import type {
  Connector,
  ConnectorConfig,
  ToolCallResult,
  ToolDescriptor,
} from '@pipefx/connectors-contracts';

export type LifecycleStatus =
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'error';

export interface CreateConnectorOptions {
  config: ConnectorConfig;
  /**
   * Lifecycle observer. Called whenever the connector transitions into a
   * new state. The registry uses this to publish `mcp.connector.connected`
   * / `disconnected` on the event bus and to refresh the tool index.
   *
   * Unexpected drops (MCP transport `onclose` firing without a preceding
   * `disconnect()`) surface as `disconnected` with a non-empty `reason`.
   */
  onStatusChange?: (
    status: LifecycleStatus,
    info?: { reason?: string }
  ) => void;
}

export function createConnector(options: CreateConnectorOptions): Connector {
  const { config, onStatusChange } = options;
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
      if (connected) {
        connected = false;
        onStatusChange?.('disconnected', { reason: 'transport closed' });
      } else {
        connected = false;
      }
    };

    await client.connect(transport);
    connected = true;
  }

  return {
    config,

    async connect() {
      onStatusChange?.('connecting');
      try {
        await connectClient();
        onStatusChange?.('connected');
      } catch (err) {
        onStatusChange?.('error', { reason: String(err) });
        throw err;
      }
    },

    async disconnect() {
      const wasConnected = connected;
      try {
        await client.close();
      } catch {
        /* already closed */
      }
      connected = false;
      if (wasConnected) {
        onStatusChange?.('disconnected');
      }
    },

    async reconnect() {
      const wasConnected = connected;
      try {
        await client.close();
      } catch {
        /* ignore */
      }
      connected = false;
      if (wasConnected) {
        onStatusChange?.('disconnected', { reason: 'reconnecting' });
      }

      // Create a fresh client — the old one may be in a broken state
      client = new Client(
        { name: `pipefx-${config.id}`, version: '1.0.0' },
        { capabilities: {} }
      );
      client.onerror = (err) =>
        console.error(`MCP Client Error (${config.id}):`, err);
      onStatusChange?.('connecting');
      try {
        await connectClient();
        onStatusChange?.('connected');
      } catch (err) {
        onStatusChange?.('error', { reason: String(err) });
        throw err;
      }
      lastReconnectAttempt = Date.now();
      console.log(`Reconnected to "${config.id}" (${config.name})`);
    },

    async listTools(): Promise<ToolDescriptor[]> {
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
    ): Promise<ToolCallResult> {
      const requestOptions: RequestOptions = { timeout: TOOL_TIMEOUT };
      const executeWithTimeout = (): Promise<CallToolResult> => {
        return new Promise<CallToolResult>((resolve, reject) => {
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
              CallToolResultSchema,
              requestOptions
            )
            .then((res) => {
              clearTimeout(timeoutId);
              resolve(res as CallToolResult);
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
          isError: result.isError,
        };
      } catch {
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
            isError: result.isError,
          };
        } catch {
          // Reconnect failed too — throw without the massive stack trace
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
