/**
 * PipeFX AI Brain ΓÇö Chat session persistence.
 *
 * Inspired by claw-code's session.rs: incremental append of messages,
 * session metadata tracking, and list/resume/delete operations.
 *
 * Uses the SQLite chat_sessions + chat_messages tables.
 */

import { getDatabase } from './database.js';

// ΓöÇΓöÇ Types ΓöÇΓöÇ

export interface ChatSessionDTO {
  id: string;
  projectId: string | null;
  title: string | null;
  model: string | null;
  messageCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface ChatMessageDTO {
  id: number;
  sessionId: string;
  role: 'user' | 'assistant';
  content: string;
  toolCalls: unknown[] | null;
  thought: string | null;
  timestamp: number;
}

interface ChatSessionRow {
  id: string;
  project_id: string | null;
  title: string | null;
  model: string | null;
  message_count: number;
  created_at: number;
  updated_at: number;
}

interface ChatMessageRow {
  id: number;
  session_id: string;
  role: string;
  content: string;
  tool_calls: string | null;
  thought: string | null;
  timestamp: number;
}

// ΓöÇΓöÇ Mappers ΓöÇΓöÇ

function rowToSession(row: ChatSessionRow): ChatSessionDTO {
  return {
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    model: row.model,
    messageCount: row.message_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToMessage(row: ChatMessageRow): ChatMessageDTO {
  return {
    id: row.id,
    sessionId: row.session_id,
    role: row.role as 'user' | 'assistant',
    content: row.content,
    toolCalls: row.tool_calls ? JSON.parse(row.tool_calls) : null,
    thought: row.thought,
    timestamp: row.timestamp,
  };
}

// ΓöÇΓöÇ Operations ΓöÇΓöÇ

/**
 * Create a new chat session.
 * Returns the created session DTO.
 */
export function createChatSession(
  id: string,
  projectId?: string,
  model?: string
): ChatSessionDTO {
  const db = getDatabase();
  const now = Date.now();

  db.prepare(
    `INSERT INTO chat_sessions (id, project_id, model, message_count, created_at, updated_at)
     VALUES (?, ?, ?, 0, ?, ?)`
  ).run(id, projectId ?? null, model ?? null, now, now);

  return {
    id,
    projectId: projectId ?? null,
    title: null,
    model: model ?? null,
    messageCount: 0,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Append a message to a chat session.
 * Incremental ΓÇö just inserts one row (like claw-code's append_persisted_message).
 */
export function appendChatMessage(
  sessionId: string,
  role: 'user' | 'assistant',
  content: string,
  toolCalls?: unknown[],
  thought?: string
): ChatMessageDTO {
  const db = getDatabase();
  const now = Date.now();

  const result = db.prepare(
    `INSERT INTO chat_messages (session_id, role, content, tool_calls, thought, timestamp)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    sessionId,
    role,
    content,
    toolCalls ? JSON.stringify(toolCalls) : null,
    thought ?? null,
    now
  );

  // Update session metadata
  db.prepare(
    `UPDATE chat_sessions
     SET message_count = message_count + 1,
         updated_at = ?
     WHERE id = ?`
  ).run(now, sessionId);

  // Auto-generate title from first user message
  const session = getChatSession(sessionId);
  if (session && !session.title && role === 'user') {
    const title = content.slice(0, 80).replace(/\n/g, ' ').trim();
    updateChatSessionTitle(sessionId, title);
  }

  return {
    id: Number(result.lastInsertRowid),
    sessionId,
    role,
    content,
    toolCalls: toolCalls ?? null,
    thought: thought ?? null,
    timestamp: now,
  };
}

/**
 * Get a chat session by ID.
 */
export function getChatSession(id: string): ChatSessionDTO | null {
  const db = getDatabase();
  const row = db
    .prepare(`SELECT * FROM chat_sessions WHERE id = ?`)
    .get(id) as ChatSessionRow | undefined;
  return row ? rowToSession(row) : null;
}

/**
 * Get messages for a session with optional pagination.
 */
export function getChatMessages(
  sessionId: string,
  limit?: number,
  offset?: number
): ChatMessageDTO[] {
  const db = getDatabase();
  let sql = `SELECT * FROM chat_messages WHERE session_id = ? ORDER BY timestamp ASC`;
  const params: unknown[] = [sessionId];

  if (limit !== undefined) {
    sql += ` LIMIT ?`;
    params.push(limit);
    if (offset !== undefined) {
      sql += ` OFFSET ?`;
      params.push(offset);
    }
  }

  const rows = db.prepare(sql).all(...params) as ChatMessageRow[];
  return rows.map(rowToMessage);
}

/**
 * List chat sessions, optionally filtered by project.
 * Returns newest first.
 */
export function listChatSessions(
  projectId?: string,
  limit = 50
): ChatSessionDTO[] {
  const db = getDatabase();

  let sql: string;
  let params: unknown[];

  if (projectId) {
    sql = `SELECT * FROM chat_sessions WHERE project_id = ?
           ORDER BY updated_at DESC LIMIT ?`;
    params = [projectId, limit];
  } else {
    sql = `SELECT * FROM chat_sessions
           ORDER BY updated_at DESC LIMIT ?`;
    params = [limit];
  }

  const rows = db.prepare(sql).all(...params) as ChatSessionRow[];
  return rows.map(rowToSession);
}

/**
 * Delete a chat session and all its messages (CASCADE).
 */
export function deleteChatSession(id: string): boolean {
  const db = getDatabase();
  const result = db
    .prepare(`DELETE FROM chat_sessions WHERE id = ?`)
    .run(id);
  return result.changes > 0;
}

/**
 * Update the title of a chat session.
 */
export function updateChatSessionTitle(id: string, title: string): void {
  const db = getDatabase();
  db.prepare(
    `UPDATE chat_sessions SET title = ?, updated_at = ? WHERE id = ?`
  ).run(title, Date.now(), id);
}

/**
 * Get the most recent session for a project (for "Continue last conversation?").
 */
export function getLatestChatSession(
  projectId?: string
): ChatSessionDTO | null {
  const sessions = listChatSessions(projectId, 1);
  return sessions[0] ?? null;
}

/**
 * Check if a chat session exists.
 */
export function chatSessionExists(id: string): boolean {
  const db = getDatabase();
  const row = db
    .prepare(`SELECT 1 FROM chat_sessions WHERE id = ?`)
    .get(id);
  return row !== undefined;
}
