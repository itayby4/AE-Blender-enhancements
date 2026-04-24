import { TOOL_NAME_TOKENS } from '@pipefx/brain-contracts';

export const EXIT_PLAN_MODE_PROMPT = `Use ${TOOL_NAME_TOKENS.EXIT_PLAN_MODE} to leave plan mode without executing the current plan. Call this if the user cancels, if further exploration has invalidated the plan, or if the mission has been reshaped enough that a fresh ${TOOL_NAME_TOKENS.ENTER_PLAN_MODE} cycle is warranted.

Do NOT call this simply because the user approved the plan — approval automatically releases you to execute. Exit is for abandonment.`;

export const EXIT_PLAN_MODE_DESCRIPTION =
  'Leave plan mode without executing the plan. Use when the mission is cancelled or materially changed.';

export const EXIT_PLAN_MODE_INPUT_SCHEMA = {
  type: 'object',
  properties: {
    reason: {
      type: 'string',
      description: 'Short reason for exiting plan mode.',
    },
  },
  required: [],
} as const;
