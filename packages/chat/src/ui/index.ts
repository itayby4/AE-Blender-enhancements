// ── @pipefx/chat/ui — public surface ─────────────────────────────────────
// React hooks + components for embedding the chat experience. Re-exports
// a small set of contract types so `@pipefx/chat/ui` consumers don't also
// need to import from `@pipefx/chat/contracts` for the everyday types.

export { useChat } from './hooks/use-chat.js';
export type { UseChatDeps, UseChatResult } from './hooks/use-chat.js';

export { useChatHistory } from './hooks/use-chat-history.js';
export type {
  UseChatHistoryDeps,
  UseChatHistoryResult,
} from './hooks/use-chat-history.js';

export type {
  ChatSession,
  ChatMessage,
  TranscriptMessage,
  TodoItem,
  TodoStatus,
  SubAgentInfo,
  SubAgentStatus,
  PendingPlan,
  StreamEvent,
} from '../contracts/types.js';
