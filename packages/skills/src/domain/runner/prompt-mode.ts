// ── @pipefx/skills/domain — prompt-mode handler ──────────────────────────
// Renders the SKILL.md body via the template engine, derives the brain
// `allowedTools` list from `requires.tools[]` (+ optional), and calls
// `brain.chat`. The optional-tools hint is prepended to the message so
// authors can branch on the presence of nice-to-haves.
//
// `connector[]` constraints are honored by the capability matcher — the
// brain itself only sees tool names, so we collapse the v2 `RequiredTool`
// union (`string | { name }`) to bare names here.

import type { BrainLoopApi } from '@pipefx/brain-contracts';

import type {
  InstalledSkill,
  SkillRunRequest,
} from '../../contracts/api.js';
import type {
  RequiredTool,
  SkillRequires,
} from '../../contracts/skill-md.js';
import { renderTemplate } from './template.js';

function nameOf(required: RequiredTool): string {
  return typeof required === 'string' ? required : required.name;
}

/** Extract the unique tool-name allow-list the brain should accept during
 *  the prompt-mode turn. Includes optional tools so prompt bodies can
 *  reference them when the matcher reports them present. */
export function deriveAllowedTools(
  requires: SkillRequires | undefined
): string[] {
  if (!requires) return [];
  const names = new Set<string>();
  for (const tool of requires.tools ?? []) names.add(nameOf(tool));
  for (const tool of requires.optional ?? []) names.add(nameOf(tool));
  return [...names];
}

function optionalHint(
  optionalPresent: ReadonlyArray<RequiredTool> | undefined
): string {
  if (!optionalPresent || optionalPresent.length === 0) return '';
  const names = optionalPresent.map(nameOf).join(', ');
  return `[Available optional tools: ${names}]\n\n`;
}

export interface PromptModeRunInput {
  readonly skill: InstalledSkill;
  readonly req: SkillRunRequest;
  readonly brain: BrainLoopApi;
  readonly optionalPresent?: ReadonlyArray<RequiredTool>;
  readonly signal?: AbortSignal;
}

export interface PromptModeRunResult {
  readonly text: string;
}

export async function runPromptMode(
  input: PromptModeRunInput
): Promise<PromptModeRunResult> {
  const { skill, req, brain, optionalPresent, signal } = input;
  const body = renderTemplate(skill.loaded.body, req.inputs);
  const allowedTools = deriveAllowedTools(skill.loaded.frontmatter.requires);
  const message = optionalHint(optionalPresent) + body;
  const text = await brain.chat(message, {
    sessionId: req.sessionId,
    allowedTools,
    signal,
  });
  return { text };
}
