/**
 * Self-check reminder system.
 *
 * After each tool-call round, the agent harness asks this module for a
 * <system-reminder> string to append to the last tool result. The model sees
 * it in the very next prompt, nudging it back on track without touching the
 * system prompt or spending tokens on every turn.
 *
 * Mirrors the mechanism Claude Code uses (visible in its own tool-result
 * injections) but scoped to the PipeFX session state.
 */

import type {
  PostRoundReminderContext,
  PostRoundToolCall,
} from '@pipefx/agent-loop-kernel';
import type { AgentSessionState, SelfCheckState } from '@pipefx/brain-contracts';
import { TOOL_NAME_TOKENS } from '@pipefx/brain-contracts';

export type { SelfCheckState };

/** How many rounds of history to keep when detecting duplicate calls. */
const CALL_HISTORY_WINDOW = 8;

export function freshSelfCheckState(): SelfCheckState {
  return { roundsSinceLastTodoWrite: 0, recentCalls: [] };
}

/** Stable JSON — keys sorted so `{a,b}` and `{b,a}` match. */
function fingerprintArgs(args: Record<string, unknown>): string {
  const sort = (value: unknown): unknown => {
    if (value === null || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map(sort);
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a.localeCompare(b)
    );
    return Object.fromEntries(entries.map(([k, v]) => [k, sort(v)]));
  };
  try {
    return JSON.stringify(sort(args));
  } catch {
    return '<unserializable>';
  }
}

function callKey(call: PostRoundToolCall): string {
  return `${call.name}|${fingerprintArgs(call.args)}`;
}

/**
 * Build the reminder string for this round, or return null if nothing to say.
 *
 * Call once per round. Mutates `selfCheck` (updates the counter).
 */
export function buildPostRoundReminder(
  ctx: PostRoundReminderContext,
  selfCheck: SelfCheckState,
  session: AgentSessionState | null
): string | null {
  // Track TodoWrite usage.
  if (ctx.toolNames.includes(TOOL_NAME_TOKENS.TODO_WRITE)) {
    selfCheck.roundsSinceLastTodoWrite = 0;
  } else {
    selfCheck.roundsSinceLastTodoWrite++;
  }

  // ── 0. Duplicate-call detection ──────────────────────────────────────────
  const duplicateReminders: string[] = [];
  for (const call of ctx.toolCalls) {
    if (!call.isError) continue;
    const key = callKey(call);
    const priorErrors = selfCheck.recentCalls.filter((c) => c.key === key && c.isError);
    if (priorErrors.length >= 1) {
      const firstRound = priorErrors[0].round;
      const repeats = priorErrors.length + 1;
      duplicateReminders.push(
        `You called \`${call.name}\` with identical args ${repeats} times now ` +
          `(first seen in round ${firstRound}, latest in round ${ctx.roundNumber}) and got ` +
          `the same error each time. Stop retrying with the same arguments. Read the ` +
          `error message, then either (a) call an inspection tool to discover the missing ` +
          `parameter, or (b) tell the user exactly what information you need.`
      );
    }
  }
  for (const call of ctx.toolCalls) {
    selfCheck.recentCalls.push({
      round: ctx.roundNumber,
      key: callKey(call),
      isError: call.isError,
    });
  }
  if (selfCheck.recentCalls.length > CALL_HISTORY_WINDOW * 4) {
    selfCheck.recentCalls.splice(0, selfCheck.recentCalls.length - CALL_HISTORY_WINDOW * 4);
  }

  if (!session) {
    return duplicateReminders.length > 0 ? duplicateReminders.join('\n\n') : null;
  }

  const reminders: string[] = [...duplicateReminders];
  const { todos, planMode } = session;

  // ── 1. Todo staleness nudge ───────────────────────────────────────────────
  if (selfCheck.roundsSinceLastTodoWrite >= 3 && todos.length > 0) {
    const pending = todos.filter((t) => t.status !== 'completed');
    if (pending.length > 0) {
      reminders.push(
        `You have ${pending.length} incomplete todo(s) and haven't called TodoWrite ` +
          `in ${selfCheck.roundsSinceLastTodoWrite} rounds. ` +
          `Update your todo list to reflect current progress — ` +
          `mark the active item in_progress, completed items as completed.`
      );
    }
  }

  // ── 2. All-done nudge ────────────────────────────────────────────────────
  if (
    planMode.approved &&
    todos.length > 0 &&
    todos.every((t) => t.status === 'completed') &&
    !ctx.toolNames.includes(TOOL_NAME_TOKENS.EXIT_PLAN_MODE)
  ) {
    reminders.push(
      `All todos are marked completed. ` +
        `Call ${TOOL_NAME_TOKENS.EXIT_PLAN_MODE}(reason: "mission-complete") ` +
        `to close the plan and deliver a final summary to the user.`
    );
  }

  // ── 3. Plan-discipline reminder ──────────────────────────────────────────
  if (planMode.approved && ctx.toolNames.includes(TOOL_NAME_TOKENS.ENTER_PLAN_MODE)) {
    reminders.push(
      `Your plan is already approved. Do NOT call ${TOOL_NAME_TOKENS.ENTER_PLAN_MODE} again. ` +
        `Execute the approved plan using connector tools and track progress with ` +
        `${TOOL_NAME_TOKENS.TODO_WRITE}.`
    );
  }

  return reminders.length > 0 ? reminders.join('\n\n') : null;
}
