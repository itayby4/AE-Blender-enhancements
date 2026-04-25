// ── @pipefx/skills/backend — in-memory SkillRunStore ─────────────────────
// Lifecycle records for skill executions. Mirrors the pattern used by the
// brain-tasks task store: in-memory ring buffer keyed by skillId, capped so
// long sessions don't unbounded-grow. Persistence to disk is intentionally
// out of scope for v1 — run history rebuilds on backend restart, which
// matches user expectation since the linked chat session also resets.
//
// The runner calls `start` / `finish` / `fail` synchronously; the routes
// expose `list` for the desktop UI's recent-runs panel.

import type { SkillRunStore } from '../../contracts/api.js';
import type {
  SkillId,
  SkillRunRecord,
  SkillRunRequest,
} from '../../contracts/types.js';

// ── Public types ─────────────────────────────────────────────────────────

export interface SkillRunStoreOptions {
  /** Maximum number of records retained globally. Oldest evicted first. */
  capacity?: number;
  /** Wall-clock source — pluggable so tests can pin timestamps. */
  now?: () => number;
  /** ID minter — pluggable so tests get deterministic ids. */
  generateId?: () => string;
}

const DEFAULT_CAPACITY = 500;

// ── Factory ──────────────────────────────────────────────────────────────

export function createSkillRunStore(
  opts: SkillRunStoreOptions = {}
): SkillRunStore {
  const capacity = opts.capacity ?? DEFAULT_CAPACITY;
  const now = opts.now ?? Date.now;
  const generateId = opts.generateId ?? defaultIdGenerator();

  // Insertion-ordered map; the runtime guarantees iteration order, which
  // is enough for the FIFO eviction we want without dragging in a separate
  // ring-buffer abstraction.
  const records = new Map<string, SkillRunRecord>();

  function evictIfNeeded(): void {
    while (records.size > capacity) {
      const oldest = records.keys().next().value;
      if (oldest === undefined) return;
      records.delete(oldest);
    }
  }

  function mustGet(runId: string): SkillRunRecord {
    const record = records.get(runId);
    if (!record) {
      throw new Error(`skill run "${runId}" not found`);
    }
    return record;
  }

  return {
    start(req: SkillRunRequest, sessionId: string | null): SkillRunRecord {
      const id = generateId();
      const record: SkillRunRecord = {
        id,
        skillId: req.skillId,
        sessionId,
        status: 'running',
        startedAt: now(),
      };
      records.set(id, record);
      evictIfNeeded();
      return record;
    },
    finish(runId): SkillRunRecord {
      const existing = mustGet(runId);
      const updated: SkillRunRecord = {
        ...existing,
        status: 'succeeded',
        finishedAt: now(),
      };
      records.set(runId, updated);
      return updated;
    },
    fail(runId, error): SkillRunRecord {
      const existing = mustGet(runId);
      const updated: SkillRunRecord = {
        ...existing,
        status: 'failed',
        finishedAt: now(),
        error,
      };
      records.set(runId, updated);
      return updated;
    },
    list(skillId?: SkillId, limit = 50): SkillRunRecord[] {
      const all = [...records.values()];
      const filtered = skillId
        ? all.filter((record) => record.skillId === skillId)
        : all;
      // Newest first — the UI wants "recent runs" not chronological.
      filtered.reverse();
      return filtered.slice(0, limit);
    },
  };
}

// Default id generator — collision-resistant enough for in-process use,
// no need to pull in `node:crypto` for run identifiers the backend is the
// sole producer of.
function defaultIdGenerator(): () => string {
  let counter = 0;
  return () => {
    counter += 1;
    const stamp = Date.now().toString(36);
    const rand = Math.random().toString(36).slice(2, 8);
    return `run-${stamp}-${counter.toString(36)}-${rand}`;
  };
}
