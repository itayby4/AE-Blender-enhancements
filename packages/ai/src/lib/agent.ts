import type { Agent, AgentConfig, ChatOptions } from './types.js';
import type { Provider, ProviderMessage, ProviderToolResult, ProviderResponse } from '@pipefx/providers';
import { GeminiProvider, OpenAIProvider, AnthropicProvider } from '@pipefx/providers';
import { shouldCompact, compactHistory, DEFAULT_COMPACTION_CONFIG } from './compaction.js';

// ── Verbose agent-loop logging ───────────────────────────────────────────────
// Set PIPEFX_AI_LOG=debug to surface every turn:
//  - tool count + which planning/agent tools (TodoWrite / EnterPlanMode /
//    Agent / Task*) the model can see
//  - every tool call name + args preview
//  - tool result preview (truncated)
// Goes to stdout so it interleaves with the [Agents] logs from @pipefx/agents.
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
 * Resolve the correct Provider instance and model name for the given request.
 */
function resolveProvider(
  config: AgentConfig,
  providerOverride?: string
): { provider: Provider; model: string } {
  const id = providerOverride || 'gemini';

  if (id === 'claude-opus-4.6' || id === 'claude-sonnet-4.6' || id.startsWith('claude')) {
    if (!config.anthropicApiKey) throw new Error('Anthropic API key is not configured.');

    // Map UI model IDs to Anthropic API model identifiers
    const modelMap: Record<string, string> = {
      'claude-opus-4.6': 'claude-opus-4-6-20260401',
      'claude-sonnet-4.6': 'claude-sonnet-4-6-20260201',
    };

    return {
      provider: new AnthropicProvider(config.anthropicApiKey),
      model: modelMap[id] ?? id,
    };
  }

  if (id === 'gpt-5.4' || id.startsWith('gpt')) {
    if (!config.openaiApiKey) throw new Error('OpenAI API key is not configured.');
    return { provider: new OpenAIProvider(config.openaiApiKey), model: id };
  }

  // Default: Gemini
  return { provider: new GeminiProvider(config.apiKey), model: config.model };
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
 * Execute tool calls and return results.
 */
async function executeToolCalls(
  toolCalls: { id: string; name: string; args: Record<string, unknown> }[],
  config: AgentConfig,
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
        const result = await config.registry.callTool(call.name, call.args);
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
 * Creates an Agent with a unified tool-call loop that supports streaming.
 *
 * Inspired by Claw-Code's separation of concerns:
 * - Provider clients handle API format differences (crates/api/src/providers/)
 * - The conversation runtime runs a single provider-agnostic loop (crates/runtime/conversation.rs)
 */
export function createAgent(config: AgentConfig): Agent {
  return {
    async chat(message: string, options?: ChatOptions): Promise<string> {
      // Unconditional sentinel — prints even if PIPEFX_AI_LOG is unset so we
      // can tell from the log alone whether chat() was actually entered.
      console.log(
        `[AI] chat() entered provider=${options?.providerOverride || 'gemini'} msgChars=${message.length}`
      );
      const { provider, model } = resolveProvider(config, options?.providerOverride);
      const systemPrompt = options?.systemPromptOverride ?? config.systemPrompt;
      const useStreaming = !!options?.onStreamChunk;

      // Build tool list (optionally filtered by skill)
      let tools = await config.registry.getAllTools();
      if (options?.allowedTools) {
        const allowed = new Set(options.allowedTools);
        tools = tools.filter((t) => allowed.has(t.name));
      }
      if (options?.excludedTools && options.excludedTools.length > 0) {
        const excluded = new Set(options.excludedTools);
        tools = tools.filter((t) => !excluded.has(t.name));
      }

      // Log which tools the model sees this turn — especially planning tools.
      // If `planning: []` is empty, the agent package isn't wired and no amount
      // of prompting will make TodoWrite / PlanMode / Agent fire.
      if (isAiDebug()) {
        const planningPresent = tools
          .map((t) => t.name)
          .filter((n) => PLANNING_TOOL_NAMES.has(n));
        const planningMissing = Array.from(PLANNING_TOOL_NAMES).filter(
          (n) => !tools.some((t) => t.name === n)
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

      // ΓöÇΓöÇ Context Compaction ΓöÇΓöÇ
      // Check if the conversation is getting too long and compact if needed.
      if (shouldCompact(messages, DEFAULT_COMPACTION_CONFIG)) {
        const compactionResult = compactHistory(messages, DEFAULT_COMPACTION_CONFIG);
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
        if (!chatParams.tools.some((t) => t.name === 'EnterPlanMode')) return;
        chatParams.tools = chatParams.tools.filter((t) => t.name !== 'EnterPlanMode');
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

          const toolResults = await executeToolCalls(response.toolCalls, config, options);
          maybeStripEnterPlanMode(toolResults);

          if (options.getPostRoundReminder) {
            const argsByCallId = new Map(response.toolCalls.map((c) => [c.id, c.args]));
            const reminder = options.getPostRoundReminder({
              toolNames: toolResults.map((r) => r.name),
              toolCalls: toolResults.map((r) => ({
                name: r.name,
                args: argsByCallId.get(r.callId) ?? {},
                isError: r.isError === true,
              })),
              roundNumber: rounds,
            });
            appendReminderToLastResult(toolResults, reminder);
          }

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
        }

        return response.text ?? 'I processed your request, but I have no text response.';
      }

      // --- Non-streaming Agent Loop (backward compatible) ---
      let response = await provider.chat(chatParams);

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

        const toolResults = await executeToolCalls(response.toolCalls, config, options);
        maybeStripEnterPlanMode(toolResults);

        if (options?.getPostRoundReminder) {
          const argsByCallId = new Map(response.toolCalls.map((c) => [c.id, c.args]));
          const reminder = options.getPostRoundReminder({
            toolNames: toolResults.map((r) => r.name),
            toolCalls: toolResults.map((r) => ({
              name: r.name,
              args: argsByCallId.get(r.callId) ?? {},
              isError: r.isError === true,
            })),
            roundNumber: rounds,
          });
          appendReminderToLastResult(toolResults, reminder);
        }

        response = await provider.continueWithToolResults({
          ...chatParams,
          toolResults,
          previousResponse: response.raw,
        });
      }

      return response.text ?? 'I processed your request, but I have no text response.';
    },
  };
}
