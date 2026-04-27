/**
 * Per-agent scratch memory.
 *
 * Small namespaced key/value store for sub-agents that need to carry small
 * facts between `resume` calls (e.g. a scout worker remembering the timeline
 * id it found on turn 1 so turn 2 doesn't re-discover it). Distinct from
 * `@pipefx/backend`'s long-term memory tools (`remember`/`recall`) which
 * target the top-level conversation; this one is agent-local and ephemeral.
 *
 * Namespace convention: `<sessionId>::<taskId>` for per-task memory, or any
 * caller-defined string for shared scopes.
 */

export interface AgentMemoryStore {
  remember(namespace: string, key: string, value: string): void;
  recall(namespace: string, key: string): string | undefined;
  forget(namespace: string, key: string): void;
  /** All key/value pairs for a namespace, as a plain object snapshot. */
  list(namespace: string): Record<string, string>;
  /** Drop an entire namespace. */
  deleteNamespace(namespace: string): void;
  /** Drop everything. */
  clear(): void;
}

export function createAgentMemoryStore(): AgentMemoryStore {
  const map = new Map<string, Map<string, string>>();

  function getNs(ns: string): Map<string, string> {
    let inner = map.get(ns);
    if (!inner) {
      inner = new Map();
      map.set(ns, inner);
    }
    return inner;
  }

  return {
    remember(namespace, key, value) {
      getNs(namespace).set(key, value);
    },
    recall(namespace, key) {
      return map.get(namespace)?.get(key);
    },
    forget(namespace, key) {
      map.get(namespace)?.delete(key);
    },
    list(namespace) {
      const inner = map.get(namespace);
      if (!inner) return {};
      const out: Record<string, string> = {};
      for (const [k, v] of inner) out[k] = v;
      return out;
    },
    deleteNamespace(namespace) {
      map.delete(namespace);
    },
    clear() {
      map.clear();
    },
  };
}

/** Convention for per-task namespaces used by the runtime. */
export function taskMemoryNamespace(sessionId: string, taskId: string): string {
  return `${sessionId}::${taskId}`;
}
