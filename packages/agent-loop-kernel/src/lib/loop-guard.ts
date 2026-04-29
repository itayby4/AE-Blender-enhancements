/**
 * Per-chat() loop guard — detects same-tool/same-args calls firing in a tight
 * loop and either nudges the model (system-reminder) or aborts the turn cleanly.
 *
 * The kernel's MAX_TOOL_ROUNDS is a coarse last-resort cap. This guard catches
 * the much more common failure mode: a model ping-ponging the same call with
 * the same arguments and getting the same result over and over. Observed with
 * GPT-5.4 around bridge-health / EnterPlanMode / TodoWrite.
 */

export interface LoopGuardConfig {
  /** Emit a reminder once a (tool, args) pair has fired this many times. */
  warnAt: number;
  /** Abort the turn once a (tool, args) pair has fired this many times. */
  abortAt: number;
}

export const DEFAULT_LOOP_GUARD_CONFIG: LoopGuardConfig = {
  warnAt: 3,
  abortAt: 5,
};

export interface LoopGuardOutcome {
  /** Reminder text to inject as <system-reminder>, or null. */
  reminder: string | null;
  /**
   * Tool that tripped the abort threshold this round, if any. The kernel
   * should stop the turn immediately when this is non-null.
   */
  abortedOn: { name: string; count: number } | null;
}

export interface LoopGuard {
  /** Record a round's tool calls and return the resulting outcome. */
  observe(round: {
    toolCalls: { name: string; args: Record<string, unknown> }[];
  }): LoopGuardOutcome;
}

/**
 * Canonical JSON for an args object — keys sorted so `{a:1,b:2}` and
 * `{b:2,a:1}` produce the same key. Falls back to `String(args)` if the value
 * isn't serializable (e.g., contains a cycle).
 */
function canonicalArgs(args: Record<string, unknown>): string {
  try {
    const sortedKeys = Object.keys(args).sort();
    const sorted: Record<string, unknown> = {};
    for (const k of sortedKeys) sorted[k] = args[k];
    return JSON.stringify(sorted);
  } catch {
    return String(args);
  }
}

export function createLoopGuard(
  config: LoopGuardConfig = DEFAULT_LOOP_GUARD_CONFIG
): LoopGuard {
  const counts = new Map<string, number>();

  return {
    observe({ toolCalls }) {
      let warnFor: { name: string; count: number } | null = null;
      let abortedOn: { name: string; count: number } | null = null;

      for (const call of toolCalls) {
        const key = `${call.name}::${canonicalArgs(call.args)}`;
        const next = (counts.get(key) ?? 0) + 1;
        counts.set(key, next);

        if (next >= config.abortAt) {
          abortedOn = { name: call.name, count: next };
          break;
        }
        if (next >= config.warnAt) {
          if (!warnFor || next > warnFor.count) {
            warnFor = { name: call.name, count: next };
          }
        }
      }

      if (abortedOn) {
        return { reminder: null, abortedOn };
      }
      if (warnFor) {
        return {
          reminder:
            `You have called ${warnFor.name} with the same arguments ${warnFor.count} times. ` +
            `The result has not changed. Stop repeating this call — either change the arguments, ` +
            `try a different tool, or finalize your answer with the information you already have.`,
          abortedOn: null,
        };
      }
      return { reminder: null, abortedOn: null };
    },
  };
}
