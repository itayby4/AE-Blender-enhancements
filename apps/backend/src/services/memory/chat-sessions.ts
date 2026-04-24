// ── Transitional barrel — source moved to @pipefx/brain-memory ──
export {
  createChatSession,
  appendChatMessage,
  getChatSession,
  getChatMessages,
  listChatSessions,
  deleteChatSession,
  updateChatSessionTitle,
  getLatestChatSession,
  chatSessionExists,
} from '@pipefx/brain-memory';
export type { ChatSessionDTO, ChatMessageDTO } from '@pipefx/brain-memory';
