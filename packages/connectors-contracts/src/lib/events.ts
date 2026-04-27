import type {
  ConnectorId,
  ConnectorStatus,
  ToolDescriptor,
} from './types.js';

/**
 * Fired after a connector transitions into the `connected` state, whether
 * from an initial `connect()` or an auto-`reconnect()`. Carries enough
 * info for subscribers to update UI state and rebuild capability maps.
 */
export interface McpConnectorConnectedEvent {
  type: 'mcp.connector.connected';
  connectorId: ConnectorId;
  name: string;
  timestamp: number;
}

/**
 * Fired when a connector leaves the `connected` state — clean disconnect,
 * process crash, or transport error. Phase 7 (Skills) uses this together
 * with `mcp.tools.changed` to grey out skills whose backing connector is
 * offline.
 */
export interface McpConnectorDisconnectedEvent {
  type: 'mcp.connector.disconnected';
  connectorId: ConnectorId;
  name: string;
  /** Terminal `error` if the registry gave up reconnecting; otherwise `disconnected`. */
  status: Extract<ConnectorStatus, 'disconnected' | 'error'>;
  reason?: string;
  timestamp: number;
}

/**
 * Fired after every tool invocation (success OR failure). Consumers that
 * need to observe call volume, latency, or errors subscribe here rather
 * than instrumenting every call site.
 */
export interface McpToolCalledEvent {
  type: 'mcp.tool.called';
  connectorId: ConnectorId | 'local';
  toolName: string;
  durationMs: number;
  isError: boolean;
  timestamp: number;
}

/**
 * Fired whenever the aggregate tool set changes — a connector connects or
 * disconnects, or a connector's tool list changes between `listTools()`
 * calls. This is the feedback loop Phase 7 needs to light up / grey out
 * skills as capabilities come and go.
 */
export interface McpToolsChangedEvent {
  type: 'mcp.tools.changed';
  /** Every tool currently visible to the agent loop. */
  tools: ToolDescriptor[];
  /** IDs of connectors whose tools are represented in `tools`. */
  activeConnectors: ConnectorId[];
  timestamp: number;
}

export type McpConnectorEvent =
  | McpConnectorConnectedEvent
  | McpConnectorDisconnectedEvent;

export type McpToolEvent = McpToolCalledEvent | McpToolsChangedEvent;

export type McpEvent = McpConnectorEvent | McpToolEvent;

/**
 * Event-bus map for the MCP/connectors namespace. Declared as a type alias
 * (not an interface) so it satisfies `EventMap extends Record<string, unknown>`
 * in `@pipefx/event-bus` — interfaces don't carry an index signature by default.
 *
 * Merge into an app-wide event map when constructing the shared bus:
 * ```ts
 * const bus = createEventBus<McpEventMap & BrainEventMap>();
 * ```
 */
export type McpEventMap = {
  'mcp.connector.connected': McpConnectorConnectedEvent;
  'mcp.connector.disconnected': McpConnectorDisconnectedEvent;
  'mcp.tool.called': McpToolCalledEvent;
  'mcp.tools.changed': McpToolsChangedEvent;
};
