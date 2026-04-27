// ── @pipefx/skills/contracts — SKILL.md (single, MD-based system) ────────
// Phase 12 ships ONE skill format: a `SKILL.md` file (YAML frontmatter +
// Markdown body) modeled after Claude Code's skills. These types describe
// the parsed representation; the on-disk Markdown text is the source of
// truth.
//
// The frontmatter is a small, opinionated subset of YAML that maps onto
// `SkillFrontmatter`. The body is opaque to the contracts layer — it's
// passed to the model verbatim by the `prompt`-mode runner, ignored by
// `script` and `component` modes (where it serves as documentation).
//
// References:
//   - Refactore/phase-12-skills-v2.md (target shape, sub-phase 12.1)

// ── Identity ─────────────────────────────────────────────────────────────

/** Stable, user-visible skill id. The Zod schema enforces the charset
 *  `/^[a-z0-9]([a-z0-9._-]*[a-z0-9])?$/i`; reverse-DNS encouraged but
 *  not required (`com.acme.cut-to-beat`, `subtitles`, `audio-sync`). */
export type SkillId = string;

// ── UI tier ──────────────────────────────────────────────────────────────
// Two host modes for the frontmatter `ui` field.
//
//   inline   ─ engine renders an auto-form from `inputs[]`. Most skills.
//   bundled  ─ skill ships its own React component at `ui/index.tsx`.
//              Used for rich workflow surfaces (Subtitles, Audio Sync,
//              Autopod migrate to this mode in 12.10/12.11).

export type SkillUiTier = 'inline' | 'bundled';

// ── Execution mode ───────────────────────────────────────────────────────
// Picked by the runner from frontmatter shape. See `resolveExecutionMode`
// at the bottom of this file for the rule.
//
//   prompt    ─ default; brain-loop turn driven by the body.
//   script    ─ frontmatter declares `scripts.entry`; runner spawns it.
//   component ─ `ui: bundled`; runner emits a mount instruction the host
//               renders by looking up the registered React module.
//
// Modes compose: a `component`-mode skill can invoke `script` or
// `prompt` from inside its own component.

export type SkillExecutionMode = 'prompt' | 'script' | 'component';

// ── Bundled-UI mount mode ────────────────────────────────────────────────
// Tells the desktop shell how to host a `ui: bundled` skill.

export type SkillBundledUiMount = 'full-screen' | 'sidebar' | 'modal';

export interface SkillBundledUiManifest {
  /** Path inside the skill directory that exports the default React
   *  component. POSIX-style, relative to the skill root. */
  entry: string;
  /** Where the host should mount the component. Defaults to `'modal'`. */
  mount?: SkillBundledUiMount;
}

// ── Frontmatter inputs ───────────────────────────────────────────────────
// Input typeset wide enough for media-shaped pickers (`clip-ref`, `file`)
// without baking the whole picker UI into the frontmatter.

export type SkillFrontmatterInputType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'enum'
  | 'clip-ref'
  | 'file';

export interface SkillFrontmatterInput {
  /** Variable name; referenced as `{{id}}` in the body for prompt mode,
   *  or passed as a JSON key in script / component contexts. */
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

// ── Frontmatter requirements (long-run schema) ───────────────────────────
// Replaces v1's `CapabilityRequirement{connectorId?, toolName?}` and the
// short-lived `requires.capabilities[]` disjunction-string trick. Each
// `RequiredTool` is either:
//
//   • a bare tool name — matches that tool exposed by ANY live connector.
//     Fits the common case ("any host that supports `render_clip`").
//
//   • an object `{ name, connector? }` — when `connector[]` is present the
//     matcher only counts the tool as satisfied if a connector whose id
//     appears in the list is currently exposing it. Lets a skill say "I
//     need `import_subtitle_track`, but only via Resolve or Premiere."
//
// `optional[]` advertises tools the skill can take advantage of when
// present but does not gate runnability on. The matcher reports which
// optionals are live; `prompt`-mode skills receive that list as a
// system-prompt hint.

export type RequiredTool =
  | string
  | {
      name: string;
      /** Restrict to these connector ids. Absent / empty = any connector. */
      connector?: ReadonlyArray<string>;
    };

export interface SkillRequires {
  tools: ReadonlyArray<RequiredTool>;
  optional?: ReadonlyArray<RequiredTool>;
}

// ── Frontmatter scripts ──────────────────────────────────────────────────

export interface SkillFrontmatterScripts {
  /** Path (relative to skill root) of the entry script. Presence flips the
   *  execution mode to `script`. POSIX-style; the loader rejects `..` /
   *  absolute / backslash paths. */
  entry: string;
  /** Optional interpreter override; defaults inferred from extension
   *  (`.py` → `python3`, `.mjs` → `node`, `.sh` → `bash`). */
  interpreter?: string;
}

// ── Frontmatter (top level) ──────────────────────────────────────────────
// Everything in the YAML block at the top of `SKILL.md`. Body lives
// outside this object — see `LoadedSkill.body`.

export interface SkillFrontmatter {
  id: SkillId;
  name: string;
  description: string;
  /** Free-form category for library grouping (e.g. `'post-production'`). */
  category?: string;
  /** Lucide icon name; UI falls back to a generic glyph when absent. */
  icon?: string;
  /** Slash-palette match terms beyond `name`/`description`. May include
   *  globs (`subtitle*`) and explicit slash forms (`'/subtitles'`). */
  triggers?: ReadonlyArray<string>;
  inputs?: ReadonlyArray<SkillFrontmatterInput>;
  /** Tool requirements. Required-tools gate runnability; optional-tools
   *  enhance the run when present. */
  requires?: SkillRequires;
  /** Optional script entry — flips execution to `script` mode. */
  scripts?: SkillFrontmatterScripts;
  /** UI tier. Defaults to `'inline'` when absent. */
  ui?: SkillUiTier;
  /** Bundled-UI mount manifest. Required iff `ui === 'bundled'`. */
  bundledUi?: SkillBundledUiManifest;
  /** Loose semver, optional — many skills are "version-less". */
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
//
// Precedence: `component` > `script` > `prompt`. A bundled-UI skill that
// also declares `scripts.entry` is `component` — the script becomes a
// helper its component can invoke; the dispatcher does not auto-spawn it.

export function resolveExecutionMode(
  frontmatter: SkillFrontmatter
): SkillExecutionMode {
  if (frontmatter.ui === 'bundled') return 'component';
  if (frontmatter.scripts?.entry) return 'script';
  return 'prompt';
}
