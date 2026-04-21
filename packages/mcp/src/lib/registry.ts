import { createConnector } from './connector.js';
import {
  DEFAULT_IDEMPOTENCY_TTL_MS,
  IdempotencyCache,
  executeWithPolicy,
  hashArgs,
} from './executor.js';
import type { Connector, ConnectorConfig, Tool, ToolResult } from './types.js';

export class ConnectorRegistry {
  private connectors = new Map<string, Connector>();
  private configs = new Map<string, ConnectorConfig>();
  private toolIndex = new Map<string, string>();
  private activeId: string | null = null;

  /** One idempotency cache per connector — short TTL suppresses same-turn duplicate calls. */
  private idempotencyCaches = new Map<string, IdempotencyCache>();

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
    this.configs.set(config.id, config);
    if (config.asyncPolicy) {
      this.idempotencyCaches.set(config.id, new IdempotencyCache());
    }
  }

  /**
   * Clear per-connector idempotency caches. Call at the start of each chat
   * turn so cached results from an earlier turn never leak into a new one.
   */
  clearIdempotencyCaches(): void {
    for (const cache of this.idempotencyCaches.values()) cache.clear();
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

  /**
   * Set which connector is "active" (its tools will be the ones exposed
   * via getAllTools to the AI). Ensures the target is connected, but does
   * NOT disconnect others — keeping inactive connectors warm eliminates
   * the cold-start penalty on future switches.
   */
  async switchActiveConnector(activeId: string): Promise<void> {
    this.activeId = activeId;
    const connector = this.connectors.get(activeId);
    if (!connector) {
      throw new Error(`Connector "${activeId}" is not registered`);
    }
    if (!connector.isConnected()) {
      try {
        await connector.connect();
        console.log(
          `Connected to active connector "${activeId}" (${connector.config.name})`
        );
      } catch (err) {
        console.error(
          `Failed to connect to active connector "${activeId}":`,
          err
        );
      }
    }
  }

  getActiveConnectorId(): string | null {
    return this.activeId;
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
      // Scope tools to the active connector once one is set. Other
      // connectors stay connected (warm) but their tools aren't exposed
      // to the AI, which would just confuse the model.
      if (this.activeId !== null && id !== this.activeId) continue;
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

    const config = this.configs.get(connectorId);
    const policy = config?.asyncPolicy;

    // Fast path — no policy, behave exactly like before.
    if (!policy) {
      return connector.callTool(name, args);
    }

    // Tools in skipTools (poll tool itself, helps, lists) bypass the wrapper
    // and the idempotency cache. They're either side-effect-free or
    // required to refresh on every call.
    if (policy.skipTools?.includes(name)) {
      return connector.callTool(name, args);
    }

    const cache = this.idempotencyCaches.get(connectorId);
    const cacheKey = `${name}::${hashArgs(args)}`;
    const cached = cache?.get(cacheKey);
    if (cached) {
      // Same (tool, args) called within the TTL — the architectural
      // guarantee that duplicate side effects are impossible.
      return cached;
    }

    const result = await executeWithPolicy(connector, name, args, policy);
    if (cache && !result.isError) {
      cache.set(
        cacheKey,
        result,
        policy.idempotencyTtlMs ?? DEFAULT_IDEMPOTENCY_TTL_MS
      );
    }
    return result;
  }
}
