/**
 * PipeFX Usage System — SQLite storage adapter.
 *
 * Append-only usage store for the local backend (BYOK mode).
 * Uses `INSERT OR IGNORE` on the idempotency_key to prevent double-logging.
 *
 * The table is auto-created if it doesn't exist (migration-safe).
 * This module uses `better-sqlite3` types but accepts any compatible DB instance.
 */

import type { UsageEvent, UsageStore } from './types.js';

/** Column-to-property mapping for rows returned by SELECT * */
interface UsageEventRow {
  id: string;
  idempotency_key: string;
  user_id: string;
  session_id: string;
  request_id: string;
  round_index: number;
  model: string;
  provider: string;
  input_tokens: number;
  output_tokens: number;
  thinking_tokens: number;
  cached_tokens: number;
  cost_usd: number;
  credits_debited: number;
  is_byok: number; // SQLite stores booleans as 0/1
  created_at: string;
}

/** Convert a snake_case DB row to a camelCase UsageEvent. */
function rowToEvent(row: UsageEventRow): UsageEvent {
  return {
    id: row.id,
    idempotencyKey: row.idempotency_key,
    userId: row.user_id,
    sessionId: row.session_id,
    requestId: row.request_id,
    roundIndex: row.round_index,
    model: row.model,
    provider: row.provider,
    inputTokens: row.input_tokens,
    outputTokens: row.output_tokens,
    thinkingTokens: row.thinking_tokens,
    cachedTokens: row.cached_tokens,
    costUsd: row.cost_usd,
    creditsDebited: row.credits_debited,
    isByok: row.is_byok === 1,
    createdAt: row.created_at,
  };
}

/**
 * Minimal interface for a better-sqlite3 Database instance.
 * We use this instead of importing the concrete type to avoid
 * a hard dependency on better-sqlite3 in the package (it's provided
 * by the host app — apps/backend).
 */
interface SqliteDatabase {
  exec(sql: string): void;
  prepare(sql: string): {
    run(...args: unknown[]): { changes: number };
    get(...args: unknown[]): unknown;
    all(...args: unknown[]): unknown[];
  };
}

/**
 * Create a SQLite-backed usage store.
 *
 * Auto-creates the `usage_events` table + indexes on first call.
 * All writes are idempotent via UNIQUE(idempotency_key) + INSERT OR IGNORE.
 */
export function createSqliteUsageStore(db: SqliteDatabase): UsageStore {
  // Auto-migrate: create table + indexes if they don't exist
  db.exec(`
    CREATE TABLE IF NOT EXISTS usage_events (
      id TEXT PRIMARY KEY,
      idempotency_key TEXT UNIQUE NOT NULL,
      user_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      request_id TEXT NOT NULL,
      round_index INTEGER NOT NULL,
      model TEXT NOT NULL,
      provider TEXT NOT NULL,
      input_tokens INTEGER NOT NULL,
      output_tokens INTEGER NOT NULL,
      thinking_tokens INTEGER NOT NULL DEFAULT 0,
      cached_tokens INTEGER NOT NULL DEFAULT 0,
      cost_usd REAL NOT NULL,
      credits_debited INTEGER NOT NULL DEFAULT 0,
      is_byok INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_usage_session ON usage_events(session_id);
    CREATE INDEX IF NOT EXISTS idx_usage_user ON usage_events(user_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_usage_request ON usage_events(request_id);
  `);

  const insertStmt = db.prepare(`
    INSERT OR IGNORE INTO usage_events
    (id, idempotency_key, user_id, session_id, request_id, round_index,
     model, provider, input_tokens, output_tokens, thinking_tokens, cached_tokens,
     cost_usd, credits_debited, is_byok, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  return {
    record(event: UsageEvent): void {
      insertStmt.run(
        event.id,
        event.idempotencyKey,
        event.userId,
        event.sessionId,
        event.requestId,
        event.roundIndex,
        event.model,
        event.provider,
        event.inputTokens,
        event.outputTokens,
        event.thinkingTokens,
        event.cachedTokens,
        event.costUsd,
        event.creditsDebited,
        event.isByok ? 1 : 0,
        event.createdAt
      );
    },

    getBySession(sessionId: string): UsageEvent[] {
      const rows = db
        .prepare(
          'SELECT * FROM usage_events WHERE session_id = ? ORDER BY created_at'
        )
        .all(sessionId) as UsageEventRow[];
      return rows.map(rowToEvent);
    },

    getByRequest(requestId: string): UsageEvent[] {
      const rows = db
        .prepare(
          'SELECT * FROM usage_events WHERE request_id = ? ORDER BY round_index'
        )
        .all(requestId) as UsageEventRow[];
      return rows.map(rowToEvent);
    },

    getByUser(userId: string, limit = 100): UsageEvent[] {
      const rows = db
        .prepare(
          'SELECT * FROM usage_events WHERE user_id = ? ORDER BY created_at DESC LIMIT ?'
        )
        .all(userId, limit) as UsageEventRow[];
      return rows.map(rowToEvent);
    },

    getTotalCredits(userId: string, since?: string): number {
      const query = since
        ? 'SELECT COALESCE(SUM(credits_debited), 0) as total FROM usage_events WHERE user_id = ? AND created_at >= ?'
        : 'SELECT COALESCE(SUM(credits_debited), 0) as total FROM usage_events WHERE user_id = ?';
      const row = (
        since
          ? db.prepare(query).get(userId, since)
          : db.prepare(query).get(userId)
      ) as { total: number };
      return row.total;
    },
  };
}
