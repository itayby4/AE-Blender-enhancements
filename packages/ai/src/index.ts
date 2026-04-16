export { createAgent } from './lib/agent.js';
export { mapToolsToGemini } from './lib/tool-mapper.js';
export {
  shouldCompact,
  compactHistory,
  estimateTokens,
  DEFAULT_COMPACTION_CONFIG,
} from './lib/compaction.js';
export type { CompactionConfig, CompactionResult } from './lib/compaction.js';
export type { Agent, AgentConfig, ChatOptions } from './lib/types.js';
export type {
  Provider,
  ProviderMessage,
  ProviderResponse,
  StreamEvent,
  ChatParams,
  ContinueParams,
} from './lib/providers/types.js';
export { GeminiProvider } from './lib/providers/gemini.js';
export { OpenAIProvider } from './lib/providers/openai.js';
export { AnthropicProvider } from './lib/providers/anthropic.js';
