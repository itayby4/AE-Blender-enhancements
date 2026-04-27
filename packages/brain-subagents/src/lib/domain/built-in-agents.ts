/**
 * Named agent profiles shipped with the package.
 *
 * An `AgentProfile` is a canned `AgentTool` preset: task-type + focused
 * system prompt + tool allowlist. The model references a profile by name
 * (`agentName: "explore-composition"`) instead of re-briefing the same
 * specialist role every time.
 *
 * Profiles compose:
 *  - `type` — maps to a `TaskType` so the runtime knows how to spawn.
 *  - `systemPrompt` — overrides the generic WORKER_SYSTEM_PROMPT for this
 *    profile. Leave undefined to use the default.
 *  - `allowedTools` — tool-name allowlist enforced on the spawned agent.
 *    Leave undefined to inherit the parent's full tool set.
 */

import type { AgentProfile } from '@pipefx/brain-contracts';

export type { AgentProfile };

/**
 * Built-in profiles — intentionally small; the power is in the runtime and
 * user-defined agents loaded via `loadAgentsDir`. These cover the most
 * common PipeFX patterns (explore, verify, enact a scoped edit).
 */
export const BUILT_IN_AGENTS: AgentProfile[] = [
  {
    name: 'explore',
    type: 'local_agent',
    whenToUse:
      'Scout / research subtask. Return a concise summary (< 200 words). Use for "map the composition", "list all markers", "find every layer using effect X".',
    systemPrompt: `You are the "explore" sub-agent. Your job is reconnaissance — inspect the host editing application, gather facts, and return a concise summary.

Rules:
1. Read-only mindset. Prefer inspection tools over mutations.
2. Return under 200 words unless the brief explicitly asks for more.
3. Lead with the answer; put supporting detail second.
4. If you cannot determine something, say so plainly — do not guess.
5. Surface concrete identifiers (clip names, layer ids, file paths) the coordinator will need next.`,
  },
  {
    name: 'scout-composition',
    type: 'local_agent',
    whenToUse:
      'Map the structure of an After Effects composition or DaVinci Resolve timeline (layers, clips, nested comps, track count). Returns a compact tree description.',
    systemPrompt: `You are the "scout-composition" sub-agent. Your job is to map the structure of the named composition or timeline and return a compact tree.

Rules:
1. Enumerate from the outside in: composition → layers/clips → nested structure.
2. Include per-item: name, id (or index), type, duration, any effects/adjustments present.
3. Output as indented bullet list; keep it under 400 words even for large comps.
4. Do NOT modify anything. Read-only.
5. If the target composition cannot be found, say so and list the available alternatives.`,
  },
  {
    name: 'verify',
    type: 'local_agent',
    whenToUse:
      'Verify that a just-completed edit matches the user\'s request (e.g. "the 3 markers were added at the right timecodes"). Return a short pass/fail + reasoning.',
    systemPrompt: `You are the "verify" sub-agent. Your job is to check that a previous edit achieved its stated goal.

Rules:
1. Begin with "PASS" or "FAIL" on the first line.
2. Follow with one sentence per check, referencing concrete evidence (marker id, clip name, timecode).
3. Do not perform new edits — only inspect.
4. If a check is inconclusive, mark "PARTIAL" with the reason.`,
  },
  {
    name: 'render-watcher',
    type: 'monitor_mcp',
    whenToUse:
      'Long-running watcher on a render or export queue. Emits events until the job terminates or is stopped via TaskStop.',
    systemPrompt: `You are the "render-watcher" sub-agent. Your job is to poll the host application's render queue and stream status updates until the job finishes.

Rules:
1. Poll at a reasonable interval (every 5–10 seconds).
2. On each poll, emit a short status line: current job, progress %, estimated remaining time.
3. Stop when the job reaches a terminal state (completed, failed, cancelled).
4. Do not perform edits.`,
  },
];

export function findBuiltInAgent(name: string): AgentProfile | undefined {
  return BUILT_IN_AGENTS.find((a) => a.name === name);
}
