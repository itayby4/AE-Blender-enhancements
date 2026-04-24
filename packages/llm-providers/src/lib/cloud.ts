/**
 * PipeFX — Cloud LLM Provider.
 *
 * A `Provider` implementation that proxies all LLM calls through the
 * PipeFX Cloud-API instead of calling the provider directly.
 * Used in "Cloud Mode" — users without their own API keys pay with credits.
 *
 * The desktop agent loop still runs locally (MCP connectors are local),
 * but all LLM inference is routed through the cloud billing gateway.
 *
 * Protocol:
 *   Desktop → POST cloud-api/ai/chat → SSE stream
 *   Cloud-API: reserve credits → proxy to provider → settle/refund
 */

import type {
  Provider,
  ProviderMessage,
  ProviderResponse,
  ProviderToolCall,
  StreamEvent,
  ChatParams,
  ContinueParams,
  UsageData,
} from './types.js';

export interface CloudProviderConfig {
  /** Cloud-API base URL (e.g., https://cloud.pipefx.app or http://localhost:3002). */
  cloudApiUrl: string;
  /** Device token for authentication. */
  deviceToken: string;
}

/**
 * Cloud provider — proxies LLM calls through the PipeFX Cloud-API.
 * Implements the same Provider interface as Gemini/OpenAI/Anthropic,
 * so the agent loop doesn't know (or care) that it's going through a proxy.
 */
export class CloudProvider implements Provider {
  readonly name = 'cloud';
  private cloudApiUrl: string;
  private deviceToken: string;

  constructor(config: CloudProviderConfig) {
    this.cloudApiUrl = config.cloudApiUrl.replace(/\/$/, '');
    this.deviceToken = config.deviceToken;
  }

  /** Derive the provider ID from the model name. */
  private detectProvider(model: string): string {
    if (model.startsWith('gpt') || model.startsWith('o1') || model.startsWith('o3') || model.startsWith('o4')) return 'openai';
    if (model.startsWith('claude')) return 'anthropic';
    return 'gemini';
  }

  async chat(params: ChatParams): Promise<ProviderResponse> {
    const response = await fetch(`${this.cloudApiUrl}/ai/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.deviceToken}`,
      },
      body: JSON.stringify({
        provider: this.detectProvider(params.model),
        model: params.model,
        systemPrompt: params.systemPrompt,
        messages: params.messages,
        tools: params.tools,
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: `HTTP ${response.status}` })) as { error?: string };
      if (response.status === 402) {
        throw new Error(`Insufficient credits: ${err.error ?? 'Please top up your balance.'}`);
      }
      if (response.status === 429) {
        throw new Error('Rate limited. Please try again in a moment.');
      }
      throw new Error(`Cloud-API error: ${err.error ?? response.statusText}`);
    }

    // Parse SSE stream and collect the full response
    return this.parseSSEResponse(response);
  }

  async *chatStream(params: ChatParams): AsyncGenerator<StreamEvent> {
    const response = await fetch(`${this.cloudApiUrl}/ai/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.deviceToken}`,
      },
      body: JSON.stringify({
        provider: this.detectProvider(params.model),
        model: params.model,
        systemPrompt: params.systemPrompt,
        messages: params.messages,
        tools: params.tools,
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: `HTTP ${response.status}` })) as { error?: string };
      if (response.status === 402) {
        throw new Error(`Insufficient credits: ${err.error ?? 'Please top up your balance.'}`);
      }
      if (response.status === 429) {
        throw new Error('Rate limited. Please try again in a moment.');
      }
      throw new Error(`Cloud-API error: ${err.error ?? response.statusText}`);
    }

    yield* this.streamSSE(response);
  }

  async continueWithToolResults(params: ContinueParams): Promise<ProviderResponse> {
    // For tool-result continuation, we send the full history including
    // the tool results. The cloud-api treats this as a new request
    // (each round is billed separately per the thin-proxy model).
    const messages: ProviderMessage[] = [
      ...params.messages,
      // Add tool results as a user message (the cloud-api's provider will handle routing)
      {
        role: 'user',
        content: params.toolResults
          .map((tr) => `[Tool Result: ${tr.name}]\n${tr.content}`)
          .join('\n\n'),
      },
    ];

    const response = await fetch(`${this.cloudApiUrl}/ai/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.deviceToken}`,
      },
      body: JSON.stringify({
        provider: this.detectProvider(params.model),
        model: params.model,
        systemPrompt: params.systemPrompt,
        messages,
        tools: params.tools,
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: `HTTP ${response.status}` })) as { error?: string };
      throw new Error(`Cloud-API error: ${err.error ?? response.statusText}`);
    }

    return this.parseSSEResponse(response);
  }

  async *continueWithToolResultsStream(params: ContinueParams): AsyncGenerator<StreamEvent> {
    const messages: ProviderMessage[] = [
      ...params.messages,
      {
        role: 'user',
        content: params.toolResults
          .map((tr) => `[Tool Result: ${tr.name}]\n${tr.content}`)
          .join('\n\n'),
      },
    ];

    const response = await fetch(`${this.cloudApiUrl}/ai/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.deviceToken}`,
      },
      body: JSON.stringify({
        provider: this.detectProvider(params.model),
        model: params.model,
        systemPrompt: params.systemPrompt,
        messages,
        tools: params.tools,
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: `HTTP ${response.status}` })) as { error?: string };
      throw new Error(`Cloud-API error: ${err.error ?? response.statusText}`);
    }

    yield* this.streamSSE(response);
  }

  // ── SSE Parsing Helpers ──

  /**
   * Parse a full SSE response stream into a ProviderResponse.
   */
  private async parseSSEResponse(response: Response): Promise<ProviderResponse> {
    let fullText = '';
    const toolCalls: ProviderToolCall[] = [];
    let usage: UsageData | null = null;

    for await (const event of this.streamSSE(response)) {
      if (event.type === 'text') {
        fullText += event.text;
      } else if (event.type === 'tool_call') {
        toolCalls.push(event.toolCall);
      } else if (event.type === 'done' && event.response?.usage) {
        usage = event.response.usage ?? null;
      }
    }

    return {
      text: fullText || null,
      toolCalls,
      usage,
    };
  }

  /**
   * Parse an SSE stream from the cloud-api and yield StreamEvents.
   */
  private async *streamSSE(response: Response): AsyncGenerator<StreamEvent> {
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body from cloud-api');
    }

    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const json = line.slice(6).trim();
          if (!json || json === '[DONE]') continue;

          try {
            const event = JSON.parse(json);
            if (event.type === 'stream_end') continue;
            if (event.type === 'billing') continue; // billing info — not forwarded to agent
            if (event.type === 'error') {
              throw new Error(`Cloud-API stream error: ${event.error}`);
            }
            yield event as StreamEvent;
          } catch (e) {
            if (e instanceof SyntaxError) continue; // skip malformed JSON
            throw e;
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}
