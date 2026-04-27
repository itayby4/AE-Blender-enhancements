import { TOOL_NAME_TOKENS } from '@pipefx/brain-contracts';

export const TODO_WRITE_PROMPT = `Use the ${TOOL_NAME_TOKENS.TODO_WRITE} tool to maintain a structured, visible plan for the current mission. Writing down the plan lets the user follow along and keeps you from dropping steps on a long edit.

## When to use this tool

Reach for it whenever any of the following is true:
1. The user's request breaks into three or more distinct steps.
2. The mission is non-trivial and benefits from being staged (e.g. multi-clip edits, color + audio + export passes).
3. The user provided a list — numbered, comma-separated, or implicit ("A, then B, then C").
4. The user explicitly asked for a plan or checklist.
5. You just received new instructions mid-mission — capture them as todos before acting.
6. You're about to start a step: mark it in_progress BEFORE the tool call that begins it.
7. You finished a step: mark it completed IMMEDIATELY, then move to the next.

Only one todo may be in_progress at any moment — not zero, not two.

## When NOT to use this tool

Skip it entirely if:
1. There is a single straightforward step.
2. The task is conversational or informational ("what does this button do?").
3. You can finish the request in fewer than three trivial operations.

Tracking one-line requests is friction, not thoroughness.

## Examples of when to use it

<example>
User: Cut out every silence longer than 500ms, then apply the warm-tone LUT to every clip, then export as ProRes 422.
Assistant: *creates todo list:*
  1. Scanning timeline for silences longer than 500ms
  2. Removing detected silence ranges
  3. Applying warm-tone LUT to every clip on the timeline
  4. Configuring ProRes 422 export preset
  5. Starting render and reporting result
*Marks step 1 in_progress, begins the scan.*
<reasoning>Multi-stage pipeline with independent operations — a plan prevents skipping the LUT if silence removal takes a while.</reasoning>
</example>

<example>
User: Add chapter markers at each scene change in this timeline.
Assistant: *runs scene-detection tool, gets 14 scene boundaries*
I found 14 scene changes. I'll drop a marker at each.
*creates todo list with one item per marker: "Add chapter marker at 00:mm:ss" × 14, marks first in_progress*
<reasoning>After exploration the scope became multi-step. The list guarantees every scene gets a marker.</reasoning>
</example>

<example>
User: Produce three thumbnail options — one dramatic, one playful, one minimal.
Assistant: *creates todo list:*
  1. Generating dramatic thumbnail variant
  2. Generating playful thumbnail variant
  3. Generating minimal thumbnail variant
  4. Surfacing all three options to the user for selection
<reasoning>User explicitly listed three deliverables; each is a distinct operation with its own output.</reasoning>
</example>

## Examples of when NOT to use it

<example>
User: What's the current project's frame rate?
Assistant: *queries project info, responds with the answer.*
<reasoning>Single read. A todo list would be noise.</reasoning>
</example>

<example>
User: Add a marker labeled "intro" at the playhead.
Assistant: *calls add_timeline_marker, reports success.*
<reasoning>One-shot connector call. Nothing to stage.</reasoning>
</example>

<example>
User: Rename this clip from "take_02_v3" to "intro_hero".
Assistant: *renames the clip, confirms.*
<reasoning>Single operation in one location.</reasoning>
</example>

## States and management rules

1. **Allowed states**
   - pending — captured but not started
   - in_progress — being worked on right now (exactly one at a time)
   - completed — actually finished, verified

2. **Both forms are required per item**
   - content: imperative, e.g. "Apply warm-tone LUT"
   - activeForm: present continuous, e.g. "Applying warm-tone LUT"

3. **Real-time updates**
   - Update the list the moment a step's state changes. Never batch completions.
   - Start the next item only after marking the previous one completed.
   - If a step becomes irrelevant, remove it instead of leaving it as pending.

4. **Completion criteria**
   Do NOT mark a step completed if:
   - The connector call returned an error you haven't resolved.
   - The output doesn't match what was requested.
   - You had to skip a verification step.
   - A downstream dependency still needs manual confirmation.

   When blocked, keep the current step as in_progress and add a new pending step describing what's blocking.

5. **Breakdown quality**
   - Each item is specific and actionable ("Add marker at 00:01:00", not "Add markers").
   - Prefer many small items to one vague one.

When in doubt, use this tool. Visible progress is worth more than perceived velocity.`;

export const TODO_WRITE_DESCRIPTION =
  'Create or update the current mission todo list. Call proactively to surface progress. Keep exactly one item in_progress. Each item must include both content (imperative) and activeForm (present continuous).';

export const TODO_WRITE_INPUT_SCHEMA = {
  type: 'object',
  properties: {
    todos: {
      type: 'array',
      description:
        'The full, updated todo list. This REPLACES any prior list — always send the complete current state.',
      items: {
        type: 'object',
        properties: {
          content: {
            type: 'string',
            description: 'Imperative form, e.g. "Add marker at 00:01:00".',
          },
          activeForm: {
            type: 'string',
            description:
              'Present-continuous form shown during execution, e.g. "Adding marker at 00:01:00".',
          },
          status: {
            type: 'string',
            enum: ['pending', 'in_progress', 'completed'],
          },
        },
        required: ['content', 'activeForm', 'status'],
      },
    },
  },
  required: ['todos'],
} as const;
