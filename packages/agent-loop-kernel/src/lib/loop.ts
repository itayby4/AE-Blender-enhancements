import type {
  ProviderMessage,
  ProviderToolResult,
  ProviderResponse,
  UsageData,
} from '@pipefx/llm-providers';
import type { ToolDescriptor } from '@pipefx/connectors-contracts';
import type {
  AggregatedUsage,
  ChatOptions,
  LoopContext,
} from './types.js';
import {
  shouldCompact,
  compactHistoryAsync,
  DEFAULT_COMPACTION_CONFIG,
} from './compaction.js';
import {
  createLoopGuard,
  DEFAULT_LOOP_GUARD_CONFIG,
  type LoopGuard,
  type LoopGuardOutcome,
} from './loop-guard.js';

// ── Verbose agent-loop logging ───────────────────────────────────────────────
// Set PIPEFX_AI_LOG=debug to surface every turn:
//  - tool count + which planning/agent tools (TodoWrite / EnterPlanMode /
//    Agent / Task*) the model can see
//  - every tool call name + args preview
//  - tool result preview (truncated)
// Goes to stdout so it interleaves with sub-agent logs from @pipefx/brain-subagents.
//
// Resolved at call time (not module-load) so dotenv loaded by the host app
// after this module is imported still takes effect.
function isAiDebug(): boolean {
  return (process.env.PIPEFX_AI_LOG || '').toLowerCase() === 'debug';
}
const PLANNING_TOOL_NAMES = new Set([
  'TodoWrite',
  'EnterPlanMode',
  'ExitPlanMode',
  'Agent',
  'TaskCreate',
  'TaskList',
  'TaskGet',
  'TaskUpdate',
  'TaskStop',
  'TaskOutput',
]);

// Hard cap on tool-call rounds per chat turn. Without this, a misbehaving
// model (observed with GPT-5.4) can ping-pong bridge-health / EnterPlanMode /
// TodoWrite forever until the 2-minute request timeout aborts the stream.
const MAX_TOOL_ROUNDS = 25;

// Marker substrings in EnterPlanMode tool-result content that indicate the
// plan mode has resolved (either approved or the re-entry was blocked). Once
// we see one, we strip EnterPlanMode from the tool list for the rest of the
// turn so the model physically can't re-call it.
const PLAN_APPROVED_MARKERS = [
  'Plan approved. Proceed with execution.',
  'A plan has ALREADY been approved',
];

function aiLog(event: string, ctx?: Record<string, unknown>): void {
  if (!isAiDebug()) return;
  const parts: string[] = [];
  if (ctx) {
    for (const [k, v] of Object.entries(ctx)) {
      if (v === undefined) continue;
      const s = typeof v === 'string' ? v : (() => {
        try { return JSON.stringify(v); } catch { return String(v); }
      })();
      parts.push(`${k}=${s.length > 200 ? s.slice(0, 200) + '…' : s}`);
    }
  }
  console.log(`[AI] ${event}${parts.length ? ' ' + parts.join(' ') : ''}`);
}

/**
 * Extract text content from an MCP tool result.
 */
function extractToolContent(result: any): string {
  if (Array.isArray(result.content)) {
    return result.content
      .filter((c: any) => c.type === 'text')
      .map((c: any) => c.text)
      .join('\n');
  }
  return String(result.content);
}

/**
 * Detect an error payload that a well-behaved MCP server would have flagged
 * with `isError: true`, but ours don't (yet). Matches the two shapes we've
 * seen in the wild:
 *
 *   { "status": "error", "message": "..." }
 *   { "error": "..." }
 *
 * Returns the extracted error message, or null if the content does not look
 * like an error payload.
 *
 * Purely a heuristic — if the content isn't JSON or the shape doesn't match,
 * we fall back to treating it as a success. The correct long-term fix is for
 * the underlying MCP servers to set `isError: true` themselves.
 */
function detectErrorInSuccessfulResult(content: string): string | null {
  const trimmed = content.trim();
  if (!trimmed.startsWith('{')) return null;
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === 'object') {
      if (parsed.status === 'error' && typeof parsed.message === 'string') {
        return parsed.message;
      }
      if (typeof parsed.error === 'string') {
        return parsed.error;
      }
      if (parsed.error && typeof parsed.error === 'object' && typeof parsed.error.message === 'string') {
        return parsed.error.message;
      }
    }
  } catch {
    // not JSON — not an error payload we recognize
  }
  return null;
}

/**
 * Wrap an error string in the `<tool_use_error>` tag that OpenClaude uses.
 * The model is trained to recognize this structural marker as a tool failure
 * rather than opaque tool output.
 *
 * Matches the exact format in
 * yasasbanukaofficial/claude-code:src/services/tools/toolExecution.ts.
 */
function wrapToolUseError(message: string): string {
  return `<tool_use_error>${message}</tool_use_error>`;
}

/**
 * Append a <system-reminder> block to the last tool result in a batch.
 * Mutates the array in place. No-op if results is empty or reminder is falsy.
 */
function appendReminderToLastResult(
  toolResults: ProviderToolResult[],
  reminder: string | null | undefined
): void {
  if (!reminder || toolResults.length === 0) return;
  const last = toolResults[toolResults.length - 1];
  last.content = `${last.content}\n\n<system-reminder>\n${reminder}\n</system-reminder>`;
}

/**
 * Merge guard + caller reminders into a single <system-reminder> on the last
 * tool result. Either may be null; if both are empty, no-op.
 */
function applyReminders(
  toolResults: ProviderToolResult[],
  guardReminder: string | null,
  callerReminder: string | null | undefined
): void {
  const parts = [guardReminder, callerReminder].filter(
    (r): r is string => typeof r === 'string' && r.length > 0
  );
  if (parts.length === 0) return;
  appendReminderToLastResult(toolResults, parts.join('\n\n'));
}

/**
 * Build the abort message returned when the loop guard trips. Prefers any
 * partial assistant text the model already produced; otherwise emits a clear
 * explanation that the user can read directly.
 */
function buildGuardAbortMessage(
  outcome: NonNullable<LoopGuardOutcome['abortedOn']>,
  partialText: string | null
): string {
  if (partialText && partialText.length > 0) return partialText;
  return (
    `I had to stop — I kept calling ${outcome.name} with the same arguments ` +
    `and got the same result. Try rephrasing the request or breaking it into smaller steps.`
  );
}

/**
 * Execute tool calls and return results.
 */
async function executeToolCalls(
  toolCalls: { id: string; name: string; args: Record<string, unknown> }[],
  registry: LoopContext['registry'],
  options?: ChatOptions
): Promise<ProviderToolResult[]> {
  if (isAiDebug()) {
    aiLog('tool batch', {
      count: toolCalls.length,
      names: toolCalls.map((c) => c.name),
    });
  }
  return Promise.all(
    toolCalls.map(async (call) => {
      const planning = PLANNING_TOOL_NAMES.has(call.name);
      aiLog('tool call', {
        name: call.name,
        planning: planning || undefined,
        args: call.args,
      });
      try {
        if (options?.onToolCallStart) {
          options.onToolCallStart(call.name, call.args);
        }
        const result = await registry.callTool(call.name, call.args);
        if (options?.onToolCallComplete) {
          options.onToolCallComplete(call.name, result);
        }
        const content = extractToolContent(result);

        // ── Error classification (OpenClaude-style) ──────────────────────
        // Two sources of "this tool failed":
        //   1. The MCP protocol's explicit `isError: true` flag on the result.
        //   2. An AE-style `{"status":"error","message":"..."}` payload that
        //      the MCP server forgot to flag. Heuristic — see
        //      detectErrorInSuccessfulResult().
        //
        // In either case we wrap the message in <tool_use_error>...</> so
        // the model sees a structural failure marker, not opaque output.
        // Mirrors yasasbanukaofficial/claude-code:toolExecution.ts.
        const protocolError = result.isError === true;
        const detectedError = protocolError ? null : detectErrorInSuccessfulResult(content);
        const isError = protocolError || detectedError !== null;

        if (isError) {
          const errorMessage = detectedError ?? content;
          const wrapped = wrapToolUseError(errorMessage);
          aiLog('tool result', {
            name: call.name,
            ok: false,
            source: protocolError ? 'mcp-isError' : 'detected-status-error',
            error: errorMessage.slice(0, 200),
          });
          return {
            callId: call.id,
            name: call.name,
            content: wrapped,
            isError: true,
          };
        }

        aiLog('tool result', {
          name: call.name,
          ok: true,
          contentLen: content.length,
          preview: content.slice(0, 160),
        });
        return {
          callId: call.id,
          name: call.name,
          content,
        };
      } catch (err: unknown) {
        const error = err instanceof Error ? err : new Error(String(err));
        aiLog('tool result', {
          name: call.name,
          ok: false,
          source: 'exception',
          error: error.message,
        });
        if (options?.onToolCallComplete) {
          options.onToolCallComplete(call.name, null, error);
        }
        // OpenClaude-exact wording:
        //   <tool_use_error>Error calling tool (toolName): message</tool_use_error>
        return {
          callId: call.id,
          name: call.name,
          content: wrapToolUseError(`Error calling tool (${call.name}): ${error.message}`),
          isError: true,
        };
      }
    })
  );
}

/**
 * Provider-agnostic tool-use loop. Takes a resolved Provider + registry and
 * runs the streaming or non-streaming chat turn.
 *
 * Has no knowledge of provider names, API keys, model-name mapping, or
 * system-prompt construction — callers do that before delegating here.
 *
 * Inspired by Claw-Code's separation of concerns:
 * - Provider clients handle API format differences (crates/api/src/providers/)
 * - The conversation runtime runs a single provider-agnostic loop
 *   (crates/runtime/conversation.rs)
 */
export async function runAgentLoop(
  ctx: LoopContext,
  message: string,
  options?: ChatOptions
): Promise<string> {
  // Unconditional sentinel — prints even if PIPEFX_AI_LOG is unset so we
  // can tell from the log alone whether the loop was actually entered.
  console.log(
    `[AI] chat() entered provider=${options?.providerOverride || 'gemini'} msgChars=${message.length}`
  );

  const { provider, model, systemPrompt, registry, summarizer } = ctx;
  const useStreaming = !!options?.onStreamChunk;

  // Build tool list (optionally filtered by skill)
  let tools = await registry.listTools();
  if (options?.allowedTools) {
    const allowed = new Set(options.allowedTools);
    tools = tools.filter((t: ToolDescriptor) => allowed.has(t.name));
  }
  if (options?.excludedTools && options.excludedTools.length > 0) {
    const excluded = new Set(options.excludedTools);
    tools = tools.filter((t: ToolDescriptor) => !excluded.has(t.name));
  }

  // Log which tools the model sees this turn — especially planning tools.
  // If `planning: []` is empty, the agent package isn't wired and no amount
  // of prompting will make TodoWrite / PlanMode / Agent fire.
  if (isAiDebug()) {
    const planningPresent = tools
      .map((t: ToolDescriptor) => t.name)
      .filter((n: string) => PLANNING_TOOL_NAMES.has(n));
    const planningMissing = Array.from(PLANNING_TOOL_NAMES).filter(
      (n: string) => !tools.some((t: ToolDescriptor) => t.name === n)
    );
    aiLog('turn start', {
      provider: options?.providerOverride || 'gemini',
      model,
      streaming: useStreaming,
      totalTools: tools.length,
      planningPresent,
      planningMissing: planningMissing.length ? planningMissing : undefined,
      allowedTools: options?.allowedTools?.length,
      excludedTools: options?.excludedTools?.length,
    });
  }

  // Normalize history from frontend format to ProviderMessage[]
  const rawHistory: any[] = options?.history || [];
  let messages: ProviderMessage[] = rawHistory.map((m: any) => ({
    role: (m.role === 'model' ? 'assistant' : 'user') as 'user' | 'assistant',
    content: m.parts?.[0]?.text || '',
  }));
  messages.push({ role: 'user', content: message });

  // ── Context Compaction ──
  // Check if the conversation is getting too long and compact if needed.
  // Uses the async path so an injected LLM summarizer (e.g., Haiku) can replace
  // the heuristic baseline. Falls back to the heuristic on summarizer failure.
  if (shouldCompact(messages, DEFAULT_COMPACTION_CONFIG)) {
    const compactionResult = await compactHistoryAsync(
      messages,
      DEFAULT_COMPACTION_CONFIG,
      summarizer,
      options?.signal
    );
    if (compactionResult.removedCount > 0) {
      messages = compactionResult.compactedMessages;
      if (options?.onCompaction) {
        options.onCompaction(
          compactionResult.removedCount,
          compactionResult.summary
        );
      }
      console.log(
        `[Agent] Context compacted: removed ${compactionResult.removedCount} messages, ${messages.length} remaining`
      );
    }
  }

  const chatParams = { model, systemPrompt, messages, tools };

  // ── Usage tracking accumulator ─────────────────────────────────────
  // Collects UsageData from every LLM round so the caller can bill/log.
  const usageRounds: UsageData[] = [];
  const trackRoundUsage = (response: ProviderResponse, roundNumber: number): void => {
    if (response.usage) {
      usageRounds.push(response.usage);
      options?.onRoundUsage?.(response.usage, roundNumber);
    }
  };
  const emitAggregatedUsage = (toolCallRounds: number): void => {
    if (!options?.onUsage || usageRounds.length === 0) return;
    const aggregated: AggregatedUsage = {
      rounds: usageRounds,
      totalInputTokens: usageRounds.reduce((s, u) => s + u.inputTokens, 0),
      totalOutputTokens: usageRounds.reduce((s, u) => s + u.outputTokens, 0),
      totalThinkingTokens: usageRounds.reduce((s, u) => s + u.thinkingTokens, 0),
      totalCachedTokens: usageRounds.reduce((s, u) => s + u.cachedTokens, 0),
      toolCallRounds,
    };
    options.onUsage(aggregated);
  };

  // Per-turn loop guard — catches same-tool/same-args ping-pong before the
  // coarse MAX_TOOL_ROUNDS cap kicks in.
  const guard: LoopGuard = createLoopGuard(DEFAULT_LOOP_GUARD_CONFIG);

  // Once plan mode is approved (or blocked as already-approved), strip
  // EnterPlanMode from the tool list for the rest of this turn so the
  // model can't re-propose the same plan in a loop.
  const maybeStripEnterPlanMode = (toolResults: ProviderToolResult[]): void => {
    const triggered = toolResults.some(
      (r) =>
        r.name === 'EnterPlanMode' &&
        typeof r.content === 'string' &&
        PLAN_APPROVED_MARKERS.some((m) => r.content.includes(m))
    );
    if (!triggered) return;
    if (!chatParams.tools.some((t: ToolDescriptor) => t.name === 'EnterPlanMode')) return;
    chatParams.tools = chatParams.tools.filter((t: ToolDescriptor) => t.name !== 'EnterPlanMode');
    aiLog('strip EnterPlanMode', { reason: 'plan-resolved-mid-turn' });
  };

  // --- Streaming Agent Loop ---
  if (useStreaming) {
    if (options.signal?.aborted) throw new Error('AbortError');

    let response: ProviderResponse | null = null;

    // First round: stream initial chat
    const stream = provider.chatStream(chatParams);
    for await (const event of stream) {
      if (options.signal?.aborted) throw new Error('AbortError');
      if (event.type === 'text') {
        options.onStreamChunk!(event.text);
      } else if (event.type === 'done') {
        response = event.response;
      }
    }

    if (!response) throw new Error('Stream ended without done event');
    trackRoundUsage(response, 0); // Round 0 = initial response

    // Tool call loop (streaming)
    let rounds = 0;
    while (response.toolCalls.length > 0) {
      if (options.signal?.aborted) throw new Error('AbortError');
      if (++rounds > MAX_TOOL_ROUNDS) {
        console.warn(
          `[AI] tool-call loop exceeded ${MAX_TOOL_ROUNDS} rounds — aborting turn`
        );
        return (
          response.text ||
          `I had to stop — the tool-call loop exceeded ${MAX_TOOL_ROUNDS} rounds without producing a final answer.`
        );
      }

      // Emit intermediate text as thought
      if (response.text && options.onThought) {
        options.onThought(response.text);
      }

      const toolResults = await executeToolCalls(response.toolCalls, registry, options);
      maybeStripEnterPlanMode(toolResults);

      const guardOutcome = guard.observe({
        toolCalls: response.toolCalls.map((c) => ({ name: c.name, args: c.args })),
      });
      if (guardOutcome.abortedOn) {
        console.warn(
          `[AI] same tool/args called ${guardOutcome.abortedOn.count}× — aborting turn (${guardOutcome.abortedOn.name})`
        );
        return buildGuardAbortMessage(guardOutcome.abortedOn, response.text ?? null);
      }

      const argsByCallId = new Map(response.toolCalls.map((c) => [c.id, c.args]));
      const callerReminder = options.getPostRoundReminder
        ? options.getPostRoundReminder({
            toolNames: toolResults.map((r) => r.name),
            toolCalls: toolResults.map((r) => ({
              name: r.name,
              args: argsByCallId.get(r.callId) ?? {},
              isError: r.isError === true,
            })),
            roundNumber: rounds,
          })
        : null;
      applyReminders(toolResults, guardOutcome.reminder, callerReminder);

      // Continue with tool results (streaming)
      const continueStream = provider.continueWithToolResultsStream({
        ...chatParams,
        toolResults,
        previousResponse: response.raw,
      });

      response = null;
      for await (const event of continueStream) {
        if (options.signal?.aborted) throw new Error('AbortError');
        if (event.type === 'text') {
          options.onStreamChunk!(event.text);
        } else if (event.type === 'done') {
          response = event.response;
        }
      }

      if (!response) throw new Error('Stream ended without done event');
      trackRoundUsage(response, rounds);
    }

    emitAggregatedUsage(rounds);
    return response.text ?? 'I processed your request, but I have no text response.';
  }

  // --- Non-streaming Agent Loop (backward compatible) ---
  let response = await provider.chat(chatParams);
  trackRoundUsage(response, 0); // Round 0 = initial response

  let rounds = 0;
  while (response.toolCalls.length > 0) {
    if (options?.signal?.aborted) throw new Error('AbortError');
    if (++rounds > MAX_TOOL_ROUNDS) {
      console.warn(
        `[AI] tool-call loop exceeded ${MAX_TOOL_ROUNDS} rounds — aborting turn`
      );
      return (
        response.text ||
        `I had to stop — the tool-call loop exceeded ${MAX_TOOL_ROUNDS} rounds without producing a final answer.`
      );
    }

    if (response.text && options?.onThought) {
      options.onThought(response.text);
    }

    const toolResults = await executeToolCalls(response.toolCalls, registry, options);
    maybeStripEnterPlanMode(toolResults);

    const guardOutcome = guard.observe({
      toolCalls: response.toolCalls.map((c) => ({ name: c.name, args: c.args })),
    });
    if (guardOutcome.abortedOn) {
      console.warn(
        `[AI] same tool/args called ${guardOutcome.abortedOn.count}× — aborting turn (${guardOutcome.abortedOn.name})`
      );
      return buildGuardAbortMessage(guardOutcome.abortedOn, response.text ?? null);
    }

    const argsByCallId = new Map(response.toolCalls.map((c) => [c.id, c.args]));
    const callerReminder = options?.getPostRoundReminder
      ? options.getPostRoundReminder({
          toolNames: toolResults.map((r) => r.name),
          toolCalls: toolResults.map((r) => ({
            name: r.name,
            args: argsByCallId.get(r.callId) ?? {},
            isError: r.isError === true,
          })),
          roundNumber: rounds,
        })
      : null;
    applyReminders(toolResults, guardOutcome.reminder, callerReminder);

    response = await provider.continueWithToolResults({
      ...chatParams,
      toolResults,
      previousResponse: response.raw,
    });
    trackRoundUsage(response, rounds);
  }

  emitAggregatedUsage(rounds);
  return response.text ?? 'I processed your request, but I have no text response.';
}
