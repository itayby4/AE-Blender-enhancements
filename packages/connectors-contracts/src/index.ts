// ── Types ─────────────────────────────────────────────────────────────────
export type {
  ConnectorId,
  ConnectorStatus,
  ConnectorConfig,
  Connector,
  ToolDescriptor,
  ToolCallResult,
  StructuredError,
  AsyncToolPolicy,
  StdioTransportConfig,
  SseTransportConfig,
  TransportConfig,
  // Transitional aliases — removed in sub-phase 5.6 once call sites migrate.
  Tool,
  ToolResult,
} from './lib/types.js';

// ── Events ────────────────────────────────────────────────────────────────
export type {
  McpConnectorConnectedEvent,
  McpConnectorDisconnectedEvent,
  McpToolCalledEvent,
  McpToolsChangedEvent,
  McpConnectorEvent,
  McpToolEvent,
  McpEvent,
  McpEventMap,
} from './lib/events.js';

// ── API interface ─────────────────────────────────────────────────────────
export type {
  ConnectorSnapshot,
  ConnectorsApi,
  ConnectorsEventBus,
} from './lib/api.js';
