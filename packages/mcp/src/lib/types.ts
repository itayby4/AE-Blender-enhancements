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

/**
 * Structured error attached to a ToolResult when the executor can classify
 * the failure. LLMs recover dramatically better when errors have structure:
 * `recoverable: false` short-circuits retry loops, and `hint` gives the
 * model a concrete next action to take.
 */
export interface StructuredError {
  code: string;
  message: string;
  recoverable: boolean;
  hint?: string;
}

/**
 * Describes how to synchronize with a connector whose tools are async
 * (fire-and-forget + separate poll tool). Attach to `ConnectorConfig` to
 * make the registry transparently wait on queued tools.
 *
 * Example — After Effects: writes a command file, returns "...queued...",
 * and requires a separate `get-results` call. The agent would normally
 * have to remember to poll; with a policy, the registry does it.
 */
export interface AsyncToolPolicy {
  /** Name of the polling tool (called repeatedly until not queued). */
  pollToolName: string;
  /** Tool names that bypass the wrapper entirely (poll tool, help, lists). */
  skipTools?: string[];
  /** Inspect a raw ToolResult to determine if the action is still queued. */
  isQueued: (result: ToolResult) => boolean;
  /** Inspect a polled result — true means the action finished. Default: !isQueued. */
  isReady?: (result: ToolResult) => boolean;
  /**
   * When true, the executor calls `pollToolName` once BEFORE the real tool
   * to snapshot the pre-command state, then polls until the response
   * differs from that snapshot. Protects against the "shared result
   * buffer" pattern (e.g. AE's ae_mcp_result.json) where stale data from
   * a previous command looks identical to a successful fresh result.
   */
  captureBaseline?: boolean;
  /** Poll interval in ms. Default: 300. */
  pollIntervalMs?: number;
  /** Max wait for polling in ms. Default: 30_000. */
  pollDeadlineMs?: number;
  /** Per-turn idempotency TTL in ms. Default: 10_000. */
  idempotencyTtlMs?: number;
}

export interface ConnectorConfig {
  id: string;
  name: string;
  transport: TransportConfig;
  asyncPolicy?: AsyncToolPolicy;
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
  /** Populated when the executor can classify the failure. */
  error?: StructuredError;
  /** Wall time from call to completion (including polling). */
  durationMs?: number;
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
