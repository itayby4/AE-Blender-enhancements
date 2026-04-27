import { TOOL_NAME_TOKENS } from '@pipefx/brain-contracts';
import type { TodoItem } from '@pipefx/brain-contracts';
import type { LocalToolRegistry } from '../local-tool-registry.js';
import { brainTasksLog } from '../../log.js';
import { TODO_WRITE_DESCRIPTION, TODO_WRITE_INPUT_SCHEMA } from './todo-write-prompts.js';
import type { AgentSessionStore } from '../session-store.js';

export interface TodoWriteDeps {
  sessions: AgentSessionStore;
  getSessionId: () => string | undefined;
  onUpdate?: (sessionId: string, todos: TodoItem[]) => void;
}

export function registerTodoWrite(registry: LocalToolRegistry, deps: TodoWriteDeps): void {
  brainTasksLog.info('register tool', { tool: TOOL_NAME_TOKENS.TODO_WRITE });
  registry.registerLocalTool(
    TOOL_NAME_TOKENS.TODO_WRITE,
    TODO_WRITE_DESCRIPTION,
    TODO_WRITE_INPUT_SCHEMA as unknown as Record<string, unknown>,
    async (args) => {
      const sessionId = deps.getSessionId();
      if (!sessionId) {
        brainTasksLog.warn('TodoWrite rejected', { reason: 'no-session' });
        return 'No active session — cannot update todos.';
      }
      const incoming = (args as { todos?: TodoItem[] }).todos;
      if (!Array.isArray(incoming)) {
        brainTasksLog.warn('TodoWrite rejected', { sessionId, reason: 'non-array' });
        return 'Invalid arguments — `todos` must be an array.';
      }

      const inProgress = incoming.filter((t) => t.status === 'in_progress');
      if (inProgress.length > 1) {
        brainTasksLog.warn('TodoWrite rejected', {
          sessionId,
          reason: 'multi-in-progress',
          count: inProgress.length,
        });
        return `Rejected: more than one todo is in_progress (${inProgress.length}). Exactly one item must be in_progress at a time.`;
      }

      const state = deps.sessions.get(sessionId);
      state.todos = incoming;
      deps.onUpdate?.(sessionId, incoming);

      brainTasksLog.info('TodoWrite applied', {
        sessionId,
        total: incoming.length,
        pending: incoming.filter((t) => t.status === 'pending').length,
        inProgress: inProgress.length,
        completed: incoming.filter((t) => t.status === 'completed').length,
        active: inProgress[0]?.activeForm,
      });

      const summary = incoming
        .map(
          (t, i) =>
            `  ${i + 1}. [${t.status}] ${
              t.status === 'in_progress' ? t.activeForm : t.content
            }`
        )
        .join('\n');
      return `Todo list updated (${incoming.length} items):\n${summary}`;
    }
  );
}
