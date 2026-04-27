import OpenAI from 'openai';
import { mapToolsToOpenAI } from './tool-mapper.js';
import type {
  Provider,
  ProviderResponse,
  StreamEvent,
  ChatParams,
  ContinueParams,
  UsageData,
} from './types.js';

/**
 * OpenAI provider — wraps the OpenAI SDK with streaming support.
 */
export class OpenAIProvider implements Provider {
  readonly name = 'openai';
  private client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
  }

  async chat(params: ChatParams): Promise<ProviderResponse> {
    const openAiTools = mapToolsToOpenAI(params.tools);
    const messages: OpenAI.ChatCompletionMessageParam[] = [
      { role: 'system', content: params.systemPrompt },
      ...params.messages.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
    ];

    const response = await this.client.chat.completions.create({
      model: params.model,
      messages,
      tools: openAiTools.length > 0 ? openAiTools : undefined,
    });

    return this.parseResponse(response);
  }

  async continueWithToolResults(params: ContinueParams): Promise<ProviderResponse> {
    const openAiTools = mapToolsToOpenAI(params.tools);

    const messages: any[] = [
      { role: 'system', content: params.systemPrompt },
      ...params.messages.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
    ];

    if (params.previousResponse) {
      messages.push(params.previousResponse);
    }

    for (const tr of params.toolResults) {
      messages.push({
        tool_call_id: tr.callId,
        role: 'tool' as const,
        name: tr.name,
        content: tr.content,
      });
    }

    const response = await this.client.chat.completions.create({
      model: params.model,
      messages,
      tools: openAiTools.length > 0 ? openAiTools : undefined,
    });

    return this.parseResponse(response);
  }

  async *chatStream(params: ChatParams): AsyncGenerator<StreamEvent> {
    const openAiTools = mapToolsToOpenAI(params.tools);
    const messages: OpenAI.ChatCompletionMessageParam[] = [
      { role: 'system', content: params.systemPrompt },
      ...params.messages.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
    ];

    yield* this.streamCompletion(params.model, messages, openAiTools);
  }

  async *continueWithToolResultsStream(params: ContinueParams): AsyncGenerator<StreamEvent> {
    const openAiTools = mapToolsToOpenAI(params.tools);

    const messages: any[] = [
      { role: 'system', content: params.systemPrompt },
      ...params.messages.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
    ];

    if (params.previousResponse) {
      messages.push(params.previousResponse);
    }

    for (const tr of params.toolResults) {
      messages.push({
        tool_call_id: tr.callId,
        role: 'tool' as const,
        name: tr.name,
        content: tr.content,
      });
    }

    yield* this.streamCompletion(params.model, messages, openAiTools);
  }

  private async *streamCompletion(
    model: string,
    messages: any[],
    tools: any[]
  ): AsyncGenerator<StreamEvent> {
    const stream = await this.client.chat.completions.create({
      model,
      messages,
      tools: tools.length > 0 ? tools : undefined,
      stream: true,
      stream_options: { include_usage: true },
    });

    let fullText = '';
    // Accumulate tool calls from deltas
    const toolCallMap = new Map<number, { id: string; name: string; args: string }>();
    // Usage data from the final chunk (requires stream_options.include_usage)
    let streamUsage: any = null;

    for await (const chunk of stream) {
      // Capture usage from the final chunk (sent when include_usage is true)
      if ((chunk as any).usage) {
        streamUsage = (chunk as any).usage;
      }
      const delta = chunk.choices[0]?.delta;
      if (!delta) continue;

      // Text content
      if (delta.content) {
        fullText += delta.content;
        yield { type: 'text', text: delta.content };
      }

      // Tool call deltas (streamed incrementally)
      if (delta.tool_calls) {
        for (const tc of delta.tool_calls) {
          const idx = tc.index;
          if (!toolCallMap.has(idx)) {
            toolCallMap.set(idx, { id: tc.id ?? '', name: '', args: '' });
          }
          const entry = toolCallMap.get(idx)!;
          if (tc.id) entry.id = tc.id;
          if ((tc as any).function?.name) entry.name += (tc as any).function.name;
          if ((tc as any).function?.arguments) entry.args += (tc as any).function.arguments;
        }
      }
    }

    // Emit accumulated tool calls
    const toolCalls = Array.from(toolCallMap.values()).map((tc) => ({
      id: tc.id,
      name: tc.name,
      args: tc.args ? (JSON.parse(tc.args) as Record<string, unknown>) : {},
    }));

    for (const toolCall of toolCalls) {
      yield { type: 'tool_call', toolCall };
    }

    // Build raw assistant message for continueWithToolResults
    const rawMsg = toolCalls.length > 0 ? {
      role: 'assistant',
      content: fullText || null,
      tool_calls: Array.from(toolCallMap.values()).map((tc) => ({
        id: tc.id,
        type: 'function',
        function: { name: tc.name, arguments: tc.args },
      })),
    } : undefined;

    yield {
      type: 'done',
      response: {
        text: fullText || null,
        toolCalls,
        raw: rawMsg,
        usage: streamUsage ? this.extractUsageFromRaw(streamUsage, model) : null,
      },
    };
  }

  private parseResponse(response: OpenAI.ChatCompletion): ProviderResponse {
    const choice = response.choices[0];
    const msg = choice.message;

    const toolCalls = (msg.tool_calls ?? []).map((call: any) => ({
      id: call.id,
      name: call.function.name,
      args: JSON.parse(call.function.arguments) as Record<string, unknown>,
    }));

    return {
      text: msg.content ?? null,
      toolCalls,
      raw: toolCalls.length > 0 ? msg : undefined,
      usage: this.extractUsageFromRaw(response.usage, response.model),
    };
  }

  /**
   * Extract token usage from OpenAI's usage object.
   * Handles reasoning_tokens from completion_tokens_details for o-series models.
   */
  private extractUsageFromRaw(usage: any, model: string): UsageData | null {
    if (!usage) return null;
    const reasoning = usage.completion_tokens_details?.reasoning_tokens ?? 0;
    return {
      inputTokens: usage.prompt_tokens ?? 0,
      outputTokens: (usage.completion_tokens ?? 0) - reasoning,
      thinkingTokens: reasoning,
      cachedTokens: usage.prompt_tokens_details?.cached_tokens ?? 0,
      totalTokens: usage.total_tokens ?? 0,
      model,
      provider: 'openai',
    };
  }
}
