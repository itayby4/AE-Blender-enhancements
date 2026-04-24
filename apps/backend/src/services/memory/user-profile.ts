/**
 * PipeFX AI Brain — User profile (cross-project preferences).
 */

import { getDatabase } from './database.js';
import type { UserProfileRow } from './types.js';

export function setUserPreference(key: string, value: unknown): void {
  const db = getDatabase();
  db.prepare(
    `INSERT OR REPLACE INTO user_profile (key, value, updated_at) VALUES (?, ?, ?)`
  ).run(key, JSON.stringify(value), Date.now());
}

export function getUserPreference(key: string): unknown | undefined {
  const db = getDatabase();
  const row = db
    .prepare('SELECT value FROM user_profile WHERE key = ?')
    .get(key) as UserProfileRow | undefined;
  return row ? JSON.parse(row.value) : undefined;
}

export function getUserPreferences(): Record<string, unknown> {
  const db = getDatabase();
  const rows = db
    .prepare('SELECT key, value FROM user_profile')
    .all() as UserProfileRow[];
  const prefs: Record<string, unknown> = {};
  for (const row of rows) {
    try {
      prefs[row.key] = JSON.parse(row.value);
    } catch {
      prefs[row.key] = row.value;
    }
  }
  return prefs;
}

export function deleteUserPreference(key: string): boolean {
  const db = getDatabase();
  const result = db.prepare('DELETE FROM user_profile WHERE key = ?').run(key);
  return result.changes > 0;
}
