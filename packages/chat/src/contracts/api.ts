// ── @pipefx/chat/contracts — ports ───────────────────────────────────────
// Dependency-inversion seam for the chat package.
//
// chat-service.ts (populated in sub-phase 6.5) takes these ports as
// injected dependencies so @pipefx/chat only compiles against
// @pipefx/brain-contracts — never against brain-memory internals.
// @pipefx/brain-memory implements both ports; apps/backend wires the
// concrete adapter into mountChatRoutes().

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
