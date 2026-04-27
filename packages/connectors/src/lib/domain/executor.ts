import type {
  AsyncToolPolicy,
  Connector,
  StructuredError,
  ToolCallResult,
} from '@pipefx/connectors-contracts';

const DEFAULT_POLL_INTERVAL_MS = 300;
const DEFAULT_POLL_DEADLINE_MS = 30_000;
const DEFAULT_IDEMPOTENCY_TTL_MS = 10_000;

/**
 * Stable hash of tool args. Sorts keys so `{a:1,b:2}` and `{b:2,a:1}`
 * map to the same key — prevents cache misses on logically-identical calls.
 */
export function hashArgs(args: Record<string, unknown>): string {
  return JSON.stringify(args, Object.keys(args).sort());
}

interface CacheEntry {
  result: ToolCallResult;
  expiresAt: number;
}

/**
 * Per-connector cache keyed by `toolName::argsHash`. Short TTL (default 10s)
 * catches same-turn retries — the architectural guarantee that the agent
 * can't accidentally create duplicates by re-issuing the same call.
 */
export class IdempotencyCache {
  private entries = new Map<string, CacheEntry>();

  get(key: string): ToolCallResult | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt < Date.now()) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.result;
  }

  set(key: string, result: ToolCallResult, ttlMs: number): void {
    this.entries.set(key, { result, expiresAt: Date.now() + ttlMs });
  }

  clear(): void {
    this.entries.clear();
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function structuredError(
  code: string,
  message: string,
  recoverable: boolean,
  hint?: string
): StructuredError {
  return { code, message, recoverable, hint };
}

/**
 * Flatten a ToolCallResult's content to a string we can compare across polls.
 * MCP returns content as a block array; stringifying it gives us a stable
 * fingerprint for "did the response change since last poll?".
 */
function fingerprint(result: ToolCallResult): string {
  try {
    return JSON.stringify(result.content);
  } catch {
    return String(result.content);
  }
}

/**
 * Wrap a single tool call with the connector's async policy:
 *   1. If queued, poll the policy's poll-tool until ready or deadline.
 *   2. Return a ToolCallResult with `durationMs` and, on failure, `error`.
 */
export async function executeWithPolicy(
  connector: Connector,
  toolName: string,
  args: Record<string, unknown>,
  policy: AsyncToolPolicy
): Promise<ToolCallResult> {
  const start = Date.now();
  const deadline = start + (policy.pollDeadlineMs ?? DEFAULT_POLL_DEADLINE_MS);
  const interval = policy.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const isReady = policy.isReady ?? ((r: ToolCallResult) => !policy.isQueued(r));

  // Snapshot pre-state when the policy asks for it. Any later poll
  // matching this fingerprint is considered stale and keeps waiting.
  let baseline: string | null = null;
  if (policy.captureBaseline) {
    try {
      const pre = await connector.callTool(policy.pollToolName, {});
      baseline = fingerprint(pre);
    } catch {
      // Baseline capture is best-effort — if it fails, fall back to
      // regex-only readiness checks below.
    }
  }

  const initial = await connector.callTool(toolName, args);
  if (!policy.isQueued(initial)) {
    return { ...initial, durationMs: Date.now() - start };
  }

  const debug = process.env.PIPEFX_EXECUTOR_DEBUG === '1';
  if (debug) {
    console.log(
      `[executor] "${toolName}" queued, polling "${policy.pollToolName}"...`
    );
  }

  // Queued — poll until ready. The agent never sees the "queued" response;
  // it sees the final result as if the tool were synchronous.
  let polls = 0;
  while (Date.now() < deadline) {
    await sleep(interval);
    polls++;
    const polled = await connector.callTool(policy.pollToolName, {});

    // Baseline check: identical content = stale shared buffer, keep waiting.
    if (baseline !== null && fingerprint(polled) === baseline) {
      if (debug)
        console.log(
          `[executor] "${toolName}" poll#${polls}: matches baseline (stale)`
        );
      continue;
    }

    if (isReady(polled)) {
      if (debug)
        console.log(
          `[executor] "${toolName}" ready after ${polls} polls (${
            Date.now() - start
          }ms)`
        );
      return { ...polled, durationMs: Date.now() - start };
    }

    if (debug) {
      const preview = fingerprint(polled).slice(0, 120);
      console.log(
        `[executor] "${toolName}" poll#${polls}: not ready — ${preview}`
      );
    }
  }

  return {
    content: `Tool "${toolName}" was queued but no result arrived within ${
      policy.pollDeadlineMs ?? DEFAULT_POLL_DEADLINE_MS
    }ms.`,
    isError: true,
    durationMs: Date.now() - start,
    error: structuredError(
      'POLL_TIMEOUT',
      `No response from "${toolName}" before poll deadline.`,
      true,
      `Check that the host application (e.g. After Effects) is running and the MCP bridge panel is open, then retry.`
    ),
  };
}

export { DEFAULT_IDEMPOTENCY_TTL_MS };
