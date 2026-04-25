// ── @pipefx/skills/contracts — Skills v2 (MD-based) ──────────────────────
// Phase 12 introduces a Claude Code-style skill format: each skill is a
// `SKILL.md` file (YAML frontmatter + Markdown body) instead of the JSON
// `SkillManifest` from Phase 7. These types describe the parsed
// representation; the on-disk source of truth is the Markdown text itself.
//
// The frontmatter is a small, opinionated subset of YAML that maps onto
// `SkillFrontmatter`. The body is opaque to the contracts layer — it's
// passed to the model verbatim by the `prompt`-mode runner (Phase 12.4).
//
// References:
//   - Refactore/phase-12-skills-v2.md (target shape)
//   - phase-07-skills.md (the v1 system this coexists with through 12.7)

import type { SkillId } from './types.js';

// ── UI tier ──────────────────────────────────────────────────────────────
// Two host modes for the frontmatter `ui` field.
//
//   inline   ─ engine renders an auto-form from `inputs[]`. Most skills.
//   bundled  ─ skill ships its own React component at `ui/index.tsx`. Used
//              for rich dashboards that migrate from `apps/desktop/src/
//              features/<skill>` (Subtitles, Audio Sync, Autopod).

export type SkillUiTier = 'inline' | 'bundled';

// ── Execution mode ───────────────────────────────────────────────────────
// Picked by the runner in Phase 12.4 from frontmatter shape:
//
//   prompt    ─ default; brain-loop turn driven by the body.
//   script    ─ frontmatter declares `scripts.entry`; runner spawns it.
//   component ─ `ui: bundled`; runner mounts the React component.
//
// Modes can compose: a `component`-mode skill can invoke `script` or
// `prompt` from inside its component.

export type SkillExecutionMode = 'prompt' | 'script' | 'component';

// ── Bundled-UI mount mode (sub-shape) ────────────────────────────────────
// Tells the desktop shell how to host a `ui: bundled` skill.

export type SkillBundledUiMount = 'full-screen' | 'sidebar' | 'modal';

export interface SkillBundledUiManifest {
  /** Path inside the skill directory that exports the default React
   *  component. POSIX-style, relative to the skill root. */
  entry: string;
  /** Where the host should mount the component. Defaults to 'modal'. */
  mount?: SkillBundledUiMount;
}

// ── Frontmatter inputs ───────────────────────────────────────────────────
// v2 widens the input typeset compared to v1's plain primitive set:
// `clip-ref` and `file` exist so bundled-UI skills (and inline auto-forms
// in editor-aware contexts) can request media-shaped inputs without the
// frontmatter having to model the whole picker UI.
//
// Defaults and option lists stay JSON-shaped so YAML stays readable.

export type SkillFrontmatterInputType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'enum'
  | 'clip-ref'
  | 'file';

export interface SkillFrontmatterInput {
  /** Variable name; referenced as `{{id}}` in the body. */
  id: string;
  type: SkillFrontmatterInputType;
  /** Form-field label. Falls back to `id`. */
  label?: string;
  description?: string;
  required?: boolean;
  /** Default value. Type must match `type`. */
  default?: string | number | boolean;
  /** Required when `type === 'enum'`. */
  options?: ReadonlyArray<string>;
}

// ── Frontmatter requirements ─────────────────────────────────────────────
// `tools[]` is the list of MCP tool names the runner will allow this skill
// to call. `capabilities[]` is a coarser tag: each entry is a connector
// alias or a pipe-separated alternation (`'resolve | premiere'`) — the
// capability-matcher (Phase 12 keeps reusing the v1 matcher) treats each
// entry as a disjunction.

export interface SkillFrontmatterRequires {
  tools?: ReadonlyArray<string>;
  capabilities?: ReadonlyArray<string>;
}

// ── Frontmatter scripts ──────────────────────────────────────────────────

export interface SkillFrontmatterScripts {
  /** Path (relative to skill root) of the entry script. Presence flips the
   *  execution mode to `script`. */
  entry: string;
  /** Optional interpreter override; defaults inferred from extension. */
  interpreter?: string;
}

// ── Frontmatter (top level) ──────────────────────────────────────────────
// Everything in the YAML block at the top of `SKILL.md`. Body lives
// outside this object — see `LoadedSkill.body`.

export interface SkillFrontmatter {
  id: SkillId;
  name: string;
  description: string;
  /** Free-form category for library grouping (e.g. 'post-production'). */
  category?: string;
  /** Lucide icon name; UI falls back to a generic glyph when absent. */
  icon?: string;
  /** Slash-palette match terms beyond `name`/`description`. May include
   *  globs (`subtitle*`) and explicit slash forms (`'/subtitles'`). */
  triggers?: ReadonlyArray<string>;
  inputs?: ReadonlyArray<SkillFrontmatterInput>;
  requires?: SkillFrontmatterRequires;
  /** Optional script entry — flips execution to `script` mode. */
  scripts?: SkillFrontmatterScripts;
  /** UI tier. Defaults to `'inline'` when absent. */
  ui?: SkillUiTier;
  /** Bundled-UI mount manifest. Required iff `ui === 'bundled'`. */
  bundledUi?: SkillBundledUiManifest;
  /** Loose semver, optional in v2 — many skills are "version-less". */
  version?: string;
}

// ── Loaded skill ─────────────────────────────────────────────────────────
// The parser's product: validated frontmatter + the raw Markdown body +
// (optionally) the source path the skill was read from. `sourceFile` is
// untrusted display-only metadata — never use it for authorization.

export interface LoadedSkill {
  frontmatter: SkillFrontmatter;
  /** Markdown body following the frontmatter block. Verbatim — the parser
   *  does not template, render, or sanitize it. */
  body: string;
  /** Filesystem path the skill was loaded from. Absent when the skill was
   *  parsed from an in-memory string (tests, marketplace bundles). */
  sourceFile?: string;
}

// ── Derived: execution-mode resolver ─────────────────────────────────────
// Pure function so the contracts layer stays free of runtime state and
// callers can resolve the mode without instantiating a runner. Encodes
// the rule from phase-12-skills-v2.md §"Execution engine".

export function resolveExecutionMode(
  frontmatter: SkillFrontmatter
): SkillExecutionMode {
  if (frontmatter.ui === 'bundled') return 'component';
  if (frontmatter.scripts?.entry) return 'script';
  return 'prompt';
}
