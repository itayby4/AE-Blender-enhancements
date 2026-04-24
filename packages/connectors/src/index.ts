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

// Capability map — namespace-from-tool-name heuristic with optional
// manifest override. Phase 7 (Skills) consumes this to light up / grey
// out capability-gated affordances in response to `mcp.tools.changed`.
export {
  deriveCapabilities,
  loadCapabilityManifest,
} from './lib/domain/capability-map.js';
export type { DeriveCapabilitiesOptions } from './lib/domain/capability-map.js';

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
  ConnectorCapabilityManifest,
  // Transitional aliases — drop once all consumers adopt the Tool*Descriptor
  // / ToolCallResult names. See contracts/src/lib/types.ts.
  Tool,
  ToolResult,
  // Transport shapes — re-exported so a consumer that only imports the
  // registry (e.g. apps/backend config module) doesn't need a second
  // import line against @pipefx/mcp-transport.
  TransportConfig,
  StdioTransportConfig,
  SseTransportConfig,
} from '@pipefx/connectors-contracts';
