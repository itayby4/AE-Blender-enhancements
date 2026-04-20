import type { ConnectorRegistry } from '@pipefx/mcp';

export interface AgentConfig {
  model: string;
  apiKey: string;
  openaiApiKey?: string;
  anthropicApiKey?: string;
  systemPrompt: string;
  registry: ConnectorRegistry;
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
}

export interface Agent {
  chat(message: string, options?: ChatOptions): Promise<string>;
}
