// ── @pipefx/skills/ui/authoring — useSkillSource ─────────────────────────
// Read + write the raw SKILL.md text for an installed skill. Backs the
// Monaco editor in `SkillEditor`. Keeps a local "dirty" flag so the UI
// can disable Save when the buffer matches the last-saved source.

import { useCallback, useEffect, useState } from 'react';

import type { SkillId } from '../../contracts/skill-md.js';

export interface UseSkillSourceOptions {
  baseUrl?: string;
  getToken?: () => Promise<string | null>;
}

export interface UseSkillSourceResult {
  loading: boolean;
  saving: boolean;
  error: string | null;
  /** Last source text loaded from / saved to disk. `null` while loading. */
  saved: string | null;
  /** Working buffer the editor binds to. */
  draft: string | null;
  setDraft: (next: string) => void;
  dirty: boolean;
  reload: () => void;
  save: () => Promise<boolean>;
}

export function useSkillSource(
  skillId: SkillId | null,
  opts: UseSkillSourceOptions = {}
): UseSkillSourceResult {
  const baseUrl = opts.baseUrl ?? 'http://localhost:3001';
  const { getToken } = opts;
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const reload = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    if (!skillId) {
      setSaved(null);
      setDraft(null);
      setError(null);
      setLoading(false);
      return undefined;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const headers: Record<string, string> = {};
        if (getToken) {
          const token = await getToken();
          if (token) headers.Authorization = `Bearer ${token}`;
        }
        const res = await fetch(
          `${baseUrl}/api/skills/source/${encodeURIComponent(skillId)}`,
          { headers }
        );
        if (!res.ok) {
          const text = await res.text().catch(() => '');
          throw new Error(`load failed (${res.status}): ${text}`);
        }
        const data = (await res.json()) as { source?: string };
        if (cancelled) return;
        const source = data.source ?? '';
        setSaved(source);
        setDraft(source);
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
  }, [skillId, baseUrl, getToken, tick]);

  const save = useCallback(async (): Promise<boolean> => {
    if (!skillId) return false;
    if (draft === null) return false;
    setSaving(true);
    setError(null);
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (getToken) {
        const token = await getToken();
        if (token) headers.Authorization = `Bearer ${token}`;
      }
      const res = await fetch(`${baseUrl}/api/skills/source`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ skillId, source: draft }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        let message = `save failed (${res.status})`;
        try {
          const parsed = text ? (JSON.parse(text) as { error?: string }) : null;
          if (parsed?.error) message = parsed.error;
        } catch {
          if (text) message += `: ${text}`;
        }
        throw new Error(message);
      }
      setSaved(draft);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return false;
    } finally {
      setSaving(false);
    }
  }, [baseUrl, draft, getToken, skillId]);

  const dirty = draft !== null && saved !== null && draft !== saved;

  return {
    loading,
    saving,
    error,
    saved,
    draft,
    setDraft,
    dirty,
    reload,
    save,
  };
}
