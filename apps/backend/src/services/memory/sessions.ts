/**
 * PipeFX AI Brain — Session tracking (episodic memory).
 *
 * Sessions represent individual conversation/work periods.
 * Each session can be summarized for efficient future recall.
 */

import { getDatabase } from './database.js';
import type { Session, SessionDTO } from './types.js';

function toDTO(row: Session): SessionDTO {
  return {
    id: row.id,
    projectId: row.project_id,
    summary: row.summary,
    keyOutcomes: row.key_outcomes ? JSON.parse(row.key_outcomes) : [],
    toolsUsed: row.tools_used ? JSON.parse(row.tools_used) : [],
    startedAt: row.started_at,
    endedAt: row.ended_at,
  };
}

export function startSession(
  id: string,
  projectId?: string
): SessionDTO {
  const db = getDatabase();
  const now = Date.now();
  db.prepare(
    `INSERT INTO sessions (id, project_id, started_at) VALUES (?, ?, ?)`
  ).run(id, projectId ?? null, now);
  return getSession(id)!;
}

export function getSession(id: string): SessionDTO | null {
  const db = getDatabase();
  const row = db
    .prepare('SELECT * FROM sessions WHERE id = ?')
    .get(id) as Session | undefined;
  return row ? toDTO(row) : null;
}

export function endSession(
  id: string,
  summary?: string,
  keyOutcomes?: string[],
  toolsUsed?: string[]
): SessionDTO | null {
  const db = getDatabase();
  const now = Date.now();
  const result = db.prepare(
    `UPDATE sessions SET
       ended_at = ?,
       summary = COALESCE(?, summary),
       key_outcomes = COALESCE(?, key_outcomes),
       tools_used = COALESCE(?, tools_used)
     WHERE id = ?`
  ).run(
    now,
    summary ?? null,
    keyOutcomes ? JSON.stringify(keyOutcomes) : null,
    toolsUsed ? JSON.stringify(toolsUsed) : null,
    id
  );
  return result.changes > 0 ? getSession(id) : null;
}

export function updateSessionSummary(
  id: string,
  summary: string,
  keyOutcomes?: string[]
): SessionDTO | null {
  const db = getDatabase();
  const result = db.prepare(
    `UPDATE sessions SET
       summary = ?,
       key_outcomes = COALESCE(?, key_outcomes)
     WHERE id = ?`
  ).run(
    summary,
    keyOutcomes ? JSON.stringify(keyOutcomes) : null,
    id
  );
  return result.changes > 0 ? getSession(id) : null;
}

/**
 * Get the most recent sessions for a project, ordered by recency.
 */
export function getRecentSessions(
  projectId: string,
  limit = 5
): SessionDTO[] {
  const db = getDatabase();
  const rows = db
    .prepare(
      `SELECT * FROM sessions
       WHERE project_id = ?
       ORDER BY started_at DESC
       LIMIT ?`
    )
    .all(projectId, limit) as Session[];
  return rows.map(toDTO);
}

/**
 * Get the last session summary for a project (for continuity injection).
 */
export function getLastSessionSummary(projectId: string): string | null {
  const db = getDatabase();
  const row = db
    .prepare(
      `SELECT summary FROM sessions
       WHERE project_id = ? AND summary IS NOT NULL
       ORDER BY ended_at DESC
       LIMIT 1`
    )
    .get(projectId) as { summary: string } | undefined;
  return row?.summary ?? null;
}

/**
 * Record an individual interaction within a session.
 */
export function addInteraction(
  sessionId: string,
  role: 'user' | 'assistant' | 'tool',
  content: string,
  toolName?: string,
  toolResult?: string
): void {
  const db = getDatabase();
  db.prepare(
    `INSERT INTO interactions (session_id, role, content, tool_name, tool_result, timestamp)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(sessionId, role, content, toolName ?? null, toolResult ?? null, Date.now());
}
