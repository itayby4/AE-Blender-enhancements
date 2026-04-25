// ── Chat-service dependency wiring ────────────────────────────────────
// Builds the concrete adapters that satisfy @pipefx/chat's ports:
//   - ChatSessionStore     ← brain-memory chat-sessions
//   - TranscriptStore      ← brain-memory chat-sessions
//   - TaskProgressTracker  ← brain-memory memoryTaskManager
//   - TasksApi             ← brain-tasks AgentSessionStore
//   - PostRoundReminderFactory ← brain-planning self-check helpers
//   - ChatLogger           ← brain-subagents log
//
// Living here (apps/backend) keeps brain-* sibling packages independent —
// none of them needs to depend on @pipefx/chat/contracts.

import type { AgentSessionStore } from '@pipefx/brain-tasks';
import type {
  ChatLogger,
  ChatSessionStore,
  PostRoundReminderFactory,
  TaskProgressTracker,
  TranscriptStore,
} from '@pipefx/chat/contracts';
import type { TasksApi } from '@pipefx/brain-contracts';
import {
  appendChatMessage,
  chatSessionExists,
  createChatSession,
  deleteChatSession,
  getChatMessages,
  getChatSession,
  getLatestChatSession,
  listChatSessions,
  memoryTaskManager,
  updateChatSessionTitle,
} from '@pipefx/brain-memory';
import {
  buildPostRoundReminder,
  freshSelfCheckState,
} from '@pipefx/brain-planning';
import { brainSubagentsLog } from '@pipefx/brain-subagents';

export function createChatSessionStore(): ChatSessionStore {
  return {
    create: (id, projectId, model) => createChatSession(id, projectId, model),
    exists: (id) => chatSessionExists(id),
    get: (id) => getChatSession(id),
    list: (projectId, limit) => listChatSessions(projectId, limit),
    latest: (projectId) => getLatestChatSession(projectId),
    rename: (id, title) => updateChatSessionTitle(id, title),
    delete: (id) => deleteChatSession(id),
  };
}

export function createTranscriptStore(): TranscriptStore {
  return {
    append: (sessionId, role, content, options) =>
      appendChatMessage(
        sessionId,
        role,
        content,
        options?.toolCalls,
        options?.thought
      ),
    list: (sessionId, options) =>
      getChatMessages(sessionId, options?.limit, options?.offset),
  };
}

export function createTaskProgressTracker(): TaskProgressTracker {
  return {
    start: (taskId, label, projectId) =>
      memoryTaskManager.createTask(taskId, label, [], projectId),
    addStep: (taskId, label, status = 'in-progress') =>
      memoryTaskManager.addTaskStep(taskId, label, status),
    updateStep: (taskId, stepIndex, status) =>
      memoryTaskManager.updateTaskStep(taskId, stepIndex, status),
    finish: (taskId, status) => memoryTaskManager.finishTask(taskId, status),
    emitThought: (taskId, thought) =>
      memoryTaskManager.emitThought(taskId, thought),
  };
}

export function createTasksApi(sessions: AgentSessionStore): TasksApi {
  return {
    getSession: (sessionId) => sessions.get(sessionId),
    hasSession: (sessionId) => sessions.has(sessionId),
    deleteSession: (sessionId) => sessions.delete(sessionId),
  };
}

export function createPostRoundReminderFactory(): PostRoundReminderFactory {
  return {
    create() {
      const selfCheck = freshSelfCheckState();
      return (ctx, session) =>
        buildPostRoundReminder(ctx as never, selfCheck, session);
    },
  };
}

export function createChatLogger(): ChatLogger {
  return {
    info: (msg, ctx) => brainSubagentsLog.info(msg, ctx),
    warn: (msg, ctx) => brainSubagentsLog.warn(msg, ctx),
    error: (msg, ctx) => brainSubagentsLog.error(msg, ctx),
  };
}
