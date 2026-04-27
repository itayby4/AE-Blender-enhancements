/**
 * PipeFX AI Brain — SQLite database initialization & schema management.
 *
 * Single `.db` file holds all persistent state for the AI cognitive architecture.
 * Uses WAL mode for crash safety and concurrent read performance.
 *
 * Callers must invoke `configureMemoryStore({ workspaceRoot })` before any
 * memory function. The workspaceRoot is injected by the host (apps/backend)
 * so brain-memory does not import from apps.
 */

import Database from 'better-sqlite3';
import * as path from 'node:path';
import * as fs from 'node:fs';

let db: Database.Database | null = null;
let workspaceRoot: string | null = null;

const SCHEMA_VERSION = 3;

export interface MemoryStoreConfig {
  workspaceRoot: string;
}

/** One-time configuration — must be called before `getDatabase()`. */
export function configureMemoryStore(cfg: MemoryStoreConfig): void {
  workspaceRoot = cfg.workspaceRoot;
}

/** Resolve workspaceRoot (for callers that need it — e.g. migrate.ts). */
export function getWorkspaceRoot(): string {
  if (!workspaceRoot) {
    throw new Error(
      '[Memory] configureMemoryStore({ workspaceRoot }) must be called before any memory function.'
    );
  }
  return workspaceRoot;
}

/** Get the path to the SQLite database file. */
function getDbPath(): string {
  const dataDir = path.join(getWorkspaceRoot(), 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  return path.join(dataDir, 'pipefx.db');
}

/** Create all tables for the AI memory engine. */
function createSchema(database: Database.Database): void {
  database.exec(`
    -- ============ META ============

    CREATE TABLE IF NOT EXISTS schema_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    -- ============ IDENTITY LAYER ============

    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      external_app TEXT,
      external_project TEXT,
      genre TEXT,
      target_platforms TEXT,
      deliverables TEXT,
      status TEXT DEFAULT 'active',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS user_profile (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER
    );

    -- ============ SEMANTIC MEMORY (Knowledge) ============

    CREATE TABLE IF NOT EXISTS knowledge (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id TEXT,
      category TEXT NOT NULL,
      subject TEXT NOT NULL,
      content TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'user_stated',
      confidence REAL DEFAULT 1.0,
      access_count INTEGER DEFAULT 0,
      last_accessed INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      superseded_by INTEGER,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY (superseded_by) REFERENCES knowledge(id)
    );

    CREATE INDEX IF NOT EXISTS idx_knowledge_project
      ON knowledge(project_id);
    CREATE INDEX IF NOT EXISTS idx_knowledge_category
      ON knowledge(category);
    CREATE INDEX IF NOT EXISTS idx_knowledge_project_category
      ON knowledge(project_id, category);

    CREATE TABLE IF NOT EXISTS knowledge_relations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_id INTEGER NOT NULL,
      to_id INTEGER NOT NULL,
      relation_type TEXT NOT NULL,
      FOREIGN KEY (from_id) REFERENCES knowledge(id) ON DELETE CASCADE,
      FOREIGN KEY (to_id) REFERENCES knowledge(id) ON DELETE CASCADE
    );

    -- ============ EPISODIC MEMORY (History) ============

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      project_id TEXT,
      summary TEXT,
      key_outcomes TEXT,
      tools_used TEXT,
      started_at INTEGER NOT NULL,
      ended_at INTEGER,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_project
      ON sessions(project_id);

    CREATE TABLE IF NOT EXISTS interactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      tool_name TEXT,
      tool_result TEXT,
      timestamp INTEGER NOT NULL,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_interactions_session
      ON interactions(session_id);

    -- ============ PROCEDURAL MEMORY (Tasks & Workflows) ============

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      project_id TEXT,
      session_id TEXT,
      name TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      steps TEXT,
      thoughts TEXT,
      result_summary TEXT,
      created_at INTEGER NOT NULL,
      completed_at INTEGER,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_tasks_project
      ON tasks(project_id);

    CREATE TABLE IF NOT EXISTS task_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id TEXT NOT NULL,
      type TEXT NOT NULL,
      payload TEXT NOT NULL,
      timestamp INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_task_events_task
      ON task_events(task_id);
    CREATE INDEX IF NOT EXISTS idx_task_events_timestamp
      ON task_events(timestamp);

    CREATE TABLE IF NOT EXISTS learned_workflows (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      trigger_pattern TEXT,
      steps TEXT NOT NULL,
      success_count INTEGER DEFAULT 0,
      last_used INTEGER
    );

    -- ============ CHAT PERSISTENCE ============

    CREATE TABLE IF NOT EXISTS chat_sessions (
      id TEXT PRIMARY KEY,
      project_id TEXT,
      title TEXT,
      model TEXT,
      message_count INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_chat_sessions_project
      ON chat_sessions(project_id);
    CREATE INDEX IF NOT EXISTS idx_chat_sessions_updated
      ON chat_sessions(updated_at);

    CREATE TABLE IF NOT EXISTS chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      tool_calls TEXT,
      thought TEXT,
      timestamp INTEGER NOT NULL,
      FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_chat_messages_session
      ON chat_messages(session_id);
  `);

  // FTS5 virtual table (separate because CREATE VIRTUAL TABLE doesn't support IF NOT EXISTS well)
  try {
    database.exec(`
      CREATE VIRTUAL TABLE knowledge_fts USING fts5(
        subject, content, category,
        content=knowledge,
        content_rowid=id
      );
    `);
  } catch {
    // Table already exists — that's fine
  }

  // Set schema version
  database.prepare(
    `INSERT OR REPLACE INTO schema_meta (key, value) VALUES ('version', ?)`
  ).run(String(SCHEMA_VERSION));
}

/** Create FTS triggers to keep the index in sync with the knowledge table. */
function createFtsTriggers(database: Database.Database): void {
  database.exec(`
    CREATE TRIGGER IF NOT EXISTS knowledge_ai AFTER INSERT ON knowledge BEGIN
      INSERT INTO knowledge_fts(rowid, subject, content, category)
        VALUES (new.id, new.subject, new.content, new.category);
    END;

    CREATE TRIGGER IF NOT EXISTS knowledge_ad AFTER DELETE ON knowledge BEGIN
      INSERT INTO knowledge_fts(knowledge_fts, rowid, subject, content, category)
        VALUES ('delete', old.id, old.subject, old.content, old.category);
    END;

    CREATE TRIGGER IF NOT EXISTS knowledge_au AFTER UPDATE ON knowledge BEGIN
      INSERT INTO knowledge_fts(knowledge_fts, rowid, subject, content, category)
        VALUES ('delete', old.id, old.subject, old.content, old.category);
      INSERT INTO knowledge_fts(rowid, subject, content, category)
        VALUES (new.id, new.subject, new.content, new.category);
    END;
  `);
}

/** Migrate an existing database from one schema version to the next. */
function migrateSchema(database: Database.Database, fromVersion: number): void {
  if (fromVersion < 2) {
    console.log('[Memory] Migration v1 → v2: Adding task_events table and thoughts column');
    database.exec(`
      CREATE TABLE IF NOT EXISTS task_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id TEXT NOT NULL,
        type TEXT NOT NULL,
        payload TEXT NOT NULL,
        timestamp INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_task_events_task
        ON task_events(task_id);
      CREATE INDEX IF NOT EXISTS idx_task_events_timestamp
        ON task_events(timestamp);
    `);

    // Add thoughts column if it doesn't exist (ALTER TABLE ADD COLUMN is idempotent-safe)
    try {
      database.exec(`ALTER TABLE tasks ADD COLUMN thoughts TEXT`);
    } catch {
      // Column already exists — fine
    }

    database.prepare(
      `INSERT OR REPLACE INTO schema_meta (key, value) VALUES ('version', ?)`
    ).run(String(2));
  }

  if (fromVersion < 3) {
    console.log('[Memory] Migration v2 → v3: Adding chat persistence tables');
    database.exec(`
      CREATE TABLE IF NOT EXISTS chat_sessions (
        id TEXT PRIMARY KEY,
        project_id TEXT,
        title TEXT,
        model TEXT,
        message_count INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
      );

      CREATE INDEX IF NOT EXISTS idx_chat_sessions_project
        ON chat_sessions(project_id);
      CREATE INDEX IF NOT EXISTS idx_chat_sessions_updated
        ON chat_sessions(updated_at);

      CREATE TABLE IF NOT EXISTS chat_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        tool_calls TEXT,
        thought TEXT,
        timestamp INTEGER NOT NULL,
        FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_chat_messages_session
        ON chat_messages(session_id);
    `);

    database.prepare(
      `INSERT OR REPLACE INTO schema_meta (key, value) VALUES ('version', ?)`
    ).run(String(3));
  }
}

/**
 * Initialize and return the SQLite database instance.
 * Creates the schema on first run. Subsequent calls return the cached instance.
 */
export function getDatabase(): Database.Database {
  if (db) return db;

  const dbPath = getDbPath();
  const isNew = !fs.existsSync(dbPath);

  db = new Database(dbPath);

  // Performance & safety settings
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');

  if (isNew) {
    console.log('[Memory] Creating new database at', dbPath);
    createSchema(db);
    createFtsTriggers(db);
  } else {
    // Ensure schema is up to date
    const versionRow = db
      .prepare(`SELECT value FROM schema_meta WHERE key = 'version'`)
      .get() as { value: string } | undefined;

    if (!versionRow) {
      // Pre-versioning DB or corrupted — recreate
      console.log('[Memory] No schema version found, initializing schema...');
      createSchema(db);
      createFtsTriggers(db);
    } else {
      const currentVersion = parseInt(versionRow.value, 10);
      if (currentVersion < SCHEMA_VERSION) {
        console.log(
          `[Memory] Upgrading schema from v${currentVersion} to v${SCHEMA_VERSION}`
        );
        migrateSchema(db, currentVersion);
      }
    }
  }

  console.log('[Memory] Database ready:', dbPath);
  return db;
}

/** Close the database connection (for graceful shutdown). */
export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
    console.log('[Memory] Database closed.');
  }
}
