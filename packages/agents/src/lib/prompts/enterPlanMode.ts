import { TOOL_NAME_TOKENS } from '../constants.js';

/**
 * EnterPlanMode — system-prompt teaching block.
 *
 * Structure mirrors OpenClaude's EnterPlanModeTool/prompt.ts (when to enter,
 * when to skip, user-approval requirement, behavior while active). Prose is
 * rewritten for PipeFX's domain. See ../../PROMPT_SOURCES.md.
 */
export const ENTER_PLAN_MODE_PROMPT = `Use ${TOOL_NAME_TOKENS.ENTER_PLAN_MODE} before kicking off a non-trivial mission where the user benefits from signing off on your approach. Plan-gating prevents wasted work when there's more than one reasonable direction.

## When to enter plan mode

1. The request involves a new, multi-step edit whose structure isn't obvious from the prompt.
2. There are multiple plausible ways to satisfy the request and the user has a stake in which one you pick.
3. The mission will touch content that's expensive or painful to undo (destructive timeline ops, overwriting renders, deleting comps).
4. The mission spans several connectors or several tools across one connector and the order matters.
5. Understanding the current project state requires exploration first — the plan follows the exploration.
6. The user's preferences likely influence creative direction (look, pacing, structure).

## When to skip plan mode

- Small, well-defined actions ("add one marker", "rename this clip", "what's the frame rate").
- Requests where the user already specified the exact steps.
- Pure questions or read-only reports.

## Approval is required

This tool requires the user to approve the plan before you continue working. While plan mode is active you may inspect the project (read-only tool calls are fine) but you must not perform destructive operations. Wait for the approval signal before executing the plan.

If the user rejects or requests changes, revise the plan and call ${TOOL_NAME_TOKENS.ENTER_PLAN_MODE} again with the revised version, or exit via ${TOOL_NAME_TOKENS.EXIT_PLAN_MODE} if they've cancelled.

## What a good plan contains

- A brief statement of the goal in the user's words.
- Ordered steps, each naming the concrete connector action or tool it maps to.
- Any assumptions you're making (frame rate, timeline choice, export preset).
- What "done" looks like — the verification step.
- Known risks or destructive operations, called out explicitly.`;

export const ENTER_PLAN_MODE_DESCRIPTION =
  'Propose a plan for a non-trivial mission and pause for user approval before executing. Required for multi-step or destructive edits. The user MUST approve before work continues.';

export const ENTER_PLAN_MODE_INPUT_SCHEMA = {
  type: 'object',
  properties: {
    plan: {
      type: 'string',
      description:
        'The full plan text — goal, ordered steps, assumptions, verification, risks. Markdown is fine.',
    },
  },
  required: ['plan'],
} as const;
