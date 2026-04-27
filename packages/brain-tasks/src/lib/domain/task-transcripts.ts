import type { TranscriptEntry, ChatHistoryEntry } from '@pipefx/brain-contracts';

export interface TaskTranscriptStore {
  start(taskId: string, firstPrompt: string, seed?: TranscriptEntry[]): void;
  appendUser(taskId: string, text: string): void;
  appendAssistant(taskId: string, text: string): void;
  entries(taskId: string): TranscriptEntry[];
  toChatHistory(taskId: string): ChatHistoryEntry[];
  delete(taskId: string): void;
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
