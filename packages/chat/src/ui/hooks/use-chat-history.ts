// ── @pipefx/chat/ui — useChatHistory ─────────────────────────────────────
// Session list + transcript loader backed by the backend's `/api/sessions`
// REST endpoints. Replaces the previous localStorage-backed implementation:
// sessions now live in SQLite (owned by `@pipefx/brain-memory`), so all
// mounts of the desktop app see the same history.

import { useCallback, useEffect, useRef, useState } from 'react';
import { getAccessToken } from '@pipefx/auth/ui';
import type {
  ChatMessage,
  ChatSession,
  TranscriptMessage,
} from '../../contracts/types.js';

const DEFAULT_API_BASE = 'http://localhost:3001';

export interface UseChatHistoryDeps {
  activeProjectId: string;
  apiBase?: string;
}

export interface UseChatHistoryResult {
  sessions: ChatSession[];
  activeSessionId: string | null;
  setActiveSessionId: (id: string | null) => void;
  /** Fetches messages for `id` from the backend and returns them as
   *  TranscriptMessages ready to hand to `useChat.setMessages`. Also sets
   *  `activeSessionId`. Returns `[]` on any error. */
  loadSession: (id: string) => Promise<TranscriptMessage[]>;
  deleteSession: (id: string) => Promise<void>;
  /** Mints a fresh client-side session id and marks it active. The backend
   *  creates the corresponding row lazily on the first chat message. */
  newSession: () => string;
  /** Re-fetches the session list from the backend. Call after a turn
   *  completes to pick up the freshly-created session. */
  refreshSessions: () => Promise<void>;
}

async function authHeaders(): Promise<Record<string, string>> {
  const token = await getAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function useChatHistory(
  deps: UseChatHistoryDeps | string
): UseChatHistoryResult {
  // Backwards-compatible call shape: `useChatHistory(activeProjectId)`.
  const normalized: UseChatHistoryDeps =
    typeof deps === 'string' ? { activeProjectId: deps } : deps;
  const { activeProjectId } = normalized;
  const apiBase = normalized.apiBase ?? DEFAULT_API_BASE;

  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  // Stable ref to the latest projectId, so `refreshSessions` doesn't
  // change identity every render.
  const projectIdRef = useRef(activeProjectId);
  projectIdRef.current = activeProjectId;

  const refreshSessions = useCallback(async () => {
    const projectId = projectIdRef.current;
    const qs = new URLSearchParams();
    if (projectId) qs.set('projectId', projectId);
    qs.set('limit', '30');
    try {
      const headers = await authHeaders();
      const res = await fetch(`${apiBase}/api/sessions?${qs.toString()}`, {
        headers,
      });
      if (res.ok) {
        const data = (await res.json()) as ChatSession[];
        setSessions(data);
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Failed to fetch sessions:', err);
    }
  }, [apiBase]);

  // Refresh when the project changes, and reset the active session so the
  // UI lands on the hero state for the newly-selected project.
  useEffect(() => {
    setActiveSessionId(null);
    void refreshSessions();
  }, [activeProjectId, refreshSessions]);

  const loadSession = useCallback(
    async (id: string): Promise<TranscriptMessage[]> => {
      try {
        const headers = await authHeaders();
        const res = await fetch(`${apiBase}/api/sessions/${id}/messages`, {
          headers,
        });
        if (!res.ok) return [];
        const rows = (await res.json()) as ChatMessage[];
        setActiveSessionId(id);
        return rows.map((m) => ({
          id: String(m.id),
          role: m.role,
          text: m.content,
        }));
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('Failed to load session messages:', err);
        return [];
      }
    },
    [apiBase]
  );

  const deleteSession = useCallback(
    async (id: string) => {
      try {
        const headers = await authHeaders();
        await fetch(`${apiBase}/api/sessions/${id}`, {
          method: 'DELETE',
          headers,
        });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('Failed to delete session:', err);
      }
      setSessions((prev) => prev.filter((s) => s.id !== id));
      setActiveSessionId((prev) => (prev === id ? null : prev));
    },
    [apiBase]
  );

  const newSession = useCallback((): string => {
    const id = `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setActiveSessionId(id);
    return id;
  }, []);

  return {
    sessions,
    activeSessionId,
    setActiveSessionId,
    loadSession,
    deleteSession,
    newSession,
    refreshSessions,
  };
}
