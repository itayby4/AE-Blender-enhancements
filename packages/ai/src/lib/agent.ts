import type { Agent, AgentConfig, ChatOptions } from './types.js';
import type { Provider, ProviderMessage, ProviderToolResult, ProviderResponse } from './providers/types.js';
import { GeminiProvider } from './providers/gemini.js';
import { OpenAIProvider } from './providers/openai.js';
import { AnthropicProvider } from './providers/anthropic.js';
import { shouldCompact, compactHistory, DEFAULT_COMPACTION_CONFIG } from './compaction.js';

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
 * Execute tool calls and return results.
 */
async function executeToolCalls(
  toolCalls: { id: string; name: string; args: Record<string, unknown> }[],
  config: AgentConfig,
  options?: ChatOptions
): Promise<ProviderToolResult[]> {
  return Promise.all(
    toolCalls.map(async (call) => {
      try {
        if (options?.onToolCallStart) {
          options.onToolCallStart(call.name, call.args);
        }
        const result = await config.registry.callTool(call.name, call.args);
        if (options?.onToolCallComplete) {
          options.onToolCallComplete(call.name, result);
        }
        return {
          callId: call.id,
          name: call.name,
          content: extractToolContent(result),
        };
      } catch (err: unknown) {
        const error = err instanceof Error ? err : new Error(String(err));
        if (options?.onToolCallComplete) {
          options.onToolCallComplete(call.name, null, error);
        }
        return {
          callId: call.id,
          name: call.name,
          content: String(err),
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
      const { provider, model } = resolveProvider(config, options?.providerOverride);
      const systemPrompt = options?.systemPromptOverride ?? config.systemPrompt;
      const useStreaming = !!options?.onStreamChunk;

      // Build tool list (optionally filtered by skill)
      let tools = await config.registry.getAllTools();
      if (options?.allowedTools) {
        const allowed = new Set(options.allowedTools);
        tools = tools.filter((t) => allowed.has(t.name));
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
        while (response.toolCalls.length > 0) {
          if (options.signal?.aborted) throw new Error('AbortError');

          // Emit intermediate text as thought
          if (response.text && options.onThought) {
            options.onThought(response.text);
          }

          const toolResults = await executeToolCalls(response.toolCalls, config, options);

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

      while (response.toolCalls.length > 0) {
        if (options?.signal?.aborted) throw new Error('AbortError');

        if (response.text && options?.onThought) {
          options.onThought(response.text);
        }

        const toolResults = await executeToolCalls(response.toolCalls, config, options);

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
