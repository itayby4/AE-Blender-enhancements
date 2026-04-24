export { createAgent } from './lib/agent.js';
export type { AgentConfig } from './lib/types.js';

// Re-export loop kernel surface for backward compatibility.
export {
  shouldCompact,
  compactHistory,
  estimateTokens,
  DEFAULT_COMPACTION_CONFIG,
} from '@pipefx/agent-loop-kernel';
export type {
  CompactionConfig,
  CompactionResult,
  Agent,
  ChatOptions,
  PostRoundReminderContext,
  PostRoundToolCall,
  AggregatedUsage,
} from '@pipefx/agent-loop-kernel';

// Re-export provider abstraction from @pipefx/providers for backward compatibility
export type {
  Provider,
  ProviderMessage,
  ProviderResponse,
  StreamEvent,
  ChatParams,
  ContinueParams,
  UsageData,
} from '@pipefx/providers';
export {
  GeminiProvider,
  OpenAIProvider,
  AnthropicProvider,
  mapToolsToGemini,
} from '@pipefx/providers';
