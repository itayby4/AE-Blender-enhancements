// ── @pipefx/skills/ui — useSkillRun ──────────────────────────────────────
// Thin imperative handle over `POST /api/skills/:id/run`. The route is
// blocking — the response IS the final SkillRunRecord. Streaming output
// (script-mode line tail, prompt-mode token deltas) lands in a later
// sub-phase via SSE; for now the dialog renders the record's final state.

import { useCallback, useState } from 'react';

import type {
  SkillRunRecord,
  SkillRunRequest,
} from '../../contracts/api.js';
import type { SkillId } from '../../contracts/skill-md.js';

export interface UseSkillRunOptions {
  baseUrl?: string;
  /** Optional Bearer-token getter. When provided each request adds an
   *  `Authorization: Bearer <token>` header. Returning null skips the
   *  header — used so the package stays auth-agnostic and consumers
   *  inject `getAccessToken` from their own auth layer. */
  getToken?: () => Promise<string | null>;
}

export interface UseSkillRunResult {
  running: boolean;
  record: SkillRunRecord | null;
  error: string | null;
  run: (
    skillId: SkillId,
    inputs: SkillRunRequest['inputs'],
    sessionId?: string
  ) => Promise<SkillRunRecord | null>;
  reset: () => void;
}

export function useSkillRun(opts: UseSkillRunOptions = {}): UseSkillRunResult {
  const baseUrl = opts.baseUrl ?? 'http://localhost:3001';
  const { getToken } = opts;
  const [running, setRunning] = useState(false);
  const [record, setRecord] = useState<SkillRunRecord | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async (
      skillId: SkillId,
      inputs: SkillRunRequest['inputs'],
      sessionId?: string
    ): Promise<SkillRunRecord | null> => {
      setRunning(true);
      setError(null);
      setRecord(null);
      try {
        const token = getToken ? await getToken() : null;
        const res = await fetch(
          `${baseUrl}/api/skills/${encodeURIComponent(skillId)}/run`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({ inputs, sessionId }),
          }
        );
        const body = await res.json().catch(() => null);
        if (!res.ok) {
          const message =
            (body && typeof body === 'object' && 'error' in body
              ? String((body as { error?: unknown }).error)
              : null) ?? `run failed (${res.status})`;
          setError(message);
          return null;
        }
        const next = body as SkillRunRecord;
        setRecord(next);
        return next;
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        return null;
      } finally {
        setRunning(false);
      }
    },
    [baseUrl, getToken]
  );

  const reset = useCallback(() => {
    setRunning(false);
    setRecord(null);
    setError(null);
  }, []);

  return { running, record, error, run, reset };
}
