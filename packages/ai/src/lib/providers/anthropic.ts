import Anthropic from '@anthropic-ai/sdk';
import { mapToolsToAnthropic } from '../tool-mapper.js';
import type {
  Provider,
  ProviderResponse,
  StreamEvent,
  ChatParams,
  ContinueParams,
} from './types.js';

/**
 * Anthropic (Claude) provider ΓÇö wraps the Anthropic SDK with streaming support.
 */
export class AnthropicProvider implements Provider {
  readonly name = 'anthropic';
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async chat(params: ChatParams): Promise<ProviderResponse> {
    const claudeTools = mapToolsToAnthropic(params.tools);
    const messages: Anthropic.MessageParam[] = params.messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));

    const response = await this.client.messages.create({
      model: params.model,
      system: params.systemPrompt,
      max_tokens: 4000,
      messages,
      tools: claudeTools.length > 0 ? claudeTools : undefined,
    });

    return this.parseResponse(response);
  }

  async continueWithToolResults(params: ContinueParams): Promise<ProviderResponse> {
    const messages = this.buildContinueMessages(params);
    const claudeTools = mapToolsToAnthropic(params.tools);

    const response = await this.client.messages.create({
      model: params.model,
      system: params.systemPrompt,
      max_tokens: 4000,
      messages,
      tools: claudeTools.length > 0 ? claudeTools : undefined,
    });

    return this.parseResponse(response);
  }

  async *chatStream(params: ChatParams): AsyncGenerator<StreamEvent> {
    const claudeTools = mapToolsToAnthropic(params.tools);
    const messages: Anthropic.MessageParam[] = params.messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));

    yield* this.streamMessage(params.model, params.systemPrompt, messages, claudeTools);
  }

  async *continueWithToolResultsStream(params: ContinueParams): AsyncGenerator<StreamEvent> {
    const messages = this.buildContinueMessages(params);
    const claudeTools = mapToolsToAnthropic(params.tools);

    yield* this.streamMessage(params.model, params.systemPrompt, messages, claudeTools);
  }

  private async *streamMessage(
    model: string,
    systemPrompt: string,
    messages: Anthropic.MessageParam[],
    tools: any[]
  ): AsyncGenerator<StreamEvent> {
    const stream = this.client.messages.stream({
      model,
      system: systemPrompt,
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
        // Final message ΓÇö extract tool calls
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

    yield {
      type: 'done',
      response: {
        text: fullText || null,
        toolCalls,
        raw: toolCalls.length > 0 ? contentBlocks : undefined,
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
    };
  }
}
