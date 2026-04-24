import { GoogleGenAI } from '@google/genai';
import { mapToolsToGemini } from './tool-mapper.js';
import type {
  Provider,
  ProviderMessage,
  ProviderResponse,
  StreamEvent,
  ChatParams,
  ContinueParams,
  UsageData,
} from './types.js';

/** Default timeout for a Gemini API call (90 seconds). */
const API_CALL_TIMEOUT = 90_000;

/**
 * Race a promise against a timeout.
 * Throws a descriptive error if the timeout fires first.
 */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Gemini ${label} timed out after ${ms / 1000}s`)),
      ms
    );
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); }
    );
  });
}

/**
 * Gemini provider — wraps the Google GenAI SDK.
 * Supports both regular and streaming responses.
 */
export class GeminiProvider implements Provider {
  readonly name = 'gemini';
  private client: GoogleGenAI;

  constructor(apiKey: string) {
    this.client = new GoogleGenAI({ apiKey });
  }

  async chat(params: ChatParams): Promise<ProviderResponse> {
    const geminiTools = mapToolsToGemini(params.tools);
    const history = this.toGeminiHistory(params.messages);

    const chat = this.client.chats.create({
      model: params.model,
      history,
      config: {
        systemInstruction: params.systemPrompt,
        tools: geminiTools.length > 0 ? geminiTools : undefined,
      },
    });

    const lastUserMsg = params.messages[params.messages.length - 1];
    const response = await withTimeout(
      chat.sendMessage({ message: lastUserMsg?.content ?? '' }),
      API_CALL_TIMEOUT,
      'sendMessage'
    );

    return this.parseResponse(response);
  }

  async continueWithToolResults(params: ContinueParams): Promise<ProviderResponse> {
    const geminiTools = mapToolsToGemini(params.tools);
    const history = this.buildContinueHistory(params);

    const chat = this.client.chats.create({
      model: params.model,
      history,
      config: {
        systemInstruction: params.systemPrompt,
        tools: geminiTools.length > 0 ? geminiTools : undefined,
      },
    });

    const functionResponses = params.toolResults.map((tr) => ({
      functionResponse: {
        name: tr.name,
        response: tr.isError ? { error: tr.content } : { result: tr.content },
      },
    }));

    const response = await withTimeout(
      chat.sendMessage({ message: functionResponses }),
      API_CALL_TIMEOUT,
      'continueWithToolResults'
    );
    return this.parseResponse(response);
  }

  async *chatStream(params: ChatParams): AsyncGenerator<StreamEvent> {
    const geminiTools = mapToolsToGemini(params.tools);
    const history = this.toGeminiHistory(params.messages);

    const chat = this.client.chats.create({
      model: params.model,
      history,
      config: {
        systemInstruction: params.systemPrompt,
        tools: geminiTools.length > 0 ? geminiTools : undefined,
      },
    });

    const lastUserMsg = params.messages[params.messages.length - 1];
    const response = await withTimeout(
      chat.sendMessageStream({ message: lastUserMsg?.content ?? '' }),
      API_CALL_TIMEOUT,
      'sendMessageStream'
    );

    let fullText = '';
    const allToolCalls: any[] = [];
    const allRawCalls: any[] = [];
    const allRawParts: any[] = [];
    // Gemini streaming puts usageMetadata on individual chunks (typically
    // the last one), NOT on the stream iterator object. Capture it here.
    let lastUsageChunk: any = null;

    for await (const chunk of response) {
      // Capture any chunk that carries usageMetadata (last chunk has it)
      if (chunk?.usageMetadata) {
        lastUsageChunk = chunk;
      }
      const chunkParts = chunk?.candidates?.[0]?.content?.parts ?? [];
      let chunkText = '';
      for (const part of chunkParts) {
        allRawParts.push(JSON.parse(JSON.stringify(part)));
        if (typeof part?.text === 'string') {
          chunkText += part.text;
        }
      }
      // Extracting text from parts directly (rather than reading chunk.text)
      // avoids the Gemini SDK warning "there are non-text parts functionCall
      // in the response, returning concatenation of all text parts" when a
      // chunk contains both text and a function call.
      if (chunkText) {
        fullText += chunkText;
        yield { type: 'text', text: chunkText };
      }
      if (chunk.functionCalls) {
        for (const call of chunk.functionCalls) {
          allRawCalls.push(call);
          const toolCall = {
            id: `gemini-${allToolCalls.length}`,
            name: call.name ?? 'unknown_tool',
            args: (call.args as Record<string, unknown>) ?? {},
          };
          allToolCalls.push(toolCall);
          yield { type: 'tool_call', toolCall };
        }
      }
    }

    yield {
      type: 'done',
      response: {
        text: fullText || null,
        toolCalls: allToolCalls,
        raw:
          allRawParts.length > 0
            ? { parts: allRawParts, functionCalls: allRawCalls }
            : undefined,
        usage: this.extractUsage(lastUsageChunk ?? response, params.model),
      },
    };
  }

  async *continueWithToolResultsStream(params: ContinueParams): AsyncGenerator<StreamEvent> {
    const geminiTools = mapToolsToGemini(params.tools);
    const history = this.buildContinueHistory(params);

    const chat = this.client.chats.create({
      model: params.model,
      history,
      config: {
        systemInstruction: params.systemPrompt,
        tools: geminiTools.length > 0 ? geminiTools : undefined,
      },
    });

    const functionResponses = params.toolResults.map((tr) => ({
      functionResponse: {
        name: tr.name,
        response: tr.isError ? { error: tr.content } : { result: tr.content },
      },
    }));

    const response = await withTimeout(
      chat.sendMessageStream({ message: functionResponses }),
      API_CALL_TIMEOUT,
      'continueWithToolResultsStream'
    );

    let fullText = '';
    const allToolCalls: any[] = [];
    const allRawCalls: any[] = [];
    const allRawParts: any[] = [];
    let lastUsageChunk: any = null;

    for await (const chunk of response) {
      if (chunk?.usageMetadata) {
        lastUsageChunk = chunk;
      }
      const chunkParts = chunk?.candidates?.[0]?.content?.parts ?? [];
      let chunkText = '';
      for (const part of chunkParts) {
        allRawParts.push(JSON.parse(JSON.stringify(part)));
        if (typeof part?.text === 'string') {
          chunkText += part.text;
        }
      }
      // Extracting text from parts directly (rather than reading chunk.text)
      // avoids the Gemini SDK warning "there are non-text parts functionCall
      // in the response, returning concatenation of all text parts" when a
      // chunk contains both text and a function call.
      if (chunkText) {
        fullText += chunkText;
        yield { type: 'text', text: chunkText };
      }
      if (chunk.functionCalls) {
        for (const call of chunk.functionCalls) {
          allRawCalls.push(call);
          const toolCall = {
            id: `gemini-${allToolCalls.length}`,
            name: call.name ?? 'unknown_tool',
            args: (call.args as Record<string, unknown>) ?? {},
          };
          allToolCalls.push(toolCall);
          yield { type: 'tool_call', toolCall };
        }
      }
    }

    yield {
      type: 'done',
      response: {
        text: fullText || null,
        toolCalls: allToolCalls,
        raw:
          allRawParts.length > 0
            ? { parts: allRawParts, functionCalls: allRawCalls }
            : undefined,
        usage: this.extractUsage(lastUsageChunk ?? response, params.model),
      },
    };
  }

  private parseResponse(response: any): ProviderResponse {
    const rawCalls = response.functionCalls ?? [];
    const toolCalls = rawCalls.map(
      (call: any, index: number) => ({
        id: `gemini-${index}`,
        name: call.name ?? 'unknown_tool',
        args: (call.args as Record<string, unknown>) ?? {},
      })
    );

    // Gemini 3 requires thoughtSignature on each part to be preserved
    // verbatim in the next turn's history. Capture the whole parts array
    // (not just functionCalls) so we can replay it faithfully.
    const rawParts = response?.candidates?.[0]?.content?.parts ?? [];
    const pojoParts = rawParts.map((p: any) => JSON.parse(JSON.stringify(p)));

    // Assemble text from part.text directly instead of reading response.text,
    // which logs "there are non-text parts functionCall in the response…"
    // every time a response mixes text and tool calls.
    const text = rawParts
      .filter((p: any) => typeof p?.text === 'string')
      .map((p: any) => p.text)
      .join('');

    return {
      text: text || null,
      toolCalls,
      raw:
        pojoParts.length > 0
          ? { parts: pojoParts, functionCalls: rawCalls }
          : undefined,
      usage: this.extractUsage(response, 'unknown'),
    };
  }

  /**
   * Extract token usage from a Gemini response's usageMetadata.
   * The model param is a fallback — streaming responses carry it on the object.
   */
  private extractUsage(response: any, fallbackModel: string): UsageData | null {
    const meta = response?.usageMetadata;
    if (!meta) return null;
    const input = meta.promptTokenCount ?? 0;
    const output = meta.candidatesTokenCount ?? 0;
    const thinking = meta.thoughtsTokenCount ?? 0;
    const cached = meta.cachedContentTokenCount ?? 0;
    return {
      inputTokens: input,
      outputTokens: output,
      thinkingTokens: thinking,
      cachedTokens: cached,
      totalTokens: input + output + thinking,
      model: fallbackModel,
      provider: 'gemini',
    };
  }

  /**
   * Build history for a continuation call.
   * Gemini requires that a functionCall turn appears in the history
   * BEFORE a functionResponse can be sent. Without this, the API
   * returns "function response turn comes immediately after a function call turn".
   *
   * Gemini 3 additionally requires the original `thoughtSignature` on each
   * part to be preserved verbatim, so we replay `candidates[0].content.parts`
   * rather than reconstructing from `functionCalls` alone.
   */
  private buildContinueHistory(params: ContinueParams): any[] {
    const baseHistory = this.toGeminiHistory(params.messages, true);

    const prev = params.previousResponse as any;
    const rawParts: any[] | undefined = prev?.parts ?? prev?.raw?.parts;

    if (rawParts && rawParts.length > 0) {
      baseHistory.push({ role: 'model', parts: rawParts });
    } else if (prev?.functionCalls?.length) {
      // Fallback for older response shapes (no thoughtSignature available).
      const functionCallParts = prev.functionCalls.map((call: any) => ({
        functionCall: JSON.parse(JSON.stringify(call)),
      }));
      baseHistory.push({ role: 'model', parts: functionCallParts });
    }

    return baseHistory;
  }

  private toGeminiHistory(
    messages: ProviderMessage[],
    keepLast = false
  ): Array<{ role: string; parts: Array<{ text: string }> }> {
    let filtered = messages.filter((m) => m.role !== 'system');
    if (!keepLast) {
      filtered = filtered.slice(0, -1);
    }
    return filtered.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));
  }
}
