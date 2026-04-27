import type { EventBus } from '@pipefx/event-bus';

import type {
  Connector,
  ConnectorConfig,
  ConnectorId,
  ConnectorStatus,
  ToolCallResult,
  ToolDescriptor,
} from './types.js';
import type { McpEventMap } from './events.js';

/**
 * Snapshot of a registered connector's current state. Returned by
 * `ConnectorsApi.listConnectors()` — the UI's ConnectorStatus widget is
 * the primary consumer today; capability-map + health-check also read it.
 */
export interface ConnectorSnapshot {
  id: ConnectorId;
  name: string;
  status: ConnectorStatus;
  /** Last error surfaced on this connector, if any. Cleared on successful connect. */
  lastError?: string;
}

/**
 * Public API surface for the connectors package. Apps and feature packages
 * depend on this interface; `@pipefx/connectors/domain` ships the
 * concrete implementation. Keeping the API interface here lets the brain
 * (and future chat/skills) depend on contracts only.
 */
export interface ConnectorsApi {
  /** Register a connector from a declarative config. Idempotent within one run. */
  register(config: ConnectorConfig): void;

  /** Connect all registered connectors in parallel. Failures are per-connector, non-fatal. */
  connectAll(): Promise<void>;

  /** Disconnect every connector. Best-effort. */
  disconnectAll(): Promise<void>;

  /**
   * Promote one connector to be the "active" one whose tools are exposed to
   * the agent. Other connectors stay warm but their tools are hidden to
   * avoid confusing the model.
   */
  switchActiveConnector(activeId: ConnectorId): Promise<void>;

  /** ID of the currently active connector, or null if none. */
  getActiveConnectorId(): ConnectorId | null;

  /** Snapshot of every registered connector's state. */
  listConnectors(): ConnectorSnapshot[];

  /**
   * Aggregate tools from every connected connector (and local tools). Also
   * rebuilds the internal tool→connector routing index — `callTool` below
   * requires this to have run at least once.
   */
  listTools(): Promise<ToolDescriptor[]>;

  /** Route a tool call to the owning connector. */
  callTool(
    name: string,
    args: Record<string, unknown>
  ): Promise<ToolCallResult>;

  /** Access a specific connector (rare — most callers should use callTool). */
  getConnector(id: ConnectorId): Connector;

  /** Clear per-connector idempotency caches — call at the start of each chat turn. */
  clearIdempotencyCaches(): void;
}

/**
 * Shape of the event bus connectors publishes to. Consumers subscribe via
 * the same bus they hand to the registry at construction time.
 */
export type ConnectorsEventBus = EventBus<McpEventMap>;
