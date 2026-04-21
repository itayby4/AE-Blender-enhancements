import type { ConnectorRegistry } from '@pipefx/mcp';

export interface AgentConfig {
  model: string;
  apiKey: string;
  openaiApiKey?: string;
  anthropicApiKey?: string;
  systemPrompt: string;
  registry: ConnectorRegistry;
}

export interface PostRoundToolCall {
  name: string;
  args: Record<string, unknown>;
  isError: boolean;
}

export interface PostRoundReminderContext {
  /** Names of tools called in this round (may include duplicates if batched). */
  toolNames: string[];
  /**
   * Full per-call detail for this round — name, args, and whether the result
   * was flagged as an error. Used by the self-check to detect
   * same-tool/same-args loops.
   */
  toolCalls: PostRoundToolCall[];
  /** 1-indexed round counter within this chat() invocation. */
  roundNumber: number;
}

export interface ChatOptions {
  providerOverride?: string;
  modelOverride?: string;
  systemPromptOverride?: string;
  allowedTools?: string[];
  /** Tools to hide from the model for this call (applied after allowedTools). */
  excludedTools?: string[];
  history?: any[];
  signal?: AbortSignal;
  onToolCallStart?: (toolName: string, args: any) => void;
  onToolCallComplete?: (toolName: string, result: any, error?: Error) => void;
  /** Called when the AI emits intermediate reasoning (Chain of Thought). */
  onThought?: (thought: string) => void;
  /** Called when a streaming text chunk is received from the provider. */
  onStreamChunk?: (chunk: string) => void;
  /** Called when context compaction occurs (old messages summarized). */
  onCompaction?: (removedCount: number, summary: string) => void;
  /**
   * Called after each tool-call round. Return a non-empty string to append as
   * <system-reminder> to the last tool result so the model sees it next turn.
   * Return null/undefined to skip.
   */
  getPostRoundReminder?: (ctx: PostRoundReminderContext) => string | null | undefined;
}

export interface Agent {
  chat(message: string, options?: ChatOptions): Promise<string>;
}
