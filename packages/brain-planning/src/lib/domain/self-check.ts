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

/**
 * After this many rounds without a TodoWrite call, re-inject the active todo
 * list so the model can see its own plan again. Mirrors the cadence Claude
 * Code uses to nudge itself back on track.
 */
const TODO_REPIN_EVERY_ROUNDS = 3;

/**
 * If the model has fired this many connector tool calls and has never called
 * TodoWrite, push a hard plan-first reminder. Captures the failure mode where
 * the model dives straight into execution on a multi-step request.
 */
const PLAN_FIRST_TOOL_THRESHOLD = 4;

/**
 * Tool names that don't count toward "real work" for plan-first nudging.
 * Calling TodoWrite or entering plan mode is itself the plan, not execution.
 */
const NON_EXECUTION_TOOLS = new Set<string>([
  'TodoWrite',
  'EnterPlanMode',
  'ExitPlanMode',
  'TaskList',
  'TaskGet',
  'TaskOutput',
]);

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

  // ── Plan-first nudge (works even without a session) ──────────────────────
  // Count execution-tool calls across the recent window. If the model has
  // fired ≥ PLAN_FIRST_TOOL_THRESHOLD calls and has never called TodoWrite,
  // push a hard reminder that planning is the first move.
  const executionCalls = selfCheck.recentCalls.filter((c) => {
    const name = c.key.split('|', 1)[0];
    return !NON_EXECUTION_TOOLS.has(name);
  }).length;
  const hasEverWrittenTodos = (session?.todos.length ?? 0) > 0;
  if (
    !hasEverWrittenTodos &&
    executionCalls >= PLAN_FIRST_TOOL_THRESHOLD &&
    !ctx.toolNames.includes(TOOL_NAME_TOKENS.TODO_WRITE)
  ) {
    duplicateReminders.push(
      `You have already executed ${executionCalls} tool calls without writing a plan. ` +
        `If this request needs more than three steps, your next action MUST be ${TOOL_NAME_TOKENS.TODO_WRITE} ` +
        `to record the remaining work. Skip this only if the request is genuinely a single step.`
    );
  }

  if (!session) {
    return duplicateReminders.length > 0 ? duplicateReminders.join('\n\n') : null;
  }

  const reminders: string[] = [...duplicateReminders];
  const { todos, planMode } = session;

  // ── 1. Todo staleness nudge ───────────────────────────────────────────────
  if (selfCheck.roundsSinceLastTodoWrite >= TODO_REPIN_EVERY_ROUNDS && todos.length > 0) {
    const pending = todos.filter((t) => t.status !== 'completed');
    if (pending.length > 0) {
      // Re-pin the active todo list verbatim so the model can see its own plan
      // again — under long tool-result tails, the original TodoWrite drifts
      // out of the model's effective attention window.
      const pinnedList = todos
        .map((t) => {
          const mark =
            t.status === 'completed'
              ? '[x]'
              : t.status === 'in_progress'
              ? '[~]'
              : '[ ]';
          const label = t.status === 'in_progress' ? t.activeForm : t.content;
          return `  ${mark} ${label}`;
        })
        .join('\n');
      reminders.push(
        `You have ${pending.length} incomplete todo(s) and haven't called TodoWrite ` +
          `in ${selfCheck.roundsSinceLastTodoWrite} rounds. Current plan:\n\n${pinnedList}\n\n` +
          `Update via TodoWrite — mark the active item in_progress, anything finished as completed. ` +
          `Verify each completion against actual tool results before marking done.`
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
