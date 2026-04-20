import { TOOL_NAME_TOKENS } from '../constants.js';
import type { TaskTypeMetadata } from '../tasks.js';
import type { AgentProfile } from '../runtime/builtInAgents.js';

/**
 * AgentTool — system-prompt teaching block.
 *
 * Mirrors OpenClaude's AgentTool/prompt.ts structure (when to delegate,
 * self-contained brief requirement, forbidden patterns). Prose rewritten
 * for PipeFX. See ../../PROMPT_SOURCES.md.
 */
export const AGENT_TOOL_PROMPT = `Use ${TOOL_NAME_TOKENS.AGENT} to delegate a scoped subtask to a fresh sub-agent. The sub-agent runs with its own context and returns a concise summary — useful when a subtask would otherwise fill your main context with raw tool output.

## When to delegate

- **Exploration that returns a summary.** "Map every layer in this composition and report which ones drive the animation" — 50 small tool calls that compress to one paragraph.
- **Parallel scouting.** Several independent questions where each answer stands alone ("list render presets", "list installed plugins", "list loaded LUTs"). Launch them in parallel and synthesize.
- **Work you can precisely brief.** If you can write down exactly what the sub-agent should do and what output shape it should return, delegation is cheap.

## When NOT to delegate

- You'd just be passing the user's prompt through. Do the work yourself.
- The subtask requires the parent conversation's back-and-forth context to make judgment calls.
- The subtask is a single tool call. Call it yourself.

## Briefing rules

The sub-agent cannot see this conversation. Your brief must stand alone.

- State the goal in one or two sentences.
- Include concrete references (timeline/comp name, file path, marker id, layer name) — never "the one we talked about".
- Specify the output format you expect ("report under 200 words", "return a JSON array of marker ids", "list the top three candidates with reasoning").
- Call out constraints the sub-agent shouldn't violate.

Forbidden:
- Phrases like "based on your findings, do X" — those push synthesis onto the sub-agent. You must synthesize and then brief.
- Predicting or fabricating the sub-agent's result before it returns. Wait for actual output.

## After it returns

Read the output (via ${TOOL_NAME_TOKENS.TASK_OUTPUT} if not inlined). Decide the next step. Do not treat the sub-agent's conclusion as final — verify against the parent goal.`;

const BASE_AGENT_TOOL_DESCRIPTION =
  'Delegate a scoped subtask to a fresh sub-agent. Brief must be self-contained — the sub-agent has no memory of this conversation.';

/**
 * Compose a description that includes the runtime-registered agent catalog.
 * The model uses these to pick the right `agentName` (or `taskType` fallback).
 *
 * Kept deliberately compact — Gemini caps tool descriptions at 1024 chars,
 * so we truncate the catalog bullets if they'd overflow.
 */
export function buildAgentToolDescription(
  taskTypes: TaskTypeMetadata[],
  profiles: AgentProfile[]
): string {
  const profileLines = profiles.map(
    (p) => `- ${p.name} (${p.type}): ${p.whenToUse}`
  );
  const typeLines = taskTypes.map((t) => `- ${t.type}: ${t.whenToUse}`);
  const catalog = [
    profileLines.length ? 'Named agents:' : '',
    ...profileLines,
    typeLines.length ? 'Task types:' : '',
    ...typeLines,
  ]
    .filter(Boolean)
    .join('\n');

  // Gemini tool description limit is ~1024 chars. Trim oldest bullets if
  // needed. Base description + one trailing newline stays under the cap.
  const head = `${BASE_AGENT_TOOL_DESCRIPTION}\n\n${catalog}`;
  const MAX = 1000;
  if (head.length <= MAX) return head;
  return head.slice(0, MAX - 3) + '...';
}

export const AGENT_TOOL_DESCRIPTION = BASE_AGENT_TOOL_DESCRIPTION;

/**
 * Build the runtime input schema for AgentTool. The `taskType` enum is
 * generated from the registered task types; `agentName` (optional) enum
 * lists named profiles.
 */
export function buildAgentToolInputSchema(
  taskTypes: TaskTypeMetadata[],
  profiles: AgentProfile[]
): Record<string, unknown> {
  const typeEnum = taskTypes.map((t) => t.type);
  const agentNameEnum = profiles.map((p) => p.name);
  return {
    type: 'object',
    properties: {
      taskType: {
        type: 'string',
        enum: typeEnum.length > 0 ? typeEnum : ['local_agent'],
        description:
          'Which kind of worker to spawn. Use local_agent for scoped research/reasoning subtasks.',
      },
      ...(agentNameEnum.length > 0 && {
        agentName: {
          type: 'string',
          enum: agentNameEnum,
          description:
            'Optional named profile that sets the worker\'s system prompt and tool allowlist.',
        },
      }),
      description: {
        type: 'string',
        description:
          'One-line label for this subtask, shown in UI (e.g. "Scout composition layer tree").',
      },
      prompt: {
        type: 'string',
        description:
          'Self-contained brief. Must include goal, concrete references, expected output format, constraints.',
      },
      allowedTools: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Optional allowlist of tool names the sub-agent may call. Omit to inherit the parent tool set (or profile default).',
      },
    },
    required: ['taskType', 'description', 'prompt'],
  };
}

/**
 * Back-compat static schema used when no task types / profiles are passed.
 * New code should prefer `buildAgentToolInputSchema()`.
 */
export const AGENT_TOOL_INPUT_SCHEMA = {
  type: 'object',
  properties: {
    taskType: {
      type: 'string',
      enum: ['local_agent', 'local_workflow', 'monitor_mcp'],
      description:
        'Which kind of worker to spawn. Use local_agent for scoped research/reasoning subtasks.',
    },
    description: {
      type: 'string',
      description:
        'One-line label for this subtask, shown in UI (e.g. "Scout composition layer tree").',
    },
    prompt: {
      type: 'string',
      description:
        'Self-contained brief. Must include goal, concrete references, expected output format, constraints.',
    },
    allowedTools: {
      type: 'array',
      items: { type: 'string' },
      description:
        'Optional allowlist of tool names the sub-agent may call. Omit to inherit the parent tool set.',
    },
  },
  required: ['taskType', 'description', 'prompt'],
} as const;
