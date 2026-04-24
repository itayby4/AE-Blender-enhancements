export type {
  StdioTransportConfig,
  SseTransportConfig,
  TransportConfig,
} from '@pipefx/mcp-transport';

/**
 * Opaque identifier for a registered connector (e.g. 'resolve', 'premiere').
 * Kept as a plain string for now — promoted to a branded type later if we
 * need stronger distinction at call sites.
 */
export type ConnectorId = string;

/**
 * Lifecycle state of a connector. `connecting` covers the initial dial and
 * any auto-reconnect attempt; `error` is a terminal failure the registry
 * gave up on (exhausted cooldown + retries).
 */
export type ConnectorStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'error';

/**
 * Structured error attached to a ToolCallResult when the executor can classify
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
  /** Inspect a raw ToolCallResult to determine if the action is still queued. */
  isQueued: (result: ToolCallResult) => boolean;
  /** Inspect a polled result — true means the action finished. Default: !isQueued. */
  isReady?: (result: ToolCallResult) => boolean;
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

import type { TransportConfig } from '@pipefx/mcp-transport';

export interface ConnectorConfig {
  id: ConnectorId;
  name: string;
  transport: TransportConfig;
  asyncPolicy?: AsyncToolPolicy;
}

/**
 * Public descriptor for a tool exposed by a connector. The descriptor is
 * what the agent loop sees; the underlying callable lives on the owning
 * connector.
 */
export interface ToolDescriptor {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
  /** Which connector owns this tool. 'local' for registry-local tools. */
  connectorId: ConnectorId | 'local';
}

export interface ToolCallResult {
  content: unknown;
  isError?: boolean;
  /** Populated when the executor can classify the failure. */
  error?: StructuredError;
  /** Wall time from call to completion (including polling). */
  durationMs?: number;
}

/**
 * Live connection to one MCP server. Implementations live in
 * `@pipefx/connectors/domain` — contracts only declare the shape so
 * platform packages (agent-loop-kernel, llm-providers, brain-loop) can
 * import types without reaching into the feature package.
 */
export interface Connector {
  readonly config: ConnectorConfig;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  reconnect(): Promise<void>;
  listTools(): Promise<ToolDescriptor[]>;
  callTool(
    name: string,
    args: Record<string, unknown>
  ): Promise<ToolCallResult>;
  isConnected(): boolean;
}

/**
 * Declarative description of the capabilities a connector exposes. Lives
 * alongside the MCP app (e.g. `apps/mcp-davinci/capabilities.json`) and is
 * loaded opportunistically by the registry. When absent, the registry falls
 * back to a namespace-from-tool-name heuristic (see `deriveCapabilities`).
 *
 * Phase 7 (Skills) subscribes to `mcp.tools.changed` and runs the capability
 * map to decide which skills light up for the current connector set.
 */
export interface ConnectorCapabilityManifest {
  /** Must match the owning ConnectorConfig.id. */
  connectorId: ConnectorId;
  /**
   * Dotted capability identifiers this connector exposes
   * (e.g. `resolve.timeline.*`, `video.ffmpeg.probe`).
   */
  capabilities: string[];
  /**
   * Optional per-tool override: map tool name → one or more capability ids.
   * Useful when a single tool contributes to several capabilities, or when
   * the tool name does not decompose cleanly under the default heuristic.
   */
  toolCapabilities?: Record<string, string[]>;
}

// ── Transitional aliases ──────────────────────────────────────────────────
// The phase-5 rename `Tool → ToolDescriptor` / `ToolResult → ToolCallResult`
// happens in a dedicated sweep (sub-phase 5.6). Until then these aliases keep
// existing call sites compiling unchanged while they migrate onto the
// contracts package.
export type Tool = ToolDescriptor;
export type ToolResult = ToolCallResult;
