// ── Pinned skills (12.10.5) ──────────────────────────────────────────────
// Tracks which v2 SKILL.md skills the user has pinned to the nav-rail.
// Persisted in localStorage so the choice survives reloads. Component-mode
// only — inline (prompt/script) skills don't have a permanent surface.

import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'pipefx.pinned-skills';

function readStorage(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === 'string');
  } catch {
    return [];
  }
}

function writeStorage(ids: ReadonlyArray<string>): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
}

export function usePinnedSkills(): {
  pinned: ReadonlyArray<string>;
  toggle: (id: string) => void;
  isPinned: (id: string) => boolean;
} {
  const [pinned, setPinned] = useState<ReadonlyArray<string>>(() => readStorage());

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setPinned(readStorage());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const toggle = useCallback((id: string) => {
    setPinned((prev) => {
      const next = prev.includes(id)
        ? prev.filter((x) => x !== id)
        : [...prev, id];
      writeStorage(next);
      return next;
    });
  }, []);

  const isPinned = useCallback((id: string) => pinned.includes(id), [pinned]);

  return { pinned, toggle, isPinned };
}
