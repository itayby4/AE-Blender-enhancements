/**
 * PipeFX AI Brain — Knowledge (semantic memory) CRUD + full-text search.
 *
 * This is the core of the AI's long-term memory. Knowledge items are
 * categorized, versioned, and searchable via FTS5.
 */

import { getDatabase } from './database.js';
import type {
  Knowledge,
  KnowledgeDTO,
  KnowledgeInsert,
  KnowledgeCategory,
} from './types.js';

function toDTO(row: Knowledge): KnowledgeDTO {
  return {
    id: row.id,
    projectId: row.project_id,
    category: row.category,
    subject: row.subject,
    content: row.content,
    source: row.source,
    confidence: row.confidence,
    accessCount: row.access_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    supersededBy: row.superseded_by,
  };
}

// ──────────────────────── Create ────────────────────────

export function addKnowledge(item: KnowledgeInsert): KnowledgeDTO {
  const db = getDatabase();
  const now = Date.now();
  const result = db.prepare(
    `INSERT INTO knowledge (project_id, category, subject, content, source, confidence, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    item.projectId ?? null,
    item.category,
    item.subject,
    item.content,
    item.source ?? 'user_stated',
    item.confidence ?? 1.0,
    now,
    now
  );
  return getKnowledgeById(Number(result.lastInsertRowid))!;
}

// ──────────────────────── Read ────────────────────────

export function getKnowledgeById(id: number): KnowledgeDTO | null {
  const db = getDatabase();
  const row = db
    .prepare('SELECT * FROM knowledge WHERE id = ?')
    .get(id) as Knowledge | undefined;
  return row ? toDTO(row) : null;
}

/**
 * List all active (non-superseded) knowledge for a project.
 * If projectId is null, returns global knowledge only.
 */
export function listKnowledge(
  projectId?: string,
  categories?: KnowledgeCategory[]
): KnowledgeDTO[] {
  const db = getDatabase();
  let sql = 'SELECT * FROM knowledge WHERE superseded_by IS NULL';
  const params: unknown[] = [];

  if (projectId !== undefined) {
    sql += ' AND (project_id = ? OR project_id IS NULL)';
    params.push(projectId);
  }

  if (categories && categories.length > 0) {
    const placeholders = categories.map(() => '?').join(', ');
    sql += ` AND category IN (${placeholders})`;
    params.push(...categories);
  }

  sql += ' ORDER BY confidence DESC, updated_at DESC';

  const rows = db.prepare(sql).all(...params) as Knowledge[];
  return rows.map(toDTO);
}

/**
 * Search knowledge using FTS5 full-text search.
 * Returns only active (non-superseded) entries, optionally scoped to a project.
 */
export function searchKnowledge(
  query: string,
  projectId?: string,
  limit = 15
): KnowledgeDTO[] {
  const db = getDatabase();

  // Tokenize the query for FTS5 — wrap each word with * for prefix matching
  const ftsQuery = query
    .split(/\s+/)
    .filter((w) => w.length > 1)
    .map((w) => `"${w}"*`)
    .join(' OR ');

  if (!ftsQuery) return [];

  let sql = `
    SELECT k.* FROM knowledge k
    JOIN knowledge_fts fts ON k.id = fts.rowid
    WHERE knowledge_fts MATCH ?
      AND k.superseded_by IS NULL`;
  const params: unknown[] = [ftsQuery];

  if (projectId) {
    sql += ' AND (k.project_id = ? OR k.project_id IS NULL)';
    params.push(projectId);
  }

  sql += ' ORDER BY rank, k.confidence DESC LIMIT ?';
  params.push(limit);

  const rows = db.prepare(sql).all(...params) as Knowledge[];

  // Bump access counts for retrieved items
  if (rows.length > 0) {
    const ids = rows.map((r) => r.id);
    const placeholders = ids.map(() => '?').join(', ');
    db.prepare(
      `UPDATE knowledge SET access_count = access_count + 1, last_accessed = ?
       WHERE id IN (${placeholders})`
    ).run(Date.now(), ...ids);
  }

  return rows.map(toDTO);
}

// ──────────────────────── Update ────────────────────────

/**
 * Update existing knowledge. Creates a version chain by marking the old
 * entry as superseded and creating a new one.
 */
export function updateKnowledge(
  id: number,
  newContent: string,
  reason?: string
): KnowledgeDTO | null {
  const db = getDatabase();
  const existing = db
    .prepare('SELECT * FROM knowledge WHERE id = ?')
    .get(id) as Knowledge | undefined;
  if (!existing) return null;

  const now = Date.now();

  // Create updated version
  const result = db.prepare(
    `INSERT INTO knowledge (project_id, category, subject, content, source, confidence, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    existing.project_id,
    existing.category,
    existing.subject,
    newContent,
    existing.source,
    existing.confidence,
    now,
    now
  );

  const newId = Number(result.lastInsertRowid);

  // Mark old entry as superseded
  db.prepare('UPDATE knowledge SET superseded_by = ?, updated_at = ? WHERE id = ?').run(
    newId,
    now,
    id
  );

  // Record relation
  db.prepare(
    `INSERT INTO knowledge_relations (from_id, to_id, relation_type)
     VALUES (?, ?, 'refines')`
  ).run(newId, id);

  return getKnowledgeById(newId);
}

/**
 * Soft-delete knowledge by marking it as superseded with no replacement.
 * The entry remains in the database for audit trail purposes.
 */
export function forgetKnowledge(id: number): boolean {
  const db = getDatabase();
  const now = Date.now();
  // Mark superseded by -1 (tombstone) to indicate deliberate removal
  const result = db
    .prepare('UPDATE knowledge SET superseded_by = -1, updated_at = ? WHERE id = ? AND superseded_by IS NULL')
    .run(now, id);
  return result.changes > 0;
}

// ──────────────────────── Project Memories (Legacy Compat) ────────────────────────

/**
 * Add a simple memory string (compatible with existing frontend).
 * Stored as a 'preference' category knowledge item.
 */
export function addProjectMemory(
  projectId: string,
  note: string
): KnowledgeDTO {
  return addKnowledge({
    projectId,
    category: 'preference',
    subject: 'user memory',
    content: note,
    source: 'user_stated',
  });
}

/**
 * Get all active memories for a project as simple strings (legacy compat).
 */
export function getProjectMemories(projectId: string): string[] {
  const items = listKnowledge(projectId);
  return items
    .filter((k) => k.projectId === projectId)
    .map((k) => k.content);
}

/**
 * Delete a project memory by its index in the list (legacy compat).
 */
export function deleteProjectMemoryByIndex(
  projectId: string,
  index: number
): boolean {
  const items = listKnowledge(projectId);
  const projectItems = items.filter((k) => k.projectId === projectId);
  if (index < 0 || index >= projectItems.length) return false;
  return forgetKnowledge(projectItems[index].id);
}
