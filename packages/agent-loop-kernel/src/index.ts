export { runAgentLoop } from './lib/loop.js';
export type {
  Agent,
  ChatOptions,
  LoopContext,
  AggregatedUsage,
  PostRoundReminderContext,
  PostRoundToolCall,
} from './lib/types.js';
export {
  shouldCompact,
  compactHistory,
  estimateTokens,
  DEFAULT_COMPACTION_CONFIG,
} from './lib/compaction.js';
export type {
  CompactionConfig,
  CompactionResult,
} from './lib/compaction.js';
