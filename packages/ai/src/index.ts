export { createAgent } from './lib/agent.js';
export {
  shouldCompact,
  compactHistory,
  estimateTokens,
  DEFAULT_COMPACTION_CONFIG,
} from './lib/compaction.js';
export type { CompactionConfig, CompactionResult } from './lib/compaction.js';
export type { Agent, AgentConfig, ChatOptions } from './lib/types.js';

// Re-export provider abstraction from @pipefx/providers for backward compatibility
export type {
  Provider,
  ProviderMessage,
  ProviderResponse,
  StreamEvent,
  ChatParams,
  ContinueParams,
} from '@pipefx/providers';
export {
  GeminiProvider,
  OpenAIProvider,
  AnthropicProvider,
  mapToolsToGemini,
} from '@pipefx/providers';
