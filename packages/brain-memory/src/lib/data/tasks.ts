/**
 * PipeFX AI Brain ΓÇö Event-sourced task persistence (procedural memory).
 *
 * Every task mutation is recorded as an immutable event in the `task_events`
 * table. The `tasks` table is a materialized view kept in sync for fast
 * queries. Events are emitted on the EventEmitter for SSE streaming.
 *
 * Uses the shared `@pipefx/tasks` package for types, events, and reducers
 * to guarantee consistency with the frontend.
 */

import { EventEmitter } from 'events';
import { getDatabase } from './database.js';
import {
  taskReducer,
} from '@pipefx/tasks';
import type {
  TaskDTO,
  TaskStatus,
  TaskEvent,
} from '@pipefx/tasks';

// ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ DB Row Types ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

interface TaskRow {
  id: string;
  project_id: string | null;
  session_id: string | null;
  name: string;
  status: string;
  steps: string | null;
  thoughts: string | null;
  result_summary: string | null;
  created_at: number;
  completed_at: number | null;
}

function rowToDTO(row: TaskRow): TaskDTO {
  return {
    id: row.id,
    projectId: row.project_id,
    sessionId: row.session_id,
    name: row.name,
    status: row.status as TaskStatus,
    steps: row.steps ? JSON.parse(row.steps) : [],
    thoughts: row.thoughts ? JSON.parse(row.thoughts) : [],
    resultSummary: row.result_summary,
    createdAt: row.created_at,
    completedAt: row.completed_at,
  };
}

// ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ Event Persistence ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

function appendEvent(event: TaskEvent): void {
  const db = getDatabase();
  const taskId = 'taskId' in event ? event.taskId : 'global';
  db.prepare(
    `INSERT INTO task_events (task_id, type, payload, timestamp) VALUES (?, ?, ?, ?)`
  ).run(
    taskId,
    event.type,
    JSON.stringify(event),
    event.timestamp
  );
}

// ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ Materialized View Sync ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

function materializeTask(dto: TaskDTO): void {
  const db = getDatabase();
  db.prepare(
    `INSERT OR REPLACE INTO tasks (id, project_id, session_id, name, status, steps, thoughts, result_summary, created_at, completed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    dto.id,
    dto.projectId,
    dto.sessionId,
    dto.name,
    dto.status,
    JSON.stringify(dto.steps),
    JSON.stringify(dto.thoughts),
    dto.resultSummary,
    dto.createdAt,
    dto.completedAt
  );
}

// ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ MemoryTaskManager ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

/**
 * Event-sourced TaskManager backed by SQLite.
 *
 * Emits `TaskEvent` objects (not full DTOs) for SSE streaming.
 * The frontend uses the same `tasksReducer` from `@pipefx/tasks`
 * to compute local state from the event stream.
 */
export class MemoryTaskManager extends EventEmitter {

  createTask(
    id: string,
    name: string,
    stepsDesc: string[],
    projectId?: string,
    sessionId?: string
  ): TaskDTO {
    const event: TaskEvent = {
      type: 'task_created',
      taskId: id,
      name,
      steps: stepsDesc,
      projectId,
      sessionId,
      timestamp: Date.now(),
    };

    const dto = taskReducer(undefined, event)!;
    appendEvent(event);
    materializeTask(dto);
    this.emit('taskEvent', event);
    return dto;
  }

  updateTaskStep(
    id: string,
    stepIndex: number,
    status: TaskStatus
  ): TaskDTO | null {
    const current = this.getTask(id);
    if (!current) return null;

    const event: TaskEvent = {
      type: 'step_updated',
      taskId: id,
      stepIndex,
      status,
      timestamp: Date.now(),
    };

    const dto = taskReducer(current, event)!;
    appendEvent(event);
    materializeTask(dto);
    this.emit('taskEvent', event);
    return dto;
  }

  addTaskStep(
    id: string,
    description: string,
    status: TaskStatus = 'pending'
  ): number {
    const current = this.getTask(id);
    if (!current) return -1;

    const event: TaskEvent = {
      type: 'step_added',
      taskId: id,
      description,
      status,
      timestamp: Date.now(),
    };

    const dto = taskReducer(current, event)!;
    appendEvent(event);
    materializeTask(dto);
    this.emit('taskEvent', event);
    return dto.steps.length - 1;
  }

  emitThought(id: string, content: string): void {
    const current = this.getTask(id);
    if (!current) return;

    const event: TaskEvent = {
      type: 'thought',
      taskId: id,
      content,
      timestamp: Date.now(),
    };

    const dto = taskReducer(current, event)!;
    appendEvent(event);
    materializeTask(dto);
    this.emit('taskEvent', event);
  }

  finishTask(id: string, status: 'done' | 'error' | 'cancelled'): TaskDTO | null {
    const current = this.getTask(id);
    if (!current) return null;

    const event: TaskEvent = {
      type: 'task_finished',
      taskId: id,
      status,
      timestamp: Date.now(),
    };

    const dto = taskReducer(current, event)!;
    appendEvent(event);
    materializeTask(dto);
    this.emit('taskEvent', event);
    return dto;
  }

  getTask(id: string): TaskDTO | undefined {
    const db = getDatabase();
    const row = db
      .prepare('SELECT * FROM tasks WHERE id = ?')
      .get(id) as TaskRow | undefined;
    return row ? rowToDTO(row) : undefined;
  }

  getAllTasks(): TaskDTO[] {
    const db = getDatabase();
    const rows = db
      .prepare('SELECT * FROM tasks ORDER BY created_at DESC')
      .all() as TaskRow[];
    return rows.map(rowToDTO);
  }

  getTasksByProject(projectId?: string): TaskDTO[] {
    const db = getDatabase();
    if (!projectId) return this.getAllTasks();
    const rows = db
      .prepare(
        'SELECT * FROM tasks WHERE project_id = ? ORDER BY created_at DESC'
      )
      .all(projectId) as TaskRow[];
    return rows.map(rowToDTO);
  }

  clearAllTasks(): void {
    const db = getDatabase();

    const event: TaskEvent = {
      type: 'tasks_cleared',
      timestamp: Date.now(),
    };

    db.prepare('DELETE FROM tasks').run();
    db.prepare('DELETE FROM task_events').run();
    appendEvent(event);
    this.emit('taskEvent', event);
  }

  /**
   * Purge completed tasks and their events older than the given age.
   * Called on startup for TTL cleanup.
   */
  purgeOldTasks(maxAgeMs: number = 7 * 24 * 60 * 60 * 1000): number {
    const db = getDatabase();
    const cutoff = Date.now() - maxAgeMs;

    // Find task IDs to purge
    const taskIds = db
      .prepare(
        `SELECT id FROM tasks WHERE status IN ('done', 'error', 'cancelled') AND completed_at < ?`
      )
      .all(cutoff) as { id: string }[];

    if (taskIds.length === 0) return 0;

    const ids = taskIds.map((t) => t.id);
    const placeholders = ids.map(() => '?').join(',');

    db.prepare(`DELETE FROM task_events WHERE task_id IN (${placeholders})`).run(...ids);
    db.prepare(`DELETE FROM tasks WHERE id IN (${placeholders})`).run(...ids);

    console.log(`[Memory] Purged ${ids.length} completed tasks older than ${Math.round(maxAgeMs / 86400000)}d`);
    return ids.length;
  }
}

/** Singleton instance. */
export const memoryTaskManager = new MemoryTaskManager();
