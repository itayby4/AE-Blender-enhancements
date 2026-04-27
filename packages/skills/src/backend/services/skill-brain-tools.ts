// ── @pipefx/skills/backend — brain tools (Phase 12.14) ───────────────────
// Registers the `create_skill` brain-side tool so the chat-driven authoring
// flow (`_author-guide` SKILL.md + freeform user requests like "make me a
// skill that…") can persist a skill end-to-end without round-tripping through
// the desktop's authoring dialog.
//
// Tool contract:
//   create_skill({ skillMd })
//   → parses the SKILL.md via the v2 frontmatter schema
//   → refuses to clobber an existing skill (409-style guardrail; the brain
//      should call `update_skill_source` for edits — TBD when chat-driven
//      editing lands)
//   → calls `store.install` with `source: 'local'`, `signed: false`
//   → publishes `skills.installed` so the capability matcher recomputes
//   → returns a one-line success string for the LLM to surface verbatim
//
// Why this lives in `@pipefx/skills/backend` and not in a brain package:
//   The tool's effect (persist + index a SKILL.md) is a skills-domain
//   concern. Brain packages depend on `brain-contracts` only — keeping
//   the implementation co-located with `SkillStore` avoids an extra
//   indirection through brain-tasks. The brain side only sees a duck-typed
//   `LocalToolRegistry` (structurally compatible with both
//   `ConnectorRegistry` from `@pipefx/connectors` and the brain-tasks
//   `LocalToolRegistry`).

import type { EventBus } from '@pipefx/event-bus';

import type { SkillStore } from '../../contracts/api.js';
import type { SkillEventMap } from '../../contracts/events.js';
import { parseSkillMd } from '../../domain/skill-md-parser.js';

/** Minimal tool registry shape we need. Structurally satisfied by
 *  `ConnectorRegistry` (`@pipefx/connectors`) and the brain-tasks
 *  `LocalToolRegistry`. Keeping it local avoids a hard dep on either. */
export interface SkillBrainToolRegistry {
  registerLocalTool(
    name: string,
    description: string,
    inputSchema: Record<string, unknown>,
    handler: (args: Record<string, unknown>) => Promise<string>
  ): void;
}

export interface RegisterSkillBrainToolsDeps {
  readonly store: SkillStore;
  readonly bus: EventBus<SkillEventMap>;
}

/** Tool name surfaced to the LLM. Stable string so prompts (the
 *  `_author-guide` SKILL.md body) can reference it by name. */
export const CREATE_SKILL_TOOL_NAME = 'create_skill' as const;

const CREATE_SKILL_DESCRIPTION = `Create a new local skill from a complete SKILL.md document.

Input: a single argument \`skillMd\` containing the FULL SKILL.md text — YAML frontmatter (between \`---\` delimiters) followed by the Markdown body.

The SKILL.md must follow the v2 schema. Required frontmatter fields:
- id: kebab-case identifier (matches /^[a-z0-9]([a-z0-9._-]*[a-z0-9])?$/i)
- name: human-readable display name
- description: one-sentence summary of what the skill does

Optional frontmatter fields:
- category: 'creative' | 'workflow' | 'dev' | 'utility' | string
- icon: a lucide-react icon name (e.g. 'Subtitles', 'Mic', 'Wand')
- triggers: array of slash-command triggers, e.g. ['/my-skill', 'do my thing']
- inputs: array of typed input definitions (id, type, label, required, default, options)
- requires: { tools?: RequiredTool[], optional?: RequiredTool[] } where RequiredTool is a string OR { name, connector?: string[] }
- ui: 'inline' (default — render inputs in a form), or 'bundled' (skill ships its own React component — RESERVED for built-ins; do not use)
- scripts: { entry: 'scripts/<file>.<ext>' } for script-mode skills
- version: semver string

Modes (resolved from frontmatter):
- prompt mode: no scripts.entry and ui != 'bundled' → the body is the system prompt; the brain executes the workflow.
- script mode: scripts.entry is set → backend spawns the script with form values as JSON on stdin.
- component mode: ui: 'bundled' — RESERVED; cannot create via this tool.

Do NOT include fields that aren't in the schema (no triggerCommand, no hasUI, no embedded HTML in the body — the body is plain Markdown).

The tool refuses to overwrite an existing skill — pick a unique id.

On success returns a one-line confirmation with the install path. On failure returns a one-line error explaining what to fix; iterate and call again.`;

const CREATE_SKILL_INPUT_SCHEMA: Record<string, unknown> = {
  type: 'object',
  required: ['skillMd'],
  properties: {
    skillMd: {
      type: 'string',
      description:
        "The full SKILL.md document — YAML frontmatter between '---' delimiters, then the Markdown body. UTF-8 string.",
    },
  },
  additionalProperties: false,
};

/**
 * Register the brain-side `create_skill` tool against the host's tool
 * registry. Idempotent in the sense that the registry will overwrite a
 * prior registration — call once at backend boot.
 */
export function registerSkillBrainTools(
  registry: SkillBrainToolRegistry,
  deps: RegisterSkillBrainToolsDeps
): void {
  const { store, bus } = deps;

  registry.registerLocalTool(
    CREATE_SKILL_TOOL_NAME,
    CREATE_SKILL_DESCRIPTION,
    CREATE_SKILL_INPUT_SCHEMA,
    async (args) => {
      const skillMd = (args as { skillMd?: unknown }).skillMd;
      if (typeof skillMd !== 'string' || skillMd.length === 0) {
        return 'create_skill failed: `skillMd` argument is required and must be a non-empty string.';
      }

      const parsed = parseSkillMd(skillMd);
      if (!parsed.ok) {
        return `create_skill failed: SKILL.md is invalid — ${parsed.error.message}. Fix the frontmatter and call create_skill again.`;
      }

      // `ui: bundled` is for built-ins only — they ship workspace-source
      // React components in `@pipefx/skills-builtin`. A chat-authored
      // bundled skill has nowhere to live.
      if (parsed.loaded.frontmatter.ui === 'bundled') {
        return 'create_skill failed: `ui: bundled` is reserved for built-in skills shipped in @pipefx/skills-builtin. Use `prompt` (default) or `script` mode instead.';
      }

      const skillId = parsed.loaded.frontmatter.id;
      if (store.get(skillId)) {
        return `create_skill failed: a skill with id "${skillId}" already exists. Pick a different id, or ask the user whether to update the existing skill.`;
      }

      try {
        const record = store.install(parsed.loaded, {
          source: 'local',
          signed: false,
        });
        void bus.publish('skills.installed', {
          skillId: record.loaded.frontmatter.id,
          version: record.loaded.frontmatter.version,
          source: record.source,
          signed: record.signed,
          installedAt: record.installedAt,
        });
        const triggers = record.loaded.frontmatter.triggers ?? [];
        const triggerHint =
          triggers.length > 0
            ? ` — triggers: ${triggers.map((t) => `"${t}"`).join(', ')}`
            : '';
        return `Created skill "${record.loaded.frontmatter.name}" (id: ${skillId}) at ${record.installPath}${triggerHint}. It now appears in the library and can be run from the palette or chat.`;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return `create_skill failed during install: ${msg}`;
      }
    }
  );
}
