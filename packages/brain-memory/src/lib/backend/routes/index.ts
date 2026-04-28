import type { IncomingMessage, ServerResponse } from 'node:http';
import type { TaskEvent } from '@pipefx/tasks';
import {
  listKnowledge,
  forgetKnowledge,
  getProjectMemories,
  addProjectMemory,
  deleteProjectMemoryByIndex,
} from '../../data/knowledge.js';
import { memoryTaskManager } from '../../data/tasks.js';
import {
  listProjects,
  getProject,
  createProject,
  updateProject,
} from '../../data/projects.js';
import { brainMemoryLog } from '../../log.js';

// ── Minimal router shape — structurally satisfied by apps/backend Router. ──
export interface MemoryRouter {
  get(
    path: string,
    handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>,
    prefix?: boolean
  ): unknown;
  post(
    path: string,
    handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>,
    prefix?: boolean
  ): unknown;
  delete(
    path: string,
    handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>,
    prefix?: boolean
  ): unknown;
}

// ── Helpers (inlined to avoid importing from backend) ──

function jsonResponse(res: ServerResponse, data: unknown, status = 200): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function jsonError(res: ServerResponse, error: unknown, status = 500): void {
  const message = error instanceof Error ? error.message : String(error);
  jsonResponse(res, { error: message }, status);
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

// ── Mount /api/knowledge + /api/tasks (memoryTaskManager) routes ──

export function mountMemoryRoutes(router: MemoryRouter): void {
  // ── GET /api/knowledge ──
  router.get(
    '/api/knowledge',
    async (req, res) => {
      try {
        const urlObj = new URL(req.url ?? '', `http://${req.headers.host}`);
        const projectIdParam = urlObj.searchParams.get('projectId') || undefined;
        const items = listKnowledge(projectIdParam);
        jsonResponse(res, items);
      } catch (err) {
        brainMemoryLog.error('GET /api/knowledge', {
          error: err instanceof Error ? err.message : String(err),
        });
        jsonError(res, err);
      }
    },
    /* prefix */ true
  );

  // ── DELETE /api/knowledge ──
  router.delete('/api/knowledge', async (req, res) => {
    try {
      const body = await readBody(req);
      const { id } = JSON.parse(body);
      if (id) forgetKnowledge(Number(id));
      jsonResponse(res, { success: true });
    } catch (err) {
      brainMemoryLog.error('DELETE /api/knowledge', {
        error: err instanceof Error ? err.message : String(err),
      });
      jsonError(res, err);
    }
  });

  // ── POST /api/tasks/cancel ──
  router.post('/api/tasks/cancel', async (req, res) => {
    try {
      const body = await readBody(req);
      const { taskId } = JSON.parse(body);
      if (taskId) {
        memoryTaskManager.finishTask(taskId, 'cancelled');
        jsonResponse(res, { success: true });
      } else {
        jsonResponse(res, { error: 'taskId required' }, 400);
      }
    } catch (err) {
      jsonError(res, err);
    }
  });

  // ── POST /api/tasks/clear ──
  router.post('/api/tasks/clear', async (_req, res) => {
    memoryTaskManager.clearAllTasks();
    jsonResponse(res, { success: true });
  });

  // ── GET /api/projects ──
  router.get('/api/projects', async (_req, res) => {
    try {
      const projects = listProjects();
      const projectsWithMemories = projects.map((p) => ({
        ...p,
        memories: getProjectMemories(p.id),
      }));
      jsonResponse(res, projectsWithMemories);
    } catch (err) {
      jsonError(res, err);
    }
  });

  // ── POST /api/projects ──
  router.post('/api/projects', async (req, res) => {
    try {
      const body = await readBody(req);
      const { name, externalAppName, externalProjectName, folderPath } =
        JSON.parse(body);
      const p = createProject(name, externalAppName, externalProjectName, folderPath);
      jsonResponse(res, p);
    } catch (err) {
      jsonError(res, err);
    }
  });

  // ── POST /api/projects/update ──
  router.post('/api/projects/update', async (req, res) => {
    try {
      const body = await readBody(req);
      const { id, ...updates } = JSON.parse(body);
      const updated = updateProject(id, updates);
      if (!updated) {
        jsonResponse(res, { error: 'Project not found' }, 404);
        return;
      }
      jsonResponse(res, updated);
    } catch (err) {
      jsonError(res, err);
    }
  });

  // ── POST /api/projects/memory ──
  router.post('/api/projects/memory', async (req, res) => {
    try {
      const body = await readBody(req);
      const { projectId, action, note, memoryIndex } = JSON.parse(body);
      if (action === 'delete') {
        deleteProjectMemoryByIndex(projectId, memoryIndex);
      } else {
        addProjectMemory(projectId, note);
      }
      const project = getProject(projectId);
      const memories = getProjectMemories(projectId);
      jsonResponse(res, { ...project, memories });
    } catch (err) {
      jsonError(res, err);
    }
  });

  // ── GET /api/tasks/stream (SSE) ──
  router.get(
    '/api/tasks/stream',
    (req, res) => {
      const urlObject = new URL(req.url ?? '', `http://${req.headers.host}`);
      const projectIdParam =
        urlObject.searchParams.get('projectId') || undefined;

      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });

      // Send initial state
      res.write(
        `data: ${JSON.stringify({
          type: 'init',
          tasks: memoryTaskManager.getTasksByProject(projectIdParam),
        })}\n\n`
      );

      // Stream individual events
      const handleTaskEvent = (event: TaskEvent) => {
        if (projectIdParam && 'taskId' in event) {
          const task = memoryTaskManager.getTask(event.taskId);
          if (task && task.projectId && task.projectId !== projectIdParam) return;
        }
        res.write(`data: ${JSON.stringify({ type: 'event', event })}\n\n`);
      };

      memoryTaskManager.on('taskEvent', handleTaskEvent);

      req.on('close', () => {
        memoryTaskManager.off('taskEvent', handleTaskEvent);
        res.end();
      });
    },
    /* prefix */ true
  );
}
