import Anthropic from '@anthropic-ai/sdk';
import { mapToolsToAnthropic } from './tool-mapper.js';
import type {
  Provider,
  ProviderResponse,
  StreamEvent,
  ChatParams,
  ContinueParams,
  UsageData,
} from './types.js';

/**
 * Anthropic (Claude) provider — wraps the Anthropic SDK with streaming support.
 *
 * Prompt caching: a `cache_control: { type: 'ephemeral' }` breakpoint is set
 * on (a) the system prompt and (b) the last tool in the tools array. Anthropic
 * caches all content up to and including each breakpoint for ~5 min, so the
 * stable system + tool prefix is reused across turns within a chat. The
 * provider already extracts `cache_read_input_tokens` for usage tracking.
 *
 * Anthropic silently skips caching when the cached prefix is below the
 * minimum-token threshold (≥1024 for Sonnet, ≥2048 for Haiku at the time of
 * writing). No correctness impact — small prompts simply won't benefit.
 */
export class AnthropicProvider implements Provider {
  readonly name = 'anthropic';
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async chat(params: ChatParams): Promise<ProviderResponse> {
    const { system, tools } = this.withCacheBreakpoints(
      params.systemPrompt,
      mapToolsToAnthropic(params.tools)
    );
    const messages: Anthropic.MessageParam[] = params.messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));

    const response = await this.client.messages.create({
      model: params.model,
      system,
      max_tokens: 4000,
      messages,
      tools: tools.length > 0 ? tools : undefined,
    });

    return this.parseResponse(response);
  }

  async continueWithToolResults(params: ContinueParams): Promise<ProviderResponse> {
    const messages = this.buildContinueMessages(params);
    const { system, tools } = this.withCacheBreakpoints(
      params.systemPrompt,
      mapToolsToAnthropic(params.tools)
    );

    const response = await this.client.messages.create({
      model: params.model,
      system,
      max_tokens: 4000,
      messages,
      tools: tools.length > 0 ? tools : undefined,
    });

    return this.parseResponse(response);
  }

  async *chatStream(params: ChatParams): AsyncGenerator<StreamEvent> {
    const { system, tools } = this.withCacheBreakpoints(
      params.systemPrompt,
      mapToolsToAnthropic(params.tools)
    );
    const messages: Anthropic.MessageParam[] = params.messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));

    yield* this.streamMessage(params.model, system, messages, tools);
  }

  async *continueWithToolResultsStream(params: ContinueParams): AsyncGenerator<StreamEvent> {
    const messages = this.buildContinueMessages(params);
    const { system, tools } = this.withCacheBreakpoints(
      params.systemPrompt,
      mapToolsToAnthropic(params.tools)
    );

    yield* this.streamMessage(params.model, system, messages, tools);
  }

  /**
   * Build a system+tools pair carrying ephemeral cache breakpoints.
   *
   * - System: wrapped in a single text block with cache_control when non-empty.
   *   Empty/whitespace-only prompts pass through as the original string so the
   *   SDK call shape matches what we sent before this change.
   * - Tools: the LAST tool gets cache_control. One breakpoint at the tail
   *   caches every preceding tool too.
   */
  private withCacheBreakpoints(
    systemPrompt: string,
    tools: ReturnType<typeof mapToolsToAnthropic>
  ): {
    system: Anthropic.MessageCreateParams['system'];
    tools: ReturnType<typeof mapToolsToAnthropic>;
  } {
    const system: Anthropic.MessageCreateParams['system'] =
      systemPrompt && systemPrompt.length > 0
        ? [
            {
              type: 'text',
              text: systemPrompt,
              cache_control: { type: 'ephemeral' },
            },
          ]
        : systemPrompt;

    const cachedTools =
      tools.length === 0
        ? tools
        : [
            ...tools.slice(0, -1),
            {
              ...tools[tools.length - 1],
              cache_control: { type: 'ephemeral' as const },
            },
          ];

    return { system, tools: cachedTools };
  }

  private async *streamMessage(
    model: string,
    system: Anthropic.MessageCreateParams['system'],
    messages: Anthropic.MessageParam[],
    tools: any[]
  ): AsyncGenerator<StreamEvent> {
    const stream = this.client.messages.stream({
      model,
      system,
      max_tokens: 4000,
      messages,
      tools: tools.length > 0 ? tools : undefined,
    });

    let fullText = '';
    const toolCalls: { id: string; name: string; args: Record<string, unknown> }[] = [];
    const contentBlocks: Anthropic.ContentBlock[] = [];

    for await (const event of stream) {
      if (event.type === 'content_block_delta') {
        const delta = event.delta;
        if (delta.type === 'text_delta') {
          fullText += delta.text;
          yield { type: 'text', text: delta.text };
        }
      } else if (event.type === 'content_block_stop') {
        // After a content block completes, check if it was a tool_use
        // We'll grab it from the final message
      } else if (event.type === 'message_stop') {
        // Final message — extract tool calls
        const finalMessage = await stream.finalMessage();
        for (const block of finalMessage.content) {
          contentBlocks.push(block);
          if (block.type === 'tool_use') {
            const toolCall = {
              id: block.id,
              name: block.name,
              args: block.input as Record<string, unknown>,
            };
            toolCalls.push(toolCall);
            yield { type: 'tool_call', toolCall };
          }
        }
      }
    }

    // Get the final message for usage data (if we haven't already)
    let finalMsg: Anthropic.Message | null = null;
    try {
      finalMsg = await stream.finalMessage();
    } catch {
      /* stream may already be consumed */
    }

    yield {
      type: 'done',
      response: {
        text: fullText || null,
        toolCalls,
        raw: toolCalls.length > 0 ? contentBlocks : undefined,
        usage: finalMsg ? this.extractUsage(finalMsg) : null,
      },
    };
  }

  private buildContinueMessages(params: ContinueParams): Anthropic.MessageParam[] {
    const messages: Anthropic.MessageParam[] = params.messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));

    if (params.previousResponse) {
      messages.push({
        role: 'assistant',
        content: params.previousResponse as Anthropic.ContentBlock[],
      });
    }

    const toolResultBlocks: Anthropic.ToolResultBlockParam[] =
      params.toolResults.map((tr) => ({
        type: 'tool_result' as const,
        tool_use_id: tr.callId,
        content: tr.content,
        is_error: tr.isError,
      }));

    messages.push({ role: 'user', content: toolResultBlocks });
    return messages;
  }

  private parseResponse(response: Anthropic.Message): ProviderResponse {
    const toolCalls = response.content
      .filter((c): c is Anthropic.ToolUseBlock => c.type === 'tool_use')
      .map((call) => ({
        id: call.id,
        name: call.name,
        args: call.input as Record<string, unknown>,
      }));

    const textBlock = response.content.find((c) => c.type === 'text');
    const text = textBlock?.type === 'text' ? textBlock.text : null;

    return {
      text,
      toolCalls,
      raw: toolCalls.length > 0 ? response.content : undefined,
      usage: this.extractUsage(response),
    };
  }

  /**
   * Extract token usage from an Anthropic Message's usage field.
   * Handles cache_read_input_tokens from their prompt caching API.
   */
  private extractUsage(response: Anthropic.Message): UsageData | null {
    const u = response.usage;
    if (!u) return null;
    const input = u.input_tokens ?? 0;
    const output = u.output_tokens ?? 0;
    const cached = (u as any).cache_read_input_tokens ?? 0;
    return {
      inputTokens: input,
      outputTokens: output,
      thinkingTokens: 0,
      cachedTokens: cached,
      totalTokens: input + output,
      model: response.model,
      provider: 'anthropic',
    };
  }
}
