/**
 * Per-turn system-prompt composer. Takes the request context, constructs
 * a list of `SystemPromptSection`s (each closing over the context it
 * needs), resolves them through the cache, and joins the result.
 *
 * Cache strategy: section names include the `activeApp` when content
 * depends on it. This is how we get per-app memoization without flushing
 * on every app switch — the first AE turn populates `identity:aftereffects`,
 * the first Premiere turn populates `identity:premiere`, and neither
 * invalidates the other.
 */

import {
  systemPromptSection,
  DANGEROUS_uncachedSystemPromptSection,
  resolveSystemPromptSections,
  type SystemPromptSection,
} from './sections.js';
import * as lib from './library.js';

export interface PromptContext {
  activeApp: string | undefined;
  /** Optional skill override — if the skill provides its own systemInstruction, we use only that. */
  skillSystemInstruction?: string | undefined;
  /** Optional project-memory context string to append verbatim. */
  projectContext?: string | undefined;
  /** Legacy sections loaded from .md files (memory, pipeline_actions, skills). */
  legacySections?: string | undefined;
}

/**
 * Build the ordered section array for this context. Sections that return
 * `null` from their compute fn (e.g. aeBridgeContract when activeApp
 * isn't aftereffects) are dropped by the resolver.
 */
function buildSections(ctx: PromptContext): SystemPromptSection[] {
  const appKey = ctx.activeApp ?? 'none';

  const sections: SystemPromptSection[] = [
    systemPromptSection(`identity:${appKey}`, () => lib.identity(ctx)),
    systemPromptSection('doing_tasks', () => lib.doingTasks()),
    systemPromptSection('tone_and_style', () => lib.toneAndStyle()),
    systemPromptSection('executing_actions', () => lib.executingActions()),
    systemPromptSection('planning_discipline', () => lib.planningDiscipline()),
    systemPromptSection(`ae_bridge_contract:${appKey}`, () =>
      lib.aeBridgeContract(ctx)
    ),
  ];

  // Legacy .md sections (memory, pipeline_actions, skills) — cached per-app
  // because the old loader does a DaVinci-Resolve → appName string replace.
  if (ctx.legacySections) {
    sections.push(
      systemPromptSection(
        `legacy_md:${appKey}`,
        () => ctx.legacySections ?? null
      )
    );
  }

  // Skill override & project context are request-specific — volatile.
  if (ctx.skillSystemInstruction) {
    sections.push(
      DANGEROUS_uncachedSystemPromptSection(
        'skill_instruction',
        () => ctx.skillSystemInstruction ?? null,
        'per-request skill override'
      )
    );
  }
  if (ctx.projectContext) {
    sections.push(
      DANGEROUS_uncachedSystemPromptSection(
        'project_context',
        () => ctx.projectContext ?? null,
        'project memory changes between turns'
      )
    );
  }

  return sections;
}

/**
 * Compose the full system prompt for a chat request. Joins resolved
 * sections with blank-line separators — the same shape the old
 * `loadSystemPrompt` returned.
 */
export async function composeSystemPrompt(ctx: PromptContext): Promise<string> {
  // If a skill provides a fully custom system prompt, honor it verbatim
  // (keeps the skill contract from the old buildSystemPrompt).
  if (ctx.skillSystemInstruction && !ctx.activeApp && !ctx.legacySections) {
    return ctx.skillSystemInstruction;
  }
  const sections = buildSections(ctx);
  const parts = await resolveSystemPromptSections(sections);
  return parts.join('\n\n');
}

export { clearSystemPromptSections } from './sections.js';
