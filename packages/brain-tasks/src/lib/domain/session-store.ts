import { AGENT_SESSION_IDLE_TTL_MS } from '@pipefx/brain-contracts';
import type { AgentSessionState } from '@pipefx/brain-contracts';

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

  has(sessionId: string): boolean {
    return this.map.has(sessionId);
  }

  delete(sessionId: string): void {
    this.map.delete(sessionId);
  }

  evictIdle(now: number = Date.now()): void {
    for (const [id, state] of this.map) {
      if (now - state.lastUpdated > this.idleTimeoutMs) {
        this.map.delete(id);
      }
    }
  }

  size(): number {
    return this.map.size;
  }
}
