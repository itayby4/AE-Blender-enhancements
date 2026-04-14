/**
 * PipeFX AI Brain — Project CRUD operations.
 */

import { getDatabase } from './database.js';
import type { Project, ProjectDTO } from './types.js';

function toDTO(row: Project): ProjectDTO {
  return {
    id: row.id,
    name: row.name,
    externalAppName: row.external_app ?? undefined,
    externalProjectName: row.external_project ?? undefined,
    genre: row.genre ?? undefined,
    targetPlatforms: row.target_platforms
      ? JSON.parse(row.target_platforms)
      : undefined,
    deliverables: row.deliverables
      ? JSON.parse(row.deliverables)
      : undefined,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listProjects(): ProjectDTO[] {
  const db = getDatabase();
  const rows = db
    .prepare('SELECT * FROM projects ORDER BY updated_at DESC')
    .all() as Project[];
  return rows.map(toDTO);
}

export function getProject(id: string): ProjectDTO | null {
  const db = getDatabase();
  const row = db
    .prepare('SELECT * FROM projects WHERE id = ?')
    .get(id) as Project | undefined;
  return row ? toDTO(row) : null;
}

export function createProject(
  name: string,
  externalAppName?: string,
  externalProjectName?: string
): ProjectDTO {
  const db = getDatabase();
  const now = Date.now();
  const id = `proj_${now}`;
  db.prepare(
    `INSERT INTO projects (id, name, external_app, external_project, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'active', ?, ?)`
  ).run(id, name, externalAppName ?? null, externalProjectName ?? null, now, now);
  return getProject(id)!;
}

export function updateProject(
  id: string,
  updates: Partial<{
    name: string;
    externalAppName: string;
    externalProjectName: string;
    genre: string;
    targetPlatforms: string[];
    deliverables: Record<string, unknown>;
    status: string;
  }>
): ProjectDTO | null {
  const db = getDatabase();
  const existing = db
    .prepare('SELECT * FROM projects WHERE id = ?')
    .get(id) as Project | undefined;
  if (!existing) return null;

  const now = Date.now();
  db.prepare(
    `UPDATE projects SET
       name = ?,
       external_app = ?,
       external_project = ?,
       genre = ?,
       target_platforms = ?,
       deliverables = ?,
       status = ?,
       updated_at = ?
     WHERE id = ?`
  ).run(
    updates.name ?? existing.name,
    updates.externalAppName ?? existing.external_app,
    updates.externalProjectName ?? existing.external_project,
    updates.genre ?? existing.genre,
    updates.targetPlatforms
      ? JSON.stringify(updates.targetPlatforms)
      : existing.target_platforms,
    updates.deliverables
      ? JSON.stringify(updates.deliverables)
      : existing.deliverables,
    updates.status ?? existing.status,
    now,
    id
  );

  return getProject(id);
}

export function deleteProject(id: string): boolean {
  const db = getDatabase();
  const result = db.prepare('DELETE FROM projects WHERE id = ?').run(id);
  return result.changes > 0;
}
