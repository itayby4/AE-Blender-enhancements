import type { ConnectorRegistry } from '@pipefx/mcp';

export interface AgentConfig {
  model: string;
  apiKey: string;
  systemPrompt: string;
  registry: ConnectorRegistry;
}

export interface Agent {
  chat(message: string): Promise<string>;
}
