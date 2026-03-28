import type { ConnectorRegistry } from '@pipefx/mcp';

export interface AgentConfig {
  model: string;
  apiKey: string;
  openaiApiKey: string;
  systemPrompt: string;
  registry: ConnectorRegistry;
}

export interface ChatOptions {
  modelOverride?: string;
  systemPromptOverride?: string;
  allowedTools?: string[];
  history?: any[];
}

export interface Agent {
  chat(message: string, options?: ChatOptions): Promise<string>;
}
