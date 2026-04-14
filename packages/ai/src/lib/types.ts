import type { ConnectorRegistry } from '@pipefx/mcp';
// is it good to make the base model also modulare(itays Qustion)
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
  history?: any[];
  signal?: AbortSignal;
  onToolCallStart?: (toolName: string, args: any) => void;
  onToolCallComplete?: (toolName: string, result: any, error?: Error) => void;
  /** Called when the AI emits intermediate reasoning (Chain of Thought). */
  onThought?: (thought: string) => void;
}

export interface Agent {
  chat(message: string, options?: ChatOptions): Promise<string>;
}
