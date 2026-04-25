// ── @pipefx/skills/backend/routes/runs ───────────────────────────────────
// REST shell over the SkillRunner + SkillRunStore.
//
//   POST /api/skills/:id/run        → execute; returns the final SkillRunRecord
//   GET  /api/skills/runs           → recent runs (optional ?skillId=&limit=)
//
// The POST endpoint awaits the runner and returns the resolved record (or
// the typed error in JSON form). HTTP status reflects the failure mode so
// the UI can branch without a string match:
//
//   404 SKILL_NOT_FOUND
//   409 SKILL_UNAVAILABLE (matcher gated)
//   402 SKILL_RUN_QUOTA   (Phase 8 billing seam)
//   200 success or in-flight failure (record carries `status: 'failed'`)
//
// Choosing 200 for in-flight failures is deliberate: the run record IS
// the response, the caller branches on `record.status`, and HTTP-level
// retries shouldn't kick in for a brain-loop error that already produced
// a persisted run row.

import type { SkillRunStore } from '../../contracts/api.js';
import type { SkillRunRequest } from '../../contracts/types.js';
import {
  SkillNotFoundError,
  SkillRunQuotaError,
  SkillUnavailableError,
  type SkillRunner,
} from '../../domain/runner.js';
import {
  jsonError,
  jsonResponse,
  readBody,
  type RouterLike,
} from '../internal/http.js';

export interface RunRouteDeps {
  runner: SkillRunner;
  runs: SkillRunStore;
}

export function registerRunRoutes(router: RouterLike, deps: RunRouteDeps) {
  const { runner, runs } = deps;

  // GET /api/skills/runs — recent runs (optionally filtered).
  // Registered BEFORE the prefix POST so the explicit path takes precedence.
  router.get('/api/skills/runs', async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://localhost');
      const skillId = url.searchParams.get('skillId') || undefined;
      const limitParam = url.searchParams.get('limit');
      const limit = limitParam ? parseInt(limitParam, 10) : undefined;
      jsonResponse(res, runs.list(skillId, limit));
    } catch (err) {
      jsonError(res, err);
    }
  });

  // POST /api/skills/:id/run — execute. Prefix-match because the id is in
  // the path; we extract + verify the trailing `/run` segment manually.
  router.post('/api/skills/', async (req, res) => {
    try {
      const url = req.url ?? '';
      const tail = url.split('?')[0].replace('/api/skills/', '');
      const parts = tail.split('/');
      const skillId = parts[0];
      const action = parts[1];

      if (!skillId || action !== 'run') {
        jsonResponse(res, { error: 'use POST /api/skills/:id/run' }, 404);
        return;
      }

      const body = await readBody(req);
      const payload = body ? JSON.parse(body) : {};
      const request: SkillRunRequest = {
        skillId,
        inputs: payload.inputs ?? {},
        sessionId: payload.sessionId,
      };

      const record = await runner.run(request);
      jsonResponse(res, record);
    } catch (err) {
      if (err instanceof SkillNotFoundError) {
        jsonResponse(res, { code: err.code, error: err.message }, 404);
        return;
      }
      if (err instanceof SkillUnavailableError) {
        jsonResponse(
          res,
          { code: err.code, error: err.message, missing: err.missing },
          409
        );
        return;
      }
      if (err instanceof SkillRunQuotaError) {
        jsonResponse(res, { code: err.code, error: err.message }, 402);
        return;
      }
      jsonError(res, err);
    }
  }, true);
}
