import { createConnector } from './connector.js';
import type { Connector, ConnectorConfig, Tool, ToolResult } from './types.js';

export class ConnectorRegistry {
  private connectors = new Map<string, Connector>();
  private toolIndex = new Map<string, string>();

  private localTools = new Map<
    string,
    {
      description?: string;
      inputSchema: Record<string, unknown>;
      handler: (args: Record<string, unknown>) => Promise<string | ToolResult>;
    }
  >();

  register(config: ConnectorConfig): void {
    if (this.connectors.has(config.id)) {
      throw new Error(`Connector "${config.id}" is already registered`);
    }
    this.connectors.set(config.id, createConnector(config));
  }

  registerLocalTool(
    name: string,
    description: string,
    inputSchema: Record<string, unknown>,
    handler: (args: Record<string, unknown>) => Promise<string | ToolResult>
  ): void {
    if (this.localTools.has(name)) {
      throw new Error(`Local tool "${name}" is already registered`);
    }
    this.localTools.set(name, { description, inputSchema, handler });
  }

  async connect(id: string): Promise<Connector> {
    const connector = this.connectors.get(id);
    if (!connector) {
      throw new Error(`Connector "${id}" is not registered`);
    }
    await connector.connect();
    return connector;
  }

  async connectAll(): Promise<void> {
    const entries = Array.from(this.connectors.entries());
    await Promise.all(
      entries.map(async ([id, connector]) => {
        try {
          await connector.connect();
          console.log(`Connected to "${id}" (${connector.config.name})`);
        } catch (err) {
          console.error(`Failed to connect to "${id}":`, err);
          // Non-fatal: the backend keeps running; the connector
          // will be skipped during getAllTools() and can auto-reconnect
          // on the next tool call attempt.
        }
      })
    );
  }

  async disconnectAll(): Promise<void> {
    const entries = Array.from(this.connectors.values());
    await Promise.all(entries.map((c) => c.disconnect()));
  }

  async switchActiveConnector(activeId: string): Promise<void> {
    const entries = Array.from(this.connectors.entries());
    await Promise.all(
      entries.map(async ([id, connector]) => {
        if (id === activeId) {
          if (!connector.isConnected()) {
            try {
              await connector.connect();
              console.log(
                `Connected to active connector "${id}" (${connector.config.name})`
              );
            } catch (err) {
              console.error(
                `Failed to connect to active connector "${id}":`,
                err
              );
            }
          }
        } else {
          if (connector.isConnected()) {
            try {
              await connector.disconnect();
              console.log(
                `Disconnected inactive connector "${id}" (${connector.config.name})`
              );
            } catch (err) {
              console.error(`Failed to disconnect from "${id}":`, err);
            }
          }
        }
      })
    );
  }

  getConnector(id: string): Connector {
    const connector = this.connectors.get(id);
    if (!connector) {
      throw new Error(`Connector "${id}" is not registered`);
    }
    return connector;
  }

  /**
   * Aggregate tools from all connected connectors.
   * Atomically rebuilds the internal tool->connector routing index: the new
   * index is built in a local variable and swapped in at the end, so a
   * concurrent `callTool()` never observes a cleared or partially populated
   * index while `listTools()` is awaiting on a connector.
   */
  async getAllTools(): Promise<Tool[]> {
    const newIndex = new Map<string, string>();
    const allTools: Tool[] = [];

    for (const [id, connector] of this.connectors) {
      if (!connector.isConnected()) continue;
      const tools = await connector.listTools();
      for (const tool of tools) {
        newIndex.set(tool.name, id);
        allTools.push(tool);
      }
    }

    for (const [name, def] of this.localTools) {
      newIndex.set(name, 'local');
      allTools.push({
        name,
        description: def.description,
        inputSchema: def.inputSchema,
        connectorId: 'local',
      });
    }

    // Atomic swap — callers of callTool() see either the previous complete
    // index or the new complete index, never a transient empty/partial one.
    this.toolIndex = newIndex;
    return allTools;
  }

  /**
   * Route a tool call to the correct connector based on the tool index.
   * Requires getAllTools() to have been called first.
   */
  async callTool(
    name: string,
    args: Record<string, unknown>
  ): Promise<ToolResult> {
    const connectorId = this.toolIndex.get(name);
    if (!connectorId) {
      throw new Error(
        `Unknown tool "${name}". Call getAllTools() to refresh the tool index.`
      );
    }

    if (connectorId === 'local') {
      const toolDef = this.localTools.get(name);
      if (!toolDef) {
        throw new Error(`Local tool "${name}" not found`);
      }
      try {
        const result = await toolDef.handler(args);
        // If it's a string, wrap it in a ToolResult. If it's already a ToolResult, return it directly.
        if (typeof result === 'string') {
          return { content: result };
        }
        return result;
      } catch (err: unknown) {
        return { content: String(err), isError: true };
      }
    }

    const connector = this.connectors.get(connectorId);
    if (!connector) {
      throw new Error(
        `Connector "${connectorId}" for tool "${name}" not found`
      );
    }
    return connector.callTool(name, args);
  }
}
