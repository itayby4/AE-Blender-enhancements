// ── Domain ────────────────────────────────────────────────────────────────
// Runtime — registry, lifecycle factory, executor helpers. The public
// entry point today. UI and backend route modules land in sub-phases 5.4
// and 5.5; once they exist, only the types here stay on the root export.
export { ConnectorRegistry } from './lib/domain/registry.js';
export type { ConnectorRegistryOptions } from './lib/domain/registry.js';
export { createConnector } from './lib/domain/lifecycle.js';
export type {
  CreateConnectorOptions,
  LifecycleStatus,
} from './lib/domain/lifecycle.js';

// ── Contracts re-export ──────────────────────────────────────────────────
// Consumers already on `@pipefx/connectors-contracts` don't need this —
// but the backend today reaches for `Connector`, `ToolCallResult`, etc.
// alongside the concrete registry. Re-exporting avoids a second import
// line at every call site.
export type {
  Connector,
  ConnectorConfig,
  ConnectorId,
  ConnectorStatus,
  ToolDescriptor,
  ToolCallResult,
  StructuredError,
  AsyncToolPolicy,
  McpEvent,
  McpEventMap,
  McpConnectorConnectedEvent,
  McpConnectorDisconnectedEvent,
  McpToolCalledEvent,
  McpToolsChangedEvent,
  ConnectorsApi,
  ConnectorSnapshot,
} from '@pipefx/connectors-contracts';
