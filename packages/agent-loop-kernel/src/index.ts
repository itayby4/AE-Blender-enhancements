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
  compactHistoryAsync,
  estimateTokens,
  DEFAULT_COMPACTION_CONFIG,
} from './lib/compaction.js';
export type {
  CompactionConfig,
  CompactionResult,
  Summarizer,
} from './lib/compaction.js';
export {
  createLoopGuard,
  DEFAULT_LOOP_GUARD_CONFIG,
} from './lib/loop-guard.js';
export type {
  LoopGuard,
  LoopGuardConfig,
  LoopGuardOutcome,
} from './lib/loop-guard.js';
