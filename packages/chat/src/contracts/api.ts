// ── @pipefx/chat/contracts — ports ───────────────────────────────────────
// Dependency-inversion seam for the chat package.
//
// chat-service.ts (populated in sub-phase 6.5) takes these ports as
// injected dependencies so @pipefx/chat only compiles against
// @pipefx/brain-contracts — never against brain-memory internals.
// @pipefx/brain-memory implements both ports; apps/backend wires the
// concrete adapter into mountChatRoutes().

import type { AgentSessionState, SelfCheckState } from '@pipefx/brain-contracts';
import type { ChatMessage, ChatSession, Role, SessionId } from './types.js';

// ── Session store ────────────────────────────────────────────────────────

export interface ChatSessionStore {
  /** Idempotent — no-op if `id` already exists is NOT guaranteed. Callers
   *  should check `exists()` first or handle the unique-constraint error. */
  create(
    id: SessionId,
    projectId?: string,
    model?: string
  ): ChatSession;

  exists(id: SessionId): boolean;

  get(id: SessionId): ChatSession | null;

  /** Newest-first. `limit` defaults to 50 at the adapter level. */
  list(projectId?: string, limit?: number): ChatSession[];

  /** Most recently updated session — used for "Continue last conversation?". */
  latest(projectId?: string): ChatSession | null;

  rename(id: SessionId, title: string): void;

  /** Returns true iff a row was removed. Cascades to chat_messages. */
  delete(id: SessionId): boolean;
}

// ── Transcript store ─────────────────────────────────────────────────────

export interface AppendMessageOptions {
  toolCalls?: unknown[];
  thought?: string;
}

export interface ListMessagesOptions {
  limit?: number;
  offset?: number;
}

export interface TranscriptStore {
  append(
    sessionId: SessionId,
    role: Role,
    content: string,
    options?: AppendMessageOptions
  ): ChatMessage;

  /** Ascending timestamp order. */
  list(
    sessionId: SessionId,
    options?: ListMessagesOptions
  ): ChatMessage[];
}

// ── Task progress tracker ────────────────────────────────────────────────
// Reports per-turn task progress to whichever surface renders the live
// "AI Assistant Working" timeline. Today: brain-memory's memoryTaskManager.

export type TaskStepStatus = 'in-progress' | 'done' | 'error';
export type TaskTerminalStatus = 'done' | 'error';

export interface TaskProgressTracker {
  start(taskId: string, label: string, projectId?: string): void;
  addStep(taskId: string, label: string, status?: TaskStepStatus): number;
  updateStep(taskId: string, stepIndex: number, status: TaskTerminalStatus): void;
  finish(taskId: string, status: TaskTerminalStatus): void;
  emitThought(taskId: string, thought: string): void;
}

// ── Logger ───────────────────────────────────────────────────────────────

export interface ChatLogger {
  info(msg: string, ctx?: Record<string, unknown>): void;
  warn(msg: string, ctx?: Record<string, unknown>): void;
  error(msg: string, ctx?: Record<string, unknown>): void;
}

// ── Post-round reminder factory ──────────────────────────────────────────
// brain-planning supplies the implementation. The factory returns a fresh
// per-turn closure so self-check counters reset across chat turns.

export interface PostRoundReminderContext {
  /** Round number (1-based). Other fields supplied by the kernel are
   *  forwarded opaquely. */
  roundNumber?: number;
  [key: string]: unknown;
}

export type PostRoundReminderFn = (
  ctx: PostRoundReminderContext,
  session: AgentSessionState | null
) => string | null | undefined;

export interface PostRoundReminderFactory {
  /** Build a fresh reminder tracker for one chat turn. */
  create(): PostRoundReminderFn;
}

// Re-export the brain-contracts types used in the signatures above so
// adapters don't need a transitive @pipefx/brain-contracts import just to
// satisfy the port interface.
export type { AgentSessionState, SelfCheckState };
