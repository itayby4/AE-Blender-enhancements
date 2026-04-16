import { GoogleGenAI } from '@google/genai';
import { mapToolsToGemini } from '../tool-mapper.js';
import type {
  Provider,
  ProviderMessage,
  ProviderResponse,
  StreamEvent,
  ChatParams,
  ContinueParams,
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
 * Gemini provider ΓÇö wraps the Google GenAI SDK.
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

    for await (const chunk of response) {
      // Text chunks
      if (chunk.text) {
        fullText += chunk.text;
        yield { type: 'text', text: chunk.text };
      }
      // Function calls (usually arrive at the end)
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
        // Store the raw function calls so continueWithToolResults can
        // rebuild the history with the functionCall turn.
        raw: allRawCalls.length > 0 ? { functionCalls: allRawCalls } : undefined,
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

    for await (const chunk of response) {
      if (chunk.text) {
        fullText += chunk.text;
        yield { type: 'text', text: chunk.text };
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
        raw: allRawCalls.length > 0 ? { functionCalls: allRawCalls } : undefined,
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

    return {
      text: response.text ?? null,
      toolCalls,
      // Store raw function calls for history reconstruction
      raw: rawCalls.length > 0 ? { functionCalls: rawCalls } : undefined,
    };
  }

  /**
   * Build history for a continuation call.
   * Gemini requires that a functionCall turn appears in the history
   * BEFORE a functionResponse can be sent. Without this, the API
   * returns "function response turn comes immediately after a function call turn".
   */
  private buildContinueHistory(params: ContinueParams): any[] {
    const baseHistory = this.toGeminiHistory(params.messages, true);

    // Append the model's functionCall turn so Gemini accepts the functionResponse
    if (params.previousResponse && (params.previousResponse as any).functionCalls) {
      const prevCalls = (params.previousResponse as any).functionCalls;
      const functionCallParts = prevCalls.map((call: any) => {
        // Deep clone the object to avoid circular references or 
        // passing SDK instances back into the history array
        const pojoCall = JSON.parse(JSON.stringify(call));
        return { functionCall: pojoCall };
      });
      baseHistory.push({
        role: 'model',
        parts: functionCallParts,
      });
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
