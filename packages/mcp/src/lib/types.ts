export interface StdioTransportConfig {
  type: 'stdio';
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
}

export interface SseTransportConfig {
  type: 'sse';
  url: string;
  headers?: Record<string, string>;
}

export type TransportConfig = StdioTransportConfig | SseTransportConfig;

export interface ConnectorConfig {
  id: string;
  name: string;
  transport: TransportConfig;
}

export interface Tool {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
  /** Which connector owns this tool */
  connectorId: string;
}

export interface ToolResult {
  content: unknown;
  isError?: boolean;
}

export interface Connector {
  readonly config: ConnectorConfig;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  reconnect(): Promise<void>;
  listTools(): Promise<Tool[]>;
  callTool(name: string, args: Record<string, unknown>): Promise<ToolResult>;
  isConnected(): boolean;
}
