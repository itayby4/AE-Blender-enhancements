import type { Router } from '../router.js';
import { readBody, jsonResponse, jsonError } from '../router.js';
import {
  listProjects,
  getProject,
  createProject,
  getProjectMemories,
  addProjectMemory,
  deleteProjectMemoryByIndex,
} from '../services/memory/index.js';
import type { ConnectorRegistry } from '@pipefx/connectors';

/**
 * Registers project and active-app-state HTTP routes.
 */
export function registerProjectRoutes(
  router: Router,
  deps: { registry: ConnectorRegistry }
) {
  // GET /api/projects
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

  // POST /api/projects
  router.post('/api/projects', async (req, res) => {
    try {
      const body = await readBody(req);
      const { name, externalAppName, externalProjectName } = JSON.parse(body);
      const p = createProject(name, externalAppName, externalProjectName);
      jsonResponse(res, p);
    } catch (err) {
      jsonError(res, err);
    }
  });

  // POST /api/projects/memory
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

  // GET /api/active-app-state
  router.get('/api/active-app-state', async (_req, res) => {
    try {
      let activeProjectName = null;

      // Only attempt the tool call if the connector is actually connected.
      // This prevents the reconnect spam loop when DaVinci Resolve isn't running.
      let isResolveConnected = false;
      try {
        const resolveConnector = deps.registry.getConnector('resolve');
        isResolveConnected = resolveConnector?.isConnected() ?? false;
      } catch {
        // Connector not registered ΓÇö skip
      }

      if (isResolveConnected) {
        try {
          const result = await deps.registry.callTool('get_project_info', {});
          const content = String(result.content)
            .replace(/```json/g, '')
            .replace(/```/g, '')
            .trim();
          const data = JSON.parse(content);
          if (data.project_name) activeProjectName = data.project_name;
        } catch (_silentErr) {
          // Tool call failed ΓÇö app might have just closed
        }
      }

      jsonResponse(res, { activeProjectName });
    } catch (err) {
      jsonError(res, err);
    }
  });
}
