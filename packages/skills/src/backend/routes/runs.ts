// ── @pipefx/skills/backend/routes/runs ───────────────────────────────────
// REST shell over the SkillRunner + SkillRunStore.
//
//   POST /api/skills/:id/run        → execute; returns the final SkillRunRecord
//   GET  /api/skills/runs           → recent runs (optional ?skillId=&limit=)
//
// Status codes:
//
//   404 — skill not installed
//   409 — capability matcher reports the skill as not currently runnable
//   200 — happy path, OR a brain/script failure that produced a `failed`
//         run record. Choosing 200 for in-flight failures is deliberate:
//         the run record IS the response, the caller branches on
//         `record.status`, and HTTP-level retries shouldn't kick in for
//         a brain-loop error that already produced a persisted row.

import type {
  CapabilityMatcher,
  SkillRunner,
  SkillRunStore,
  SkillStore,
} from '../../contracts/api.js';
import {
  jsonError,
  jsonResponse,
  readBody,
  type RouterLike,
} from '../internal/http.js';

export interface RegisterRunRoutesDeps {
  readonly store: SkillStore;
  readonly runner: SkillRunner;
  readonly runs: SkillRunStore;
  /** Optional matcher gate. When provided the route returns 409 with the
   *  list of missing tools before invoking the runner. Omit to skip the
   *  gate (e.g. CLI tooling). */
  readonly matcher?: Pick<CapabilityMatcher, 'snapshot'>;
}

interface RunPayload {
  inputs?: Readonly<Record<string, string | number | boolean>>;
  sessionId?: string;
}

export function registerRunRoutes(
  router: RouterLike,
  deps: RegisterRunRoutesDeps
): void {
  const { store, runner, runs, matcher } = deps;

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

  router.post(
    '/api/skills/',
    async (req, res) => {
      try {
        const url = req.url ?? '';
        const tail = url.split('?')[0]?.replace('/api/skills/', '') ?? '';
        const parts = tail.split('/');
        const skillId = parts[0];
        const action = parts[1];
        if (!skillId || action !== 'run') {
          jsonResponse(res, { error: 'use POST /api/skills/:id/run' }, 404);
          return;
        }

        if (!store.get(skillId)) {
          jsonResponse(
            res,
            { code: 'SKILL_NOT_FOUND', error: `skill "${skillId}" not installed` },
            404
          );
          return;
        }

        if (matcher) {
          const availability = matcher.snapshot().find((a) => a.skillId === skillId);
          if (availability && !availability.runnable) {
            jsonResponse(
              res,
              {
                code: 'SKILL_UNAVAILABLE',
                error: `skill "${skillId}" is missing required tools`,
                missing: availability.missing,
              },
              409
            );
            return;
          }
        }

        const body = await readBody(req);
        const payload = body ? (JSON.parse(body) as RunPayload) : {};
        const record = await runner.run({
          skillId,
          inputs: payload.inputs ?? {},
          sessionId: payload.sessionId,
        });
        jsonResponse(res, record);
      } catch (err) {
        jsonError(res, err);
      }
    },
    true
  );
}
