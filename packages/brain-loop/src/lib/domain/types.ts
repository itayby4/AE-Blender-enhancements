import type { ConnectorRegistry } from '@pipefx/connectors';
import type { CloudProviderConfig } from '@pipefx/llm-providers';

export interface AgentConfig {
  model: string;
  apiKey: string;
  openaiApiKey?: string;
  anthropicApiKey?: string;
  systemPrompt: string;
  registry: ConnectorRegistry;
  /** If set, routes LLM calls through the cloud-api instead of direct provider calls. */
  cloudConfig?: CloudProviderConfig;
}
