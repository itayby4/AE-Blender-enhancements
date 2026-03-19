import type { ConnectorRegistry } from '@pipefx/mcp';

export interface AgentConfig {
  model: string;
  apiKey: string;
  systemPrompt: string;
  registry: ConnectorRegistry;
}

export interface ChatOptions {
  systemPromptOverride?: string;
  allowedTools?: string[];
}

export interface Agent {
  chat(message: string, options?: ChatOptions): Promise<string>;
}
