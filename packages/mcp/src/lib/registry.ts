import { createConnector } from './connector.js';
import type { Connector, ConnectorConfig, Tool, ToolResult } from './types.js';

export class ConnectorRegistry {
  private connectors = new Map<string, Connector>();
  private toolIndex = new Map<string, string>();

  register(config: ConnectorConfig): void {
    if (this.connectors.has(config.id)) {
      throw new Error(`Connector "${config.id}" is already registered`);
    }
    this.connectors.set(config.id, createConnector(config));
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
          throw err;
        }
      })
    );
  }

  async disconnectAll(): Promise<void> {
    const entries = Array.from(this.connectors.values());
    await Promise.all(entries.map((c) => c.disconnect()));
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
   * Rebuilds the internal tool->connector routing index.
   */
  async getAllTools(): Promise<Tool[]> {
    this.toolIndex.clear();
    const allTools: Tool[] = [];

    for (const [id, connector] of this.connectors) {
      if (!connector.isConnected()) continue;
      const tools = await connector.listTools();
      for (const tool of tools) {
        this.toolIndex.set(tool.name, id);
        allTools.push(tool);
      }
    }

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
    const connector = this.connectors.get(connectorId);
    if (!connector) {
      throw new Error(`Connector "${connectorId}" for tool "${name}" not found`);
    }
    return connector.callTool(name, args);
  }
}
