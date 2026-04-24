import { useState, useEffect, useCallback } from 'react';
import type { ChatMessage } from './useChat.js';

// ─────────────────────────────────────────────────────────
// Chat History — localStorage-based session persistence.
//
// One "session" = a titled conversation thread.
// Sessions are keyed by projectId so each project has
// its own independent history. "no-project" is the key
// when no project is selected.
// ─────────────────────────────────────────────────────────

export interface ChatSession {
  id: string;
  projectId: string;
  title: string;          // derived from first user message
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
}

const STORAGE_KEY = 'pipefx:chat-history';
const MAX_SESSIONS_PER_PROJECT = 20;

function loadAllSessions(): ChatSession[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveAllSessions(sessions: ChatSession[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  } catch {
    // Storage quota exceeded — silently ignore
  }
}

function deriveTitle(messages: ChatMessage[]): string {
  const firstUser = messages.find((m) => m.sender === 'user');
  if (!firstUser) return 'New Chat';
  const text = firstUser.text.trim();
  return text.length > 48 ? text.substring(0, 48) + '…' : text;
}

function projectKey(projectId: string): string {
  return projectId || 'no-project';
}

export function useChatHistory(activeProjectId: string) {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  // Load sessions for this project on mount / project change
  useEffect(() => {
    const all = loadAllSessions();
    const key = projectKey(activeProjectId);
    const projectSessions = all
      .filter((s) => s.projectId === key)
      .sort((a, b) => b.updatedAt - a.updatedAt);
    setSessions(projectSessions);
    // Don't auto-select — start with empty (hero state)
    setActiveSessionId(null);
  }, [activeProjectId]);

  /** Save/update the current session whenever messages change. */
  const saveSession = useCallback(
    (sessionId: string, messages: ChatMessage[]) => {
      if (messages.length === 0) return;

      const all = loadAllSessions();
      const key = projectKey(activeProjectId);
      const idx = all.findIndex((s) => s.id === sessionId);
      const now = Date.now();

      if (idx >= 0) {
        all[idx] = {
          ...all[idx],
          messages,
          title: deriveTitle(messages),
          updatedAt: now,
        };
      } else {
        // Insert new session
        all.unshift({
          id: sessionId,
          projectId: key,
          title: deriveTitle(messages),
          createdAt: now,
          updatedAt: now,
          messages,
        });
      }

      // Trim old sessions per project
      const projectSessions = all.filter((s) => s.projectId === key);
      if (projectSessions.length > MAX_SESSIONS_PER_PROJECT) {
        const keep = projectSessions
          .sort((a, b) => b.updatedAt - a.updatedAt)
          .slice(0, MAX_SESSIONS_PER_PROJECT)
          .map((s) => s.id);
        const trimmed = all.filter(
          (s) => s.projectId !== key || keep.includes(s.id)
        );
        saveAllSessions(trimmed);
        setSessions(trimmed.filter((s) => s.projectId === key).sort((a, b) => b.updatedAt - a.updatedAt));
      } else {
        saveAllSessions(all);
        setSessions(all.filter((s) => s.projectId === key).sort((a, b) => b.updatedAt - a.updatedAt));
      }
    },
    [activeProjectId]
  );

  /** Load a session and return its messages. */
  const loadSession = useCallback(
    (sessionId: string): ChatMessage[] => {
      const all = loadAllSessions();
      const session = all.find((s) => s.id === sessionId);
      if (!session) return [];
      setActiveSessionId(sessionId);
      return session.messages;
    },
    []
  );

  /** Delete a session. */
  const deleteSession = useCallback(
    (sessionId: string) => {
      const all = loadAllSessions().filter((s) => s.id !== sessionId);
      saveAllSessions(all);
      const key = projectKey(activeProjectId);
      setSessions(all.filter((s) => s.projectId === key).sort((a, b) => b.updatedAt - a.updatedAt));
      if (activeSessionId === sessionId) setActiveSessionId(null);
    },
    [activeProjectId, activeSessionId]
  );

  /** Start a brand new session (returns new session ID). */
  const newSession = useCallback((): string => {
    const id = `session-${Date.now()}`;
    setActiveSessionId(id);
    return id;
  }, []);

  return {
    sessions,
    activeSessionId,
    setActiveSessionId,
    saveSession,
    loadSession,
    deleteSession,
    newSession,
  };
}
