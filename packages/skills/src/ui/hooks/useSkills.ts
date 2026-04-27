// ── @pipefx/skills/ui — useSkills ────────────────────────────────────────
// Polls the backend for installed skills + capability availability. The
// matcher is event-driven server-side; the desktop refreshes on focus and
// at a coarse interval until a websocket / SSE seam lands.

import { useCallback, useEffect, useMemo, useState } from 'react';

import type {
  InstalledSkill,
  SkillAvailability,
} from '../../contracts/api.js';
import type { SkillId } from '../../contracts/skill-md.js';

const REFRESH_MS = 5_000;

export interface UseSkillsOptions {
  /** Backend base URL (default `http://localhost:3001`). */
  baseUrl?: string;
  /** Optional Bearer-token getter. When provided each request adds an
   *  `Authorization: Bearer <token>` header. Returning null skips the
   *  header — used so the package stays auth-agnostic and consumers
   *  inject `getAccessToken` from their own auth layer. */
  getToken?: () => Promise<string | null>;
}

export interface SkillWithAvailability {
  skill: InstalledSkill;
  availability: SkillAvailability | null;
}

export interface UseSkillsResult {
  loading: boolean;
  error: string | null;
  skills: ReadonlyArray<SkillWithAvailability>;
  refresh: () => void;
  uninstall: (id: SkillId) => Promise<void>;
}

export function useSkills(opts: UseSkillsOptions = {}): UseSkillsResult {
  const baseUrl = opts.baseUrl ?? 'http://localhost:3001';
  const { getToken } = opts;
  const [installed, setInstalled] = useState<ReadonlyArray<InstalledSkill>>([]);
  const [availability, setAvailability] = useState<
    ReadonlyArray<SkillAvailability>
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick((n) => n + 1), []);

  const authHeaders = useCallback(async (): Promise<HeadersInit> => {
    if (!getToken) return {};
    const token = await getToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, [getToken]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const headers = await authHeaders();
        const [skillsRes, availRes] = await Promise.all([
          fetch(`${baseUrl}/api/skills`, { headers }),
          fetch(`${baseUrl}/api/skills/availability`, { headers }),
        ]);
        if (!skillsRes.ok) throw new Error(`skills: ${skillsRes.status}`);
        if (!availRes.ok) throw new Error(`availability: ${availRes.status}`);
        const skills = (await skillsRes.json()) as InstalledSkill[];
        const avail = (await availRes.json()) as SkillAvailability[];
        if (cancelled) return;
        setInstalled(skills);
        setAvailability(avail);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [baseUrl, tick, authHeaders]);

  useEffect(() => {
    const id = window.setInterval(refresh, REFRESH_MS);
    const onFocus = () => refresh();
    window.addEventListener('focus', onFocus);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('focus', onFocus);
    };
  }, [refresh]);

  const uninstall = useCallback(
    async (id: SkillId) => {
      const headers = await authHeaders();
      const res = await fetch(`${baseUrl}/api/skills/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers,
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`uninstall failed (${res.status}): ${body}`);
      }
      refresh();
    },
    [baseUrl, refresh, authHeaders]
  );

  const skills = useMemo<ReadonlyArray<SkillWithAvailability>>(() => {
    const byId = new Map<SkillId, SkillAvailability>();
    for (const a of availability) byId.set(a.skillId, a);
    return installed.map((skill) => ({
      skill,
      availability: byId.get(skill.loaded.frontmatter.id) ?? null,
    }));
  }, [installed, availability]);

  return { loading, error, skills, refresh, uninstall };
}
