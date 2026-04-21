export { createConnector } from './lib/connector.js';
export { ConnectorRegistry } from './lib/registry.js';
export { createTransport, resolveVenvPython } from './lib/transport.js';
export type {
  Connector,
  ConnectorConfig,
  StdioTransportConfig,
  SseTransportConfig,
  TransportConfig,
  Tool,
  ToolResult,
  AsyncToolPolicy,
  StructuredError,
} from './lib/types.js';
