import type { Router } from '../router.js';
import { readBody, jsonResponse, jsonError } from '../router.js';
import {
  listKnowledge,
  forgetKnowledge,
} from '../services/memory/index.js';

/**
 * Registers knowledge/memory HTTP routes.
 */
export function registerMemoryRoutes(router: Router) {
  // GET /api/knowledge
  router.get('/api/knowledge', async (req, res) => {
    try {
      const urlObj = new URL(req.url!, `http://${req.headers.host}`);
      const projectIdParam =
        urlObj.searchParams.get('projectId') || undefined;
      const items = listKnowledge(projectIdParam);
      jsonResponse(res, items);
    } catch (err) {
      jsonError(res, err);
    }
  }, true); // prefix match for query params

  // DELETE /api/knowledge
  router.delete('/api/knowledge', async (req, res) => {
    try {
      const body = await readBody(req);
      const { id } = JSON.parse(body);
      if (id) forgetKnowledge(Number(id));
      jsonResponse(res, { success: true });
    } catch (err) {
      jsonError(res, err);
    }
  });
}
