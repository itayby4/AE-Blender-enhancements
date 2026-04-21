/**
 * Per-task transcript store.
 *
 * Keeps the full user/assistant exchange for each worker task so that:
 *  - `resumeAgent` can feed the prior conversation back into a new `chat()`
 *    call with a follow-up user message.
 *  - `forkSubagent` can seed a new worker with a parent's accumulated history.
 *
 * Lives in memory only; evicted when the owning session is cleared or the
 * backend restarts. Worker final text is also mirrored to the on-disk
 * TaskOutputStore, which remains the canonical output reference for the
 * parent agent.
 */

export interface TranscriptEntry {
  role: 'user' | 'assistant';
  text: string;
}

/**
 * History shape expected by `@pipefx/ai`'s `ChatOptions.history` (frontend
 * format: `{ role, parts: [{ text }] }`).
 */
export interface ChatHistoryEntry {
  role: 'user' | 'model';
  parts: { text: string }[];
}

export interface TaskTranscriptStore {
  /** Create a new transcript seeded with the initial user prompt. */
  start(taskId: string, firstPrompt: string, seed?: TranscriptEntry[]): void;
  /** Append a fresh user message (e.g. a TaskUpdate follow-up). */
  appendUser(taskId: string, text: string): void;
  /** Append the assistant's final reply after a chat() call. */
  appendAssistant(taskId: string, text: string): void;
  /** Raw entries in-order. */
  entries(taskId: string): TranscriptEntry[];
  /** Convert to the history shape `@pipefx/ai` expects. */
  toChatHistory(taskId: string): ChatHistoryEntry[];
  /** Drop all data for a task (on TaskStop / session delete). */
  delete(taskId: string): void;
  /** Drop everything. */
  clear(): void;
}

export function createTaskTranscriptStore(): TaskTranscriptStore {
  const map = new Map<string, TranscriptEntry[]>();

  return {
    start(taskId, firstPrompt, seed) {
      const entries: TranscriptEntry[] = seed ? [...seed] : [];
      entries.push({ role: 'user', text: firstPrompt });
      map.set(taskId, entries);
    },
    appendUser(taskId, text) {
      const entries = map.get(taskId);
      if (!entries) return;
      entries.push({ role: 'user', text });
    },
    appendAssistant(taskId, text) {
      const entries = map.get(taskId);
      if (!entries) return;
      entries.push({ role: 'assistant', text });
    },
    entries(taskId) {
      return map.get(taskId) ?? [];
    },
    toChatHistory(taskId) {
      const entries = map.get(taskId) ?? [];
      // `@pipefx/ai` maps 'model' → 'assistant' when normalising, so emit the
      // frontend-style `model` role for assistant entries.
      return entries.map((e) => ({
        role: (e.role === 'assistant' ? 'model' : 'user') as 'user' | 'model',
        parts: [{ text: e.text }],
      }));
    },
    delete(taskId) {
      map.delete(taskId);
    },
    clear() {
      map.clear();
    },
  };
}
