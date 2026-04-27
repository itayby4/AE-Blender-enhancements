// ── @pipefx/chat/contracts — event-bus events ────────────────────────────
// These are observability / reactive-state events published on the shared
// @pipefx/event-bus. They are NOT the SSE wire format (see StreamEvent in
// types.ts) — the SSE stream is a point-to-point backend → desktop channel;
// these are broadcast to any listener (analytics, other features, devtools).

import type { Role, SessionId } from './types.js';

export interface ChatSessionCreatedEvent {
  sessionId: SessionId;
  projectId: string | null;
  model: string | null;
  createdAt: number;
}

export interface ChatSessionDeletedEvent {
  sessionId: SessionId;
  deletedAt: number;
}

export interface ChatMessageSentEvent {
  sessionId: SessionId;
  messageId: number;
  role: Role;
  /** Character count only — the content itself is not broadcast. */
  contentChars: number;
  timestamp: number;
}

export interface ChatMessageStreamedEvent {
  sessionId: SessionId;
  /** Message row id of the persisted assistant turn. */
  messageId: number;
  /** Final character count of the assistant response. */
  outputChars: number;
  timestamp: number;
}

export interface ChatEventMap {
  'chat.session.created': ChatSessionCreatedEvent;
  'chat.session.deleted': ChatSessionDeletedEvent;
  'chat.message.sent': ChatMessageSentEvent;
  'chat.message.streamed': ChatMessageStreamedEvent;
}

export type ChatEvent =
  | ChatSessionCreatedEvent
  | ChatSessionDeletedEvent
  | ChatMessageSentEvent
  | ChatMessageStreamedEvent;
