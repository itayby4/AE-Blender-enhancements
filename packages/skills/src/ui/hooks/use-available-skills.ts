// ── @pipefx/skills/ui — useAvailableSkills ───────────────────────────────
// Polls `/api/skills/availability` for the capability-matcher's current
// snapshot. We poll instead of subscribing because the streaming bridge
// (skills.available-changed → SSE) hasn't been wired yet — the matcher
// itself is event-driven server-side, so the snapshot is always fresh and
// a coarse poll is enough to keep the library lit/greyed accurately.

import { useEffect, useMemo, useState } from 'react';
import type { SkillAvailability, SkillId } from '../../contracts/index.js';

const DEFAULT_API_BASE = 'http://localhost:3001';
const DEFAULT_POLL_MS = 5_000;

export interface UseAvailableSkillsDeps {
  apiBase?: string;
  /** Set to 0 to disable polling (one-shot fetch). */
  pollMs?: number;
}

export interface UseAvailableSkillsResult {
  availability: ReadonlyArray<SkillAvailability>;
  /** Map keyed by skillId for O(1) lookup from card components. */
  byId: ReadonlyMap<SkillId, SkillAvailability>;
  loading: boolean;
  error: string | null;
}

export function useAvailableSkills(
  deps: UseAvailableSkillsDeps = {}
): UseAvailableSkillsResult {
  const apiBase = deps.apiBase ?? DEFAULT_API_BASE;
  const pollMs = deps.pollMs ?? DEFAULT_POLL_MS;

  const [availability, setAvailability] = useState<
    ReadonlyArray<SkillAvailability>
  >([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fetchOnce = async () => {
      setLoading(true);
      try {
        const res = await fetch(`${apiBase}/api/skills/availability`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as SkillAvailability[];
        if (!cancelled) {
          setAvailability(data);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void fetchOnce();
    if (pollMs <= 0) return () => undefined;
    const handle = setInterval(fetchOnce, pollMs);
    return () => {
      cancelled = true;
      clearInterval(handle);
    };
  }, [apiBase, pollMs]);

  const byId = useMemo(() => {
    const map = new Map<SkillId, SkillAvailability>();
    for (const row of availability) map.set(row.skillId, row);
    return map;
  }, [availability]);

  return { availability, byId, loading, error };
}
