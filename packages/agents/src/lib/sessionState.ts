/**
 * Per-session agent state: todo list, plan-mode flag, running task registry.
 *
 * Deliberately NOT persisted to SQLite. Todos are a sidecar snapshot that
 * the model sees as a fresh list each turn; persisting them would survive
 * process restart but gain nothing, and embedding in message history would
 * be destroyed by compaction.
 */

import { AGENT_SESSION_IDLE_TTL_MS } from './constants.js';
import type { TaskRecord } from './Task.js';

export type TodoStatus = 'pending' | 'in_progress' | 'completed';

export interface TodoItem {
  /** Imperative form, e.g. "Add marker at 00:01:00". */
  content: string;
  /** Present-continuous form shown during execution, e.g. "Adding marker at 00:01:00". */
  activeForm: string;
  status: TodoStatus;
}

export interface PlanModeState {
  active: boolean;
  /** The plan text the model emitted via EnterPlanMode. */
  plan?: string;
  /** true once the user has signed off. */
  approved?: boolean;
  /** Optional feedback message from the user on rejection. */
  feedback?: string;
}

export interface AgentSessionState {
  sessionId: string;
  todos: TodoItem[];
  planMode: PlanModeState;
  tasks: Map<string, TaskRecord>;
  lastUpdated: number;
}

function freshState(sessionId: string): AgentSessionState {
  return {
    sessionId,
    todos: [],
    planMode: { active: false },
    tasks: new Map(),
    lastUpdated: Date.now(),
  };
}

export interface AgentSessionStoreOptions {
  idleTimeoutMs?: number;
}

export class AgentSessionStore {
  private map = new Map<string, AgentSessionState>();
  private idleTimeoutMs: number;

  constructor(opts: AgentSessionStoreOptions = {}) {
    this.idleTimeoutMs = opts.idleTimeoutMs ?? AGENT_SESSION_IDLE_TTL_MS;
  }

  /** Get (or create) state for a session. Bumps lastUpdated. */
  get(sessionId: string): AgentSessionState {
    this.evictIdle();
    let state = this.map.get(sessionId);
    if (!state) {
      state = freshState(sessionId);
      this.map.set(sessionId, state);
    }
    state.lastUpdated = Date.now();
    return state;
  }

  /** True if the session has state (without creating one). */
  has(sessionId: string): boolean {
    return this.map.has(sessionId);
  }

  delete(sessionId: string): void {
    this.map.delete(sessionId);
  }

  /** Drop any session untouched past the idle window. */
  evictIdle(now: number = Date.now()): void {
    for (const [id, state] of this.map) {
      if (now - state.lastUpdated > this.idleTimeoutMs) {
        this.map.delete(id);
      }
    }
  }

  /** For tests/debug. */
  size(): number {
    return this.map.size;
  }
}
