import type { Tool } from '@pipefx/mcp';

/**
 * Unified message format used across all LLM providers.
 * Inspired by Claw-Code's provider abstraction (crates/api/src/types.rs).
 */
export interface ProviderMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * A tool call returned by the LLM.
 */
export interface ProviderToolCall {
  /** Provider-specific call ID (used for sending results back). */
  id: string;
  name: string;
  args: Record<string, unknown>;
}

/**
 * The result of a single provider chat turn.
 * Either the model returns text, requests tool calls, or both.
 */
export interface ProviderResponse {
  /** Final text content (may be empty if tool calls are pending). */
  text: string | null;
  /** Tool calls the model wants to execute. Empty array = no tools requested. */
  toolCalls: ProviderToolCall[];
  /** Raw provider-specific response for passthrough (e.g. Anthropic content blocks). */
  raw?: unknown;
}

/**
 * The result of a tool execution, sent back to the provider.
 */
export interface ProviderToolResult {
  callId: string;
  name: string;
  content: string;
  isError?: boolean;
}

/**
 * Events emitted during a streaming chat response.
 * Inspired by Claw-Code's SSE event model (crates/api/src/sse.rs).
 */
export type StreamEvent =
  | { type: 'text'; text: string }
  | { type: 'tool_call'; toolCall: ProviderToolCall }
  | { type: 'done'; response: ProviderResponse };

/**
 * Shared params for chat requests.
 */
export interface ChatParams {
  model: string;
  systemPrompt: string;
  messages: ProviderMessage[];
  tools: Tool[];
}

/**
 * Shared params for continuing with tool results.
 */
export interface ContinueParams extends ChatParams {
  toolResults: ProviderToolResult[];
  previousResponse?: unknown;
}

/**
 * Provider interface — each LLM provider (Gemini, OpenAI, Anthropic)
 * implements this interface. The agent loop is provider-agnostic.
 *
 * Inspired by Claw-Code's separation of provider clients (crates/api/)
 * from the conversation runtime (crates/runtime/conversation.rs).
 */
export interface Provider {
  readonly name: string;

  /**
   * Send a chat request and get a full response (non-streaming).
   */
  chat(params: ChatParams): Promise<ProviderResponse>;

  /**
   * Send tool results back to the provider and get the next response.
   */
  continueWithToolResults(params: ContinueParams): Promise<ProviderResponse>;

  /**
   * Stream a chat response. Yields text chunks as they arrive,
   * then yields tool_call events, and finally a done event with the full response.
   */
  chatStream(params: ChatParams): AsyncGenerator<StreamEvent>;

  /**
   * Stream a continuation after tool results.
   */
  continueWithToolResultsStream(params: ContinueParams): AsyncGenerator<StreamEvent>;
}
