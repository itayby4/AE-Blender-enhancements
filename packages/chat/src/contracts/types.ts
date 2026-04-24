// ── @pipefx/chat/contracts — core types ──────────────────────────────────
// Semver-locked public surface. Adding a field to StreamEvent or an optional
// field to a persisted record is additive; removing or tightening is a bump.

import type { TodoItem, TodoStatus } from '@pipefx/brain-contracts';

export type { TodoItem, TodoStatus };

// ── Identity ──────────────────────────────────────────────────────────────

export type SessionId = string;

/** Persisted role. Matches the `chat_messages.role` column. */
export type Role = 'user' | 'assistant';

// ── Persisted records ────────────────────────────────────────────────────
// These mirror the DTOs the TranscriptStore / ChatSessionStore ports return.
// Adapter implementations (today: @pipefx/brain-memory) map their own row
// shapes onto these before returning.

export interface ChatSession {
  id: SessionId;
  projectId: string | null;
  title: string | null;
  model: string | null;
  messageCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface ChatMessage {
  id: number;
  sessionId: SessionId;
  role: Role;
  content: string;
  toolCalls: unknown[] | null;
  thought: string | null;
  timestamp: number;
}

// ── Live turn state (used by the streaming reducer + UI) ─────────────────

export interface TranscriptMessage {
  /** Client-side synthetic id — a string so callers can pass a UUID or a
   *  timestamp-derived key without coercion. */
  id: string;
  role: Role;
  text: string;
  /** Task that produced this assistant turn. Absent on user messages. */
  taskId?: string;
  /** True while the assistant message is still receiving chunks. */
  isStreaming?: boolean;
}

export interface PendingPlan {
  sessionId: SessionId;
  taskId: string;
  plan: string;
}

export type SubAgentStatus = 'running' | 'done' | 'error';

export interface SubAgentInfo {
  taskId: string;
  description: string;
  status: SubAgentStatus;
  /** Last streamed chunk (trimmed to a preview). */
  lastChunk?: string;
  /** Last tool the worker called. */
  lastTool?: string;
  /** Populated when status === 'error'. */
  error?: string;
  /** Running count of `subagent_chunk` events received. */
  chunkCount: number;
}

// ── SSE stream contract ──────────────────────────────────────────────────
// One-of-many event sent on the `/chat/stream` response. The backend writes
// these with `sseWrite`; the desktop `useChat` hook pipes them into the
// streaming reducer.

export interface StreamRoundUsage {
  inputTokens: number;
  outputTokens: number;
  thinkingTokens?: number;
  cachedTokens?: number;
  model: string;
  provider: string;
}

export interface StreamRoundCost {
  costUsd: number;
  credits: number;
}

export type StreamEvent =
  | { type: 'session'; sessionId: SessionId }
  | { type: 'chunk'; text: string }
  | { type: 'tool_start'; name: string; args?: unknown }
  | { type: 'tool_done'; name: string; error?: string }
  | { type: 'thought'; text: string }
  | {
      type: 'done';
      /** Final assistant text. Some backends only send chunks and leave this
       *  empty; the reducer keeps the streamed text in that case. */
      text?: string;
      sessionId?: SessionId;
      /** Optional pipeline actions for the node editor. */
      actions?: unknown[];
    }
  | { type: 'error'; error: string }
  | {
      type: 'compaction';
      removedCount: number;
      summary?: string;
    }
  // Agent-system events (from brain-subagents tool handlers)
  | { type: 'todo_updated'; todos: TodoItem[] }
  | {
      type: 'plan_proposed';
      sessionId?: SessionId;
      taskId: string;
      plan: string;
    }
  | { type: 'plan_resolved'; taskId: string; approved: boolean }
  | { type: 'subagent_start'; taskId: string; description: string }
  | { type: 'subagent_chunk'; taskId: string; text: string }
  | { type: 'subagent_tool_start'; taskId: string; name: string }
  | {
      type: 'subagent_tool_done';
      taskId: string;
      name?: string;
      error?: string;
    }
  | { type: 'subagent_done'; taskId: string }
  | { type: 'subagent_error'; taskId: string; message: string }
  // Usage accounting (informational — reducer does not aggregate)
  | {
      type: 'usage_round';
      roundNumber: number;
      usage: StreamRoundUsage;
      cost: StreamRoundCost;
    }
  | {
      type: 'usage_total';
      totalInputTokens: number;
      totalOutputTokens: number;
      totalThinkingTokens: number;
      totalCachedTokens: number;
      toolCallRounds: number;
      rounds: number;
    };

export type StreamEventType = StreamEvent['type'];
