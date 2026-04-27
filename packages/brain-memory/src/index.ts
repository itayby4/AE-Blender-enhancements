// ── Config ────────────────────────────────────────────────────────────────
export { configureMemoryStore, getDatabase, closeDatabase } from './lib/data/database.js';
export type { MemoryStoreConfig } from './lib/data/database.js';

// ── Domain ────────────────────────────────────────────────────────────────
export { createAgentMemoryStore, taskMemoryNamespace } from './lib/domain/agent-memory.js';
export type { AgentMemoryStore } from './lib/domain/agent-memory.js';

// ── Data: projects ────────────────────────────────────────────────────────
export {
  ensureProject,
  listProjects,
  getProject,
  createProject,
  updateProject,
  deleteProject,
} from './lib/data/projects.js';

// ── Data: knowledge (semantic memory) ─────────────────────────────────────
export {
  addKnowledge,
  getKnowledgeById,
  listKnowledge,
  searchKnowledge,
  updateKnowledge,
  forgetKnowledge,
  addProjectMemory,
  getProjectMemories,
  deleteProjectMemoryByIndex,
} from './lib/data/knowledge.js';

// ── Data: sessions (episodic memory) ──────────────────────────────────────
export {
  startSession,
  getSession,
  endSession,
  updateSessionSummary,
  getRecentSessions,
  getLastSessionSummary,
  addInteraction,
} from './lib/data/sessions.js';

// ── Data: tasks (procedural memory) ───────────────────────────────────────
export { MemoryTaskManager, memoryTaskManager } from './lib/data/tasks.js';

// ── Data: user profile ────────────────────────────────────────────────────
export {
  setUserPreference,
  getUserPreference,
  getUserPreferences,
  deleteUserPreference,
} from './lib/data/user-profile.js';

// ── Data: context assembly ────────────────────────────────────────────────
export {
  assembleProjectContext,
  assembleLegacyContext,
} from './lib/data/context.js';

// ── Data: chat sessions ───────────────────────────────────────────────────
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
} from './lib/data/chat-sessions.js';
export type { ChatSessionDTO, ChatMessageDTO } from './lib/data/chat-sessions.js';

// ── Data: migration ───────────────────────────────────────────────────────
export { migrateJsonProjects } from './lib/data/migrate.js';

// ── Data: types ───────────────────────────────────────────────────────────
export type {
  ProjectDTO,
  KnowledgeDTO,
  KnowledgeInsert,
  KnowledgeCategory,
  KnowledgeSource,
  SessionDTO,
  TaskDTO,
  TaskStep,
  TaskStatus,
  TaskEvent,
  TaskRow,
  AssembledContext,
} from './lib/data/types.js';

// ── Backend routes ────────────────────────────────────────────────────────
export { mountMemoryRoutes } from './lib/backend/routes/index.js';
export type { MemoryRouter } from './lib/backend/routes/index.js';

// ── Log ───────────────────────────────────────────────────────────────────
export { brainMemoryLog } from './lib/log.js';
