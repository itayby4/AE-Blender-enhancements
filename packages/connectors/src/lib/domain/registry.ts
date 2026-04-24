import type { EventBus } from '@pipefx/event-bus';
import type {
  Connector,
  ConnectorConfig,
  ConnectorId,
  ConnectorSnapshot,
  ConnectorStatus,
  McpEventMap,
  ToolCallResult,
  ToolDescriptor,
} from '@pipefx/connectors-contracts';

import { createConnector, type LifecycleStatus } from './lifecycle.js';
import {
  DEFAULT_IDEMPOTENCY_TTL_MS,
  IdempotencyCache,
  executeWithPolicy,
  hashArgs,
} from './executor.js';

export interface ConnectorRegistryOptions {
  /**
   * When provided, the registry publishes `mcp.connector.connected`,
   * `mcp.connector.disconnected`, `mcp.tool.called`, and `mcp.tools.changed`
   * events for every observable state transition. Phase 7 (Skills)
   * subscribes to `mcp.tools.changed` to light up / grey out capabilities.
   */
  eventBus?: EventBus<McpEventMap>;
}

interface LocalToolDef {
  description?: string;
  inputSchema: Record<string, unknown>;
  handler: (args: Record<string, unknown>) => Promise<string | ToolCallResult>;
}

export class ConnectorRegistry {
  private readonly bus?: EventBus<McpEventMap>;
  private connectors = new Map<ConnectorId, Connector>();
  private configs = new Map<ConnectorId, ConnectorConfig>();
  private toolIndex = new Map<string, ConnectorId | 'local'>();
  private activeId: ConnectorId | null = null;

  /** One idempotency cache per connector — short TTL suppresses same-turn duplicate calls. */
  private idempotencyCaches = new Map<ConnectorId, IdempotencyCache>();

  private localTools = new Map<string, LocalToolDef>();

  /**
   * Fingerprint of the last tool set we broadcast on `mcp.tools.changed`.
   * Used to suppress duplicate events when `getAllTools()` is called
   * repeatedly but the underlying tool set hasn't actually changed.
   */
  private lastToolsFingerprint: string | null = null;

  /**
   * Last observed lifecycle status per connector. Seeded to `'disconnected'`
   * at registration and updated from the lifecycle callback — the HTTP
   * surface reads this to serve `GET /connectors` without forcing a probe.
   */
  private statuses = new Map<ConnectorId, ConnectorStatus>();
  private lastErrors = new Map<ConnectorId, string>();

  constructor(options: ConnectorRegistryOptions = {}) {
    this.bus = options.eventBus;
  }

  register(config: ConnectorConfig): void {
    if (this.connectors.has(config.id)) {
      throw new Error(`Connector "${config.id}" is already registered`);
    }
    const connector = createConnector({
      config,
      onStatusChange: (status, info) => {
        this.handleLifecycle(config, status, info);
      },
    });
    this.connectors.set(config.id, connector);
    this.configs.set(config.id, config);
    this.statuses.set(config.id, 'disconnected');
    if (config.asyncPolicy) {
      this.idempotencyCaches.set(config.id, new IdempotencyCache());
    }
  }

  /**
   * Snapshot of every registered connector. Implementation of
   * `ConnectorsApi.listConnectors` — the UI's connector list and Phase 7's
   * capability matcher both pull status from here rather than probing
   * `isConnected()` directly.
   */
  listConnectors(): ConnectorSnapshot[] {
    const out: ConnectorSnapshot[] = [];
    for (const [id, connector] of this.connectors) {
      const status = this.statuses.get(id) ?? 'disconnected';
      const lastError = this.lastErrors.get(id);
      out.push({
        id,
        name: connector.config.name,
        status,
        ...(lastError ? { lastError } : {}),
      });
    }
    return out;
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
    handler: (args: Record<string, unknown>) => Promise<string | ToolCallResult>
  ): void {
    if (this.localTools.has(name)) {
      throw new Error(`Local tool "${name}" is already registered`);
    }
    this.localTools.set(name, { description, inputSchema, handler });
  }

  async connect(id: ConnectorId): Promise<Connector> {
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
  async switchActiveConnector(activeId: ConnectorId): Promise<void> {
    const previousId = this.activeId;
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
    // Switching which connector is exposed changes the visible tool set
    // even if no underlying connector transitioned — refresh so the bus
    // observes `mcp.tools.changed`.
    if (previousId !== activeId) {
      void this.refreshAndBroadcastTools();
    }
  }

  getActiveConnectorId(): ConnectorId | null {
    return this.activeId;
  }

  getConnector(id: ConnectorId): Connector {
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
  async getAllTools(): Promise<ToolDescriptor[]> {
    return this.buildToolList(/* broadcast */ true);
  }

  /**
   * Route a tool call to the correct connector based on the tool index.
   * Requires getAllTools() to have been called first.
   */
  async callTool(
    name: string,
    args: Record<string, unknown>
  ): Promise<ToolCallResult> {
    const start = Date.now();
    const connectorId = this.toolIndex.get(name);
    if (!connectorId) {
      throw new Error(
        `Unknown tool "${name}". Call getAllTools() to refresh the tool index.`
      );
    }

    try {
      const result = await this.dispatchCall(connectorId, name, args);
      this.emitToolCalled(connectorId, name, start, result.isError === true);
      return result;
    } catch (err) {
      this.emitToolCalled(connectorId, name, start, true);
      throw err;
    }
  }

  private async dispatchCall(
    connectorId: ConnectorId | 'local',
    name: string,
    args: Record<string, unknown>
  ): Promise<ToolCallResult> {
    if (connectorId === 'local') {
      const toolDef = this.localTools.get(name);
      if (!toolDef) {
        throw new Error(`Local tool "${name}" not found`);
      }
      try {
        const result = await toolDef.handler(args);
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
    // and the idempotency cache.
    if (policy.skipTools?.includes(name)) {
      return connector.callTool(name, args);
    }

    const cache = this.idempotencyCaches.get(connectorId);
    const cacheKey = `${name}::${hashArgs(args)}`;
    const cached = cache?.get(cacheKey);
    if (cached) {
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

  // ── Event-bus helpers ───────────────────────────────────────────────────

  private handleLifecycle(
    config: ConnectorConfig,
    status: LifecycleStatus,
    info?: { reason?: string }
  ): void {
    const ts = Date.now();
    this.statuses.set(config.id, status);
    if (status === 'connected') {
      this.lastErrors.delete(config.id);
    } else if (status === 'error' && info?.reason) {
      this.lastErrors.set(config.id, info.reason);
    }
    if (status === 'connected') {
      void this.bus?.publish('mcp.connector.connected', {
        type: 'mcp.connector.connected',
        connectorId: config.id,
        name: config.name,
        timestamp: ts,
      });
      // A freshly connected connector contributes tools — refresh + broadcast.
      void this.refreshAndBroadcastTools();
    } else if (status === 'disconnected' || status === 'error') {
      void this.bus?.publish('mcp.connector.disconnected', {
        type: 'mcp.connector.disconnected',
        connectorId: config.id,
        name: config.name,
        status: status === 'error' ? 'error' : 'disconnected',
        reason: info?.reason,
        timestamp: ts,
      });
      // Tool set just shrank — refresh + broadcast.
      void this.refreshAndBroadcastTools();
    }
  }

  private emitToolCalled(
    connectorId: ConnectorId | 'local',
    toolName: string,
    startMs: number,
    isError: boolean
  ): void {
    void this.bus?.publish('mcp.tool.called', {
      type: 'mcp.tool.called',
      connectorId,
      toolName,
      durationMs: Date.now() - startMs,
      isError,
      timestamp: Date.now(),
    });
  }

  /**
   * Rebuild the tool list and publish `mcp.tools.changed` iff the set
   * actually changed. Called on connect/disconnect/active-switch. The chat
   * loop's `getAllTools()` path deduplicates against the same fingerprint.
   *
   * Errors inside listTools() are swallowed here — a flaky connector
   * mid-rebuild should not take down the registry. The next refresh will
   * try again.
   */
  private async refreshAndBroadcastTools(): Promise<void> {
    try {
      await this.buildToolList(/* broadcast */ true);
    } catch (err) {
      console.error('[connectors] refreshAndBroadcastTools failed:', err);
    }
  }

  private async buildToolList(broadcast: boolean): Promise<ToolDescriptor[]> {
    const newIndex = new Map<string, ConnectorId | 'local'>();
    const allTools: ToolDescriptor[] = [];
    const activeConnectors: ConnectorId[] = [];

    for (const [id, connector] of this.connectors) {
      if (!connector.isConnected()) continue;
      // Scope tools to the active connector once one is set. Other
      // connectors stay connected (warm) but their tools aren't exposed
      // to the AI, which would just confuse the model.
      if (this.activeId !== null && id !== this.activeId) continue;
      activeConnectors.push(id);
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

    if (broadcast && this.bus) {
      const fp = fingerprintTools(allTools);
      if (fp !== this.lastToolsFingerprint) {
        this.lastToolsFingerprint = fp;
        void this.bus.publish('mcp.tools.changed', {
          type: 'mcp.tools.changed',
          tools: allTools,
          activeConnectors,
          timestamp: Date.now(),
        });
      }
    }

    return allTools;
  }
}

/**
 * Stable fingerprint of the visible tool set. Name+owner is enough — schema
 * changes for a given (name, owner) pair are rare and a spurious re-emission
 * costs less than diffing every schema.
 */
function fingerprintTools(tools: ToolDescriptor[]): string {
  return tools
    .map((t) => `${t.connectorId}::${t.name}`)
    .sort()
    .join('|');
}
