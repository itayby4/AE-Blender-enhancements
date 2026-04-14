/**
 * PipeFX AI Brain — Memory engine barrel exports.
 *
 * Single import point for all memory services:
 *   import { getDatabase, createProject, addKnowledge, ... } from './services/memory/index.js';
 */

// Database
export { getDatabase, closeDatabase } from './database.js';

// Projects
export {
  listProjects,
  getProject,
  createProject,
  updateProject,
  deleteProject,
} from './projects.js';

// Knowledge (semantic memory)
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
} from './knowledge.js';

// Sessions (episodic memory)
export {
  startSession,
  getSession,
  endSession,
  updateSessionSummary,
  getRecentSessions,
  getLastSessionSummary,
  addInteraction,
} from './sessions.js';

// Tasks (procedural memory)
export { MemoryTaskManager, memoryTaskManager } from './tasks.js';

// User profile
export {
  setUserPreference,
  getUserPreference,
  getUserPreferences,
  deleteUserPreference,
} from './user-profile.js';

// Context assembly
export {
  assembleProjectContext,
  assembleLegacyContext,
} from './context.js';

// Migration
export { migrateJsonProjects } from './migrate.js';

// Types
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
} from './types.js';
