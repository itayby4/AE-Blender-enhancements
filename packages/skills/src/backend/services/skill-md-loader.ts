// ── @pipefx/skills/backend — SKILL.md filesystem loader ──────────────────
// Phase 12.2 — walk a skills root and return one `LoadedSkill` per
// `<root>/<id>/SKILL.md`. Bundled-UI skills (`ui: bundled`) carry
// additional files (the React component, scripts, assets) but they are
// not loaded here — the loader's job is the canonical metadata. The
// runner (Phase 12.4) is what reads `bundledUi.entry` etc. on demand.
//
// The walker is one-deep on purpose: every skill directory is a
// self-contained unit that owns its own SKILL.md. We don't recurse —
// nesting `<root>/<group>/<id>/SKILL.md` would invite scope-creep
// (collections, nested namespaces) without a real motivating use case.
//
// What this layer does NOT do:
//
//   • Watch the filesystem. The store + loader are both synchronous
//     reads; live reload is the desktop dev tooling's concern.
//
//   • Decide install/uninstall semantics. Phase 7's filesystem-backed
//     store treats the on-disk file set as the source of truth and
//     mutates it directly. Phase 12's v2 store does the same; the loader
//     is the read half.

import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
} from 'node:fs';
import * as path from 'node:path';

import type { LoadedSkill } from '../../contracts/skill-md.js';
import {
  parseSkillMd,
  type SkillMdParseError,
} from '../../domain/skill-md-parser.js';

// ── Public types ─────────────────────────────────────────────────────────

export interface LoadSkillError {
  /** Skill id (directory name) that failed to load. */
  skillId: string;
  /** Filesystem path of the SKILL.md that failed (when known). */
  sourceFile?: string;
  /** Human-readable error message. */
  message: string;
  /** Underlying parser error, when the failure was a parse failure. */
  parseError?: SkillMdParseError;
}

export interface LoadSkillsResult {
  loaded: LoadedSkill[];
  /** Per-skill failures. The loader does NOT throw on individual skill
   *  failures — a corrupt skill should not block the rest of the library
   *  from booting. Callers (the v2 store, the desktop library page) can
   *  surface these to the user as warnings. */
  errors: LoadSkillError[];
}

// ── Public API ───────────────────────────────────────────────────────────

/**
 * Walk `rootDir` for `<id>/SKILL.md` files. Returns successfully-parsed
 * skills + a list of per-skill errors. Missing `rootDir` returns an empty
 * result rather than throwing — the v2 store creates the directory lazily
 * on first install, so a fresh user has nothing to load.
 */
export function loadSkillsFromDir(rootDir: string): LoadSkillsResult {
  if (!existsSync(rootDir)) {
    return { loaded: [], errors: [] };
  }

  const loaded: LoadedSkill[] = [];
  const errors: LoadSkillError[] = [];

  let entries: string[];
  try {
    entries = readdirSync(rootDir);
  } catch (error) {
    return {
      loaded: [],
      errors: [
        {
          skillId: '<root>',
          message: `failed to read skills root ${rootDir}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        },
      ],
    };
  }

  for (const entry of entries.sort()) {
    const skillDir = path.join(rootDir, entry);
    let stats;
    try {
      stats = statSync(skillDir);
    } catch (error) {
      errors.push({
        skillId: entry,
        message: `stat failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      });
      continue;
    }
    if (!stats.isDirectory()) continue;

    const result = loadSkillFromDir(skillDir, { idOverride: entry });
    if (result.ok) {
      loaded.push(result.loaded);
    } else {
      errors.push(result.error);
    }
  }

  return { loaded, errors };
}

export interface LoadSkillFromDirOptions {
  /** Override the skill id (defaults to the basename of `skillDir`). The
   *  v2 store passes the index-row id in so a directory rename surfaces
   *  as an error rather than silently re-keying. */
  idOverride?: string;
}

export type LoadSkillFromDirResult =
  | { ok: true; loaded: LoadedSkill }
  | { ok: false; error: LoadSkillError };

/**
 * Load a single skill from a directory. The directory must contain a
 * `SKILL.md` at its root. The loader cross-checks the directory name
 * against `frontmatter.id` and rejects mismatches — keeping ids
 * filesystem-aligned is what makes `<root>/<id>/SKILL.md` lookups safe.
 */
export function loadSkillFromDir(
  skillDir: string,
  options: LoadSkillFromDirOptions = {}
): LoadSkillFromDirResult {
  const dirId = options.idOverride ?? path.basename(skillDir);
  const skillMdPath = path.join(skillDir, 'SKILL.md');

  if (!existsSync(skillMdPath)) {
    return {
      ok: false,
      error: {
        skillId: dirId,
        message: `missing SKILL.md at ${skillMdPath}`,
      },
    };
  }

  let source: string;
  try {
    source = readFileSync(skillMdPath, 'utf-8');
  } catch (error) {
    return {
      ok: false,
      error: {
        skillId: dirId,
        sourceFile: skillMdPath,
        message: `failed to read SKILL.md: ${
          error instanceof Error ? error.message : String(error)
        }`,
      },
    };
  }

  const parsed = parseSkillMd(source, { sourceFile: skillMdPath });
  if (!parsed.ok) {
    return {
      ok: false,
      error: {
        skillId: dirId,
        sourceFile: skillMdPath,
        message: parsed.error.message,
        parseError: parsed.error,
      },
    };
  }

  if (parsed.loaded.frontmatter.id !== dirId) {
    return {
      ok: false,
      error: {
        skillId: dirId,
        sourceFile: skillMdPath,
        message: `SKILL.md id "${parsed.loaded.frontmatter.id}" does not match directory name "${dirId}"`,
      },
    };
  }

  return { ok: true, loaded: parsed.loaded };
}
