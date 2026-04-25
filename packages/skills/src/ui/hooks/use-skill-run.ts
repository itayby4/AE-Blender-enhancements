// ── @pipefx/skills/ui — useSkillRun ──────────────────────────────────────
// Posts a `SkillRunRequest` to `/api/skills/:id/run`. The backend route
// returns the `SkillRunRecord` for both success and in-flight failure
// (status === 'failed') with HTTP 200 — only structural failures (missing
// skill, unmet capabilities, quota exhaustion) come back as non-2xx with
// a machine-readable `code`. We surface `code` so the host UI can branch
// (e.g. show a "connect DaVinci" CTA on `skill_unavailable`).

import { useCallback, useEffect, useState } from 'react';
import type {
  CapabilityRequirement,
  SkillId,
  SkillRunRecord,
  SkillRunRequest,
} from '../../contracts/index.js';

const DEFAULT_API_BASE = 'http://localhost:3001';

export type SkillRunErrorCode =
  | 'skill_not_found'
  | 'skill_unavailable'
  | 'skill_quota_exhausted'
  | 'http_error'
  | 'network_error';

export interface SkillRunError extends Error {
  code: SkillRunErrorCode;
  /** Populated when code === 'skill_unavailable'. */
  missing?: ReadonlyArray<CapabilityRequirement>;
}

function makeError(
  code: SkillRunErrorCode,
  message: string,
  extras?: Partial<SkillRunError>
): SkillRunError {
  const err = new Error(message) as SkillRunError;
  err.code = code;
  if (extras?.missing) err.missing = extras.missing;
  return err;
}

export interface UseSkillRunDeps {
  apiBase?: string;
}

export interface UseSkillRunResult {
  /** The most recent run record (success or in-flight failure). */
  lastRun: SkillRunRecord | null;
  recentRuns: SkillRunRecord[];
  pending: boolean;
  error: SkillRunError | null;
  /** Fires the run; resolves with the record on either outcome. Throws
   *  `SkillRunError` for non-2xx responses (404 / 409 / 402 / network). */
  run: (req: SkillRunRequest) => Promise<SkillRunRecord>;
  refreshRecent: (skillId?: SkillId, limit?: number) => Promise<void>;
}

export function useSkillRun(deps: UseSkillRunDeps = {}): UseSkillRunResult {
  const apiBase = deps.apiBase ?? DEFAULT_API_BASE;
  const [lastRun, setLastRun] = useState<SkillRunRecord | null>(null);
  const [recentRuns, setRecentRuns] = useState<SkillRunRecord[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<SkillRunError | null>(null);

  const refreshRecent = useCallback<UseSkillRunResult['refreshRecent']>(
    async (skillId, limit) => {
      const qs = new URLSearchParams();
      if (skillId) qs.set('skillId', skillId);
      if (limit != null) qs.set('limit', String(limit));
      const url = `${apiBase}/api/skills/runs${
        qs.toString() ? `?${qs.toString()}` : ''
      }`;
      try {
        const res = await fetch(url);
        if (!res.ok) return;
        const rows = (await res.json()) as SkillRunRecord[];
        setRecentRuns(rows);
      } catch {
        // Background refresh — surface only run() errors to the user.
      }
    },
    [apiBase]
  );

  useEffect(() => {
    void refreshRecent();
  }, [refreshRecent]);

  const run = useCallback<UseSkillRunResult['run']>(
    async (req) => {
      setPending(true);
      setError(null);
      try {
        const res = await fetch(
          `${apiBase}/api/skills/${encodeURIComponent(req.skillId)}/run`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              inputs: req.inputs,
              sessionId: req.sessionId,
            }),
          }
        );
        const body = await res.json().catch(() => null);

        if (!res.ok) {
          const code = (body?.code ?? 'http_error') as SkillRunErrorCode;
          const message = body?.message ?? `HTTP ${res.status}`;
          throw makeError(code, message, { missing: body?.missing });
        }

        const record = body as SkillRunRecord;
        setLastRun(record);
        setRecentRuns((prev) => [record, ...prev.filter((r) => r.id !== record.id)]);
        return record;
      } catch (err) {
        const e =
          err && (err as SkillRunError).code
            ? (err as SkillRunError)
            : makeError('network_error', (err as Error).message);
        setError(e);
        throw e;
      } finally {
        setPending(false);
      }
    },
    [apiBase]
  );

  return { lastRun, recentRuns, pending, error, run, refreshRecent };
}
