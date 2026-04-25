// ── @pipefx/skills/ui — useSkills ────────────────────────────────────────
// Loads the installed skill list from the backend's `/api/skills` REST
// surface and exposes install/uninstall mutators that round-trip through
// the same endpoints. The store of truth lives server-side (in
// `@pipefx/skills/backend`); this hook is a thin React adapter so views
// can re-render when an install lands.

import { useCallback, useEffect, useState } from 'react';
import type {
  InstallOptions,
  SkillId,
  SkillManifest,
} from '../../contracts/index.js';
import type { InstalledSkill } from '../../contracts/index.js';

const DEFAULT_API_BASE = 'http://localhost:3001';

export interface UseSkillsDeps {
  apiBase?: string;
}

export interface UseSkillsResult {
  skills: InstalledSkill[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  install: (
    manifest: SkillManifest,
    extras?: {
      signature?: string;
      publicKey?: string;
      source?: InstallOptions['source'];
    }
  ) => Promise<InstalledSkill>;
  uninstall: (id: SkillId) => Promise<boolean>;
}

export function useSkills(deps: UseSkillsDeps = {}): UseSkillsResult {
  const apiBase = deps.apiBase ?? DEFAULT_API_BASE;
  const [skills, setSkills] = useState<InstalledSkill[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/api/skills`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as InstalledSkill[];
      setSkills(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [apiBase]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const install = useCallback<UseSkillsResult['install']>(
    async (manifest, extras) => {
      const res = await fetch(`${apiBase}/api/skills/install`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ manifest, ...extras }),
      });
      const body = await res.json();
      if (!res.ok) {
        throw new Error(body?.message ?? `install failed: HTTP ${res.status}`);
      }
      const installed = body as InstalledSkill;
      setSkills((prev) => {
        const without = prev.filter((s) => s.manifest.id !== installed.manifest.id);
        return [...without, installed];
      });
      return installed;
    },
    [apiBase]
  );

  const uninstall = useCallback<UseSkillsResult['uninstall']>(
    async (id) => {
      const res = await fetch(`${apiBase}/api/skills/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      if (res.status === 404) return false;
      if (!res.ok) throw new Error(`uninstall failed: HTTP ${res.status}`);
      setSkills((prev) => prev.filter((s) => s.manifest.id !== id));
      return true;
    },
    [apiBase]
  );

  return { skills, loading, error, refresh, install, uninstall };
}
