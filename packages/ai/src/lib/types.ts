import type { ConnectorRegistry } from '@pipefx/mcp';
'is it good to make the base model also modulare(itays Qustion)'
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
}

export interface Agent {
  chat(message: string, options?: ChatOptions): Promise<string>;
}
