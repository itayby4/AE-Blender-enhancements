// ── @pipefx/skills/domain — scaffold templates (Phase 12.12) ─────────────
// Pure SKILL.md text generators for the authoring scaffold flow. The
// "Create skill" palette command collects a few fields from the user, the
// UI calls into one of these template builders, and the result is parsed
// + persisted via the existing `SkillStore.install()` path.
//
// Two templates ship in 12.12:
//
//   • `prompt` ─ default. Body holds a short brief the brain executes.
//                Frontmatter declares an `inputs[]` placeholder so the
//                inline runner produces a non-empty form. No tool
//                requirements — the user wires those after scaffolding.
//
//   • `script` ─ scaffolds a `scripts/main.py` placeholder reference plus
//                the matching `scripts.entry` frontmatter field. The
//                actual script file is written by the backend route, not
//                by this pure builder.
//
// `bundled` mode is intentionally NOT offered. Bundled-UI skills require
// workspace-source code and a rebuild — outside the authoring scaffold's
// scope. The phase-12 doc calls this out explicitly (§12.12).
//
// References:
//   - Refactore/phase-12-skills-v2.md §12.12

import type {
  LoadedSkill,
  SkillId,
} from '../contracts/skill-md.js';
import { parseSkillMd } from './skill-md-parser.js';

// ── Public types ─────────────────────────────────────────────────────────

export type SkillScaffoldMode = 'prompt' | 'script';

export interface SkillScaffoldOptions {
  /** Skill id — must match the frontmatter regex
   *  (`/^[a-z0-9]([a-z0-9._-]*[a-z0-9])?$/i`). The caller is responsible
   *  for input validation; the parser will reject malformed ids. */
  id: SkillId;
  /** Human-readable name shown in the library card. Defaults to a
   *  Title-Cased form of the id when omitted. */
  name?: string;
  /** One-line description. Required by the schema, so a sensible default
   *  is filled in when blank. */
  description?: string;
  /** Library category. Free-form, defaults to `'general'`. */
  category?: string;
  /** Lucide icon name. Optional — the library shows a generic glyph when
   *  absent. */
  icon?: string;
}

export interface ScaffoldedSkill {
  /** Canonical SKILL.md text (frontmatter + body). Caller persists it via
   *  the install path; the storage layer re-renders to its own canonical
   *  form on disk, so byte-for-byte preservation is not guaranteed. */
  source: string;
  /** Resources the caller should write alongside SKILL.md. Path is POSIX,
   *  relative to the skill directory. Empty array for `prompt` mode. */
  resources: ReadonlyArray<{ path: string; content: string }>;
  /** Parsed `LoadedSkill` for the rendered source — saves the caller a
   *  re-parse before hitting `SkillStore.install`. */
  loaded: LoadedSkill;
}

// ── Builders ─────────────────────────────────────────────────────────────

/**
 * Render a `prompt`-mode SKILL.md template + parsed `LoadedSkill`. Pure;
 * no I/O. Throws if the template fails to parse — that would be a bug in
 * the template itself, never in user input (id validation is the
 * caller's responsibility).
 */
export function renderPromptTemplate(opts: SkillScaffoldOptions): ScaffoldedSkill {
  const id = opts.id;
  const name = opts.name?.trim() || titleCase(id);
  const description =
    opts.description?.trim() ||
    'New prompt-mode skill scaffolded from the authoring template.';
  const category = opts.category?.trim() || 'general';
  const icon = opts.icon?.trim();

  const fmLines: string[] = [
    `id: ${id}`,
    `name: ${yamlString(name)}`,
    `description: ${yamlString(description)}`,
    `category: ${yamlString(category)}`,
  ];
  if (icon) fmLines.push(`icon: ${yamlString(icon)}`);
  fmLines.push(`version: 0.0.1`);
  fmLines.push(`triggers:`);
  fmLines.push(`  - /${id}`);
  fmLines.push(`  - ${id}`);
  fmLines.push(`inputs:`);
  fmLines.push(`  - id: subject`);
  fmLines.push(`    type: string`);
  fmLines.push(`    label: Subject`);
  fmLines.push(`    description: What should the skill act on?`);
  fmLines.push(`    required: true`);

  const body = `# ${name}

You are running the **${name}** skill. The user provided:

- subject: \`{{subject}}\`

Walk through the task step by step:

1. Understand what the user is asking about \`{{subject}}\`.
2. Use any available tools to gather the information you need.
3. Produce a concise, well-formatted answer.

> Edit this body to drive the skill's behavior. Variables defined in
> \`inputs[]\` are substituted as \`{{id}}\` at run time.
`;

  const source = renderSkillMd(fmLines, body);
  return finalize(source, []);
}

/**
 * Render a `script`-mode SKILL.md template, plus a placeholder Python
 * script under `scripts/main.py`. The body is documentation-only (the
 * runner ignores it for `script` mode) but kept readable so the user
 * understands what wiring they need to add.
 */
export function renderScriptTemplate(opts: SkillScaffoldOptions): ScaffoldedSkill {
  const id = opts.id;
  const name = opts.name?.trim() || titleCase(id);
  const description =
    opts.description?.trim() ||
    'New script-mode skill scaffolded from the authoring template.';
  const category = opts.category?.trim() || 'general';
  const icon = opts.icon?.trim();

  const fmLines: string[] = [
    `id: ${id}`,
    `name: ${yamlString(name)}`,
    `description: ${yamlString(description)}`,
    `category: ${yamlString(category)}`,
  ];
  if (icon) fmLines.push(`icon: ${yamlString(icon)}`);
  fmLines.push(`version: 0.0.1`);
  fmLines.push(`triggers:`);
  fmLines.push(`  - /${id}`);
  fmLines.push(`  - ${id}`);
  fmLines.push(`scripts:`);
  fmLines.push(`  entry: scripts/main.py`);
  fmLines.push(`inputs:`);
  fmLines.push(`  - id: subject`);
  fmLines.push(`    type: string`);
  fmLines.push(`    label: Subject`);
  fmLines.push(`    description: Forwarded to the script as JSON on stdin.`);
  fmLines.push(`    required: true`);

  const body = `# ${name}

This is a \`script\`-mode skill. The runner spawns
\`scripts/main.py\` with the user's inputs serialised to stdin as JSON,
captures stdout into the run output, and surfaces a non-zero exit code as
a failed run.

The body is documentation only — \`script\` mode does not forward it to
the brain.
`;

  const scriptSource = `#!/usr/bin/env python3
"""Entry point for the ${name} skill."""

import json
import sys


def main() -> int:
    raw = sys.stdin.read()
    inputs = json.loads(raw) if raw.strip() else {}
    subject = inputs.get("subject", "")
    print(f"Hello from ${id}! subject={subject}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
`;

  const source = renderSkillMd(fmLines, body);
  return finalize(source, [
    { path: 'scripts/main.py', content: scriptSource },
  ]);
}

/**
 * Mode-dispatching helper. The UI layer holds `mode` in state and calls
 * this directly so the dialog stays mode-agnostic.
 */
export function renderScaffoldTemplate(
  mode: SkillScaffoldMode,
  opts: SkillScaffoldOptions
): ScaffoldedSkill {
  return mode === 'script'
    ? renderScriptTemplate(opts)
    : renderPromptTemplate(opts);
}

// ── Internals ────────────────────────────────────────────────────────────

function finalize(
  source: string,
  resources: ReadonlyArray<{ path: string; content: string }>
): ScaffoldedSkill {
  const parsed = parseSkillMd(source);
  if (!parsed.ok) {
    throw new Error(
      `scaffold template failed to parse — this is a bug: ${parsed.error.message}`
    );
  }
  return { source, resources, loaded: parsed.loaded };
}

function renderSkillMd(
  frontmatterLines: ReadonlyArray<string>,
  body: string
): string {
  const fm = frontmatterLines.join('\n');
  const trailing = body.endsWith('\n') ? '' : '\n';
  return `---\n${fm}\n---\n\n${body}${trailing}`;
}

/** Conservative YAML scalar quoting — wraps in double quotes when the
 *  value contains characters that are ambiguous as a bare scalar. */
function yamlString(value: string): string {
  if (value === '') return '""';
  if (/^[A-Za-z0-9_./ -]+$/.test(value) && !/^[-?:#]/.test(value) && !value.endsWith(':')) {
    return value;
  }
  // Escape backslash and double-quote, then wrap.
  const escaped = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `"${escaped}"`;
}

function titleCase(id: string): string {
  return id
    .split(/[-_. ]+/)
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
