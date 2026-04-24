/**
 * PipeFX AI Brain — Migration utility.
 *
 * Migrates existing JSON project files from data/projects/*.json
 * into the new SQLite database. Run once during the transition.
 */

import * as fs from 'fs';
import * as path from 'path';
import { config } from '../../config.js';
import { getDatabase } from './database.js';
import { addKnowledge } from './knowledge.js';

interface LegacyProject {
  id: string;
  name: string;
  externalAppName?: string;
  externalProjectName?: string;
  memories: string[];
  tasks?: Array<{
    id: string;
    name: string;
    steps: Array<{ description: string; status: string }>;
    status: string;
    createdAt: number;
    projectId?: string;
  }>;
}

/**
 * Migrate all existing JSON project files into the SQLite database.
 * Safe to call multiple times — skips projects that already exist.
 */
export function migrateJsonProjects(): { migrated: number; skipped: number } {
  const projectsDir = path.join(config.workspaceRoot, 'data', 'projects');
  if (!fs.existsSync(projectsDir)) {
    return { migrated: 0, skipped: 0 };
  }

  const db = getDatabase();
  const files = fs.readdirSync(projectsDir).filter((f) => f.endsWith('.json'));

  let migrated = 0;
  let skipped = 0;

  for (const file of files) {
    try {
      const raw = fs.readFileSync(path.join(projectsDir, file), 'utf-8');
      const legacy: LegacyProject = JSON.parse(raw);

      // Check if already migrated
      const existing = db
        .prepare('SELECT id FROM projects WHERE id = ?')
        .get(legacy.id);
      if (existing) {
        skipped++;
        continue;
      }

      const now = Date.now();

      // Insert project
      db.prepare(
        `INSERT INTO projects (id, name, external_app, external_project, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'active', ?, ?)`
      ).run(
        legacy.id,
        legacy.name,
        legacy.externalAppName ?? null,
        legacy.externalProjectName ?? null,
        now,
        now
      );

      // Migrate memories → knowledge items
      if (legacy.memories && legacy.memories.length > 0) {
        for (const mem of legacy.memories) {
          addKnowledge({
            projectId: legacy.id,
            category: 'preference',
            subject: 'user memory',
            content: mem,
            source: 'user_stated',
          });
        }
      }

      // Migrate tasks
      if (legacy.tasks && legacy.tasks.length > 0) {
        for (const task of legacy.tasks) {
          db.prepare(
            `INSERT OR IGNORE INTO tasks (id, project_id, name, status, steps, created_at, completed_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`
          ).run(
            task.id,
            legacy.id,
            task.name,
            task.status,
            JSON.stringify(task.steps),
            task.createdAt,
            task.status === 'done' || task.status === 'error'
              ? task.createdAt
              : null
          );
        }
      }

      migrated++;
      console.log(`[Migration] Migrated project: ${legacy.name} (${legacy.id})`);
    } catch (err) {
      console.warn(`[Migration] Failed to migrate ${file}:`, err);
    }
  }

  return { migrated, skipped };
}
