import type { Router } from '../router.js';
import { readBody, jsonResponse, jsonError } from '../router.js';
import { memoryTaskManager } from '../services/memory/index.js';
import type { TaskEvent } from '../services/memory/index.js';

/**
 * Registers task management HTTP routes.
 */
export function registerTaskRoutes(router: Router) {
  // POST /api/tasks/cancel
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

  // POST /api/tasks/clear
  router.post('/api/tasks/clear', async (_req, res) => {
    memoryTaskManager.clearAllTasks();
    jsonResponse(res, { success: true });
  });

  // GET /api/tasks/stream (SSE)
  router.get('/api/tasks/stream', (req, res) => {
    const urlObject = new URL(req.url!, `http://${req.headers.host}`);
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
        if (task && task.projectId && task.projectId !== projectIdParam)
          return;
      }
      res.write(`data: ${JSON.stringify({ type: 'event', event })}\n\n`);
    };

    memoryTaskManager.on('taskEvent', handleTaskEvent);

    req.on('close', () => {
      memoryTaskManager.off('taskEvent', handleTaskEvent);
      res.end();
    });
  }, true); // prefix matching
}
