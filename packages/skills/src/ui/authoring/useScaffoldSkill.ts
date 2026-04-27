// ── @pipefx/skills/ui/authoring — useScaffoldSkill ───────────────────────
// Thin wrapper around `POST /api/skills/scaffold`. The dialog calls
// `scaffold(opts)` and gets back the freshly-installed `InstalledSkill`
// (or an error). The hook does not own dialog state; the host wires
// open/close around it.

import { useCallback, useState } from 'react';

import type { InstalledSkill } from '../../contracts/api.js';
import type { SkillScaffoldMode } from '../../domain/scaffold-templates.js';

export interface UseScaffoldSkillOptions {
  baseUrl?: string;
  getToken?: () => Promise<string | null>;
}

export interface ScaffoldRequest {
  id: string;
  name?: string;
  description?: string;
  category?: string;
  icon?: string;
  mode: SkillScaffoldMode;
}

export interface UseScaffoldSkillResult {
  scaffolding: boolean;
  error: string | null;
  scaffold: (req: ScaffoldRequest) => Promise<InstalledSkill | null>;
  reset: () => void;
}

export function useScaffoldSkill(
  opts: UseScaffoldSkillOptions = {}
): UseScaffoldSkillResult {
  const baseUrl = opts.baseUrl ?? 'http://localhost:3001';
  const { getToken } = opts;
  const [scaffolding, setScaffolding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scaffold = useCallback(
    async (req: ScaffoldRequest): Promise<InstalledSkill | null> => {
      setScaffolding(true);
      setError(null);
      try {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };
        if (getToken) {
          const token = await getToken();
          if (token) headers.Authorization = `Bearer ${token}`;
        }
        const res = await fetch(`${baseUrl}/api/skills/scaffold`, {
          method: 'POST',
          headers,
          body: JSON.stringify(req),
        });
        const text = await res.text();
        let parsed: unknown = null;
        try {
          parsed = text ? JSON.parse(text) : null;
        } catch {
          parsed = null;
        }
        if (!res.ok) {
          const message =
            (parsed as { error?: string } | null)?.error ??
            `scaffold failed (${res.status})`;
          setError(message);
          return null;
        }
        return parsed as InstalledSkill;
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        return null;
      } finally {
        setScaffolding(false);
      }
    },
    [baseUrl, getToken]
  );

  const reset = useCallback(() => setError(null), []);

  return { scaffolding, error, scaffold, reset };
}
