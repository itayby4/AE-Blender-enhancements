import type { Provider, UsageData } from '@pipefx/llm-providers';
import type { ConnectorsApi } from '@pipefx/connectors-contracts';
import type { Summarizer } from './compaction.js';

/**
 * Context required to run a single chat turn through the kernel.
 * Provider selection + system-prompt resolution happen *before* this —
 * the kernel never looks at API keys, model maps, or provider names.
 */
export interface LoopContext {
  provider: Provider;
  model: string;
  systemPrompt: string;
  registry: ConnectorsApi;
  /**
   * Optional LLM-backed summarizer used by context compaction. When omitted,
   * compaction falls back to the heuristic `summarizeMessages()` baseline.
   * See `Summarizer` in compaction.ts for the contract.
   */
  summarizer?: Summarizer | null;
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

/**
 * Aggregated usage across all LLM rounds in a single chat() invocation.
 * This is the "trace" concept — one user message may trigger many LLM calls
 * (initial response + tool-call rounds). This type captures the total.
 */
export interface AggregatedUsage {
  /** Individual usage records, one per LLM round. */
  rounds: UsageData[];
  /** Sum of all input tokens across rounds. */
  totalInputTokens: number;
  /** Sum of all output tokens across rounds. */
  totalOutputTokens: number;
  /** Sum of all thinking tokens across rounds. */
  totalThinkingTokens: number;
  /** Sum of all cached tokens across rounds. */
  totalCachedTokens: number;
  /** Number of tool-call rounds (0 = direct text response). */
  toolCallRounds: number;
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
  /**
   * Called per-round with that round's usage data (for real-time cost display).
   * Fires after each LLM call completes (streaming or non-streaming).
   */
  onRoundUsage?: (usage: UsageData, roundNumber: number) => void;
  /**
   * Called with aggregated usage data after chat() completes (success or error).
   * Aggregates all rounds into a single summary.
   */
  onUsage?: (usage: AggregatedUsage) => void;
}

export interface Agent {
  chat(message: string, options?: ChatOptions): Promise<string>;
}
