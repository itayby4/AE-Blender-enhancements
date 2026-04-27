// ── @pipefx/skills/backend — v2 SKILL.md store ───────────────────────────
// Phase 12.6 storage layer. Reads from two roots — a read-only `builtinRoot`
// (skills shipped inside the desktop bundle) and a writable `userRoot`
// (skills the user installed from `.pfxskill` bundles or dropped in by
// hand). `list()` merges the two; user-root entries shadow built-ins
// with the same id.
//
// User-root layout (per-skill directory + sidecar index.json):
//
//   <userRoot>/v2/
//     index.json                       ─ list of installed-skill metadata
//     <skill-id>/SKILL.md              ─ canonical source of truth
//     <skill-id>/<resource paths…>     ─ scripts/, ui/, assets/, etc.
//
// Built-in root layout (no index.json — the directory IS the manifest):
//
//   <builtinRoot>/
//     <skill-id>/SKILL.md
//     <skill-id>/<resource paths…>
//
// Built-ins are walked at construction; the cache is rebuilt on every
// process restart, which is fine because they only change with the desktop
// app version. User-root install/uninstall flushes its own cache + index.
//
// What this layer does NOT do:
//
//   • Verify signatures. Phase 12.x install routes verify before
//     calling `install`; once persisted, the SKILL.md is trusted.
//
//   • Lock the directory across processes. Single-writer assumption.
//
//   • Publish bus events. The mount layer wraps install/uninstall to
//     emit `skills.installed` / `skills.uninstalled` so the
//     capability-matcher can recompute. Keeping this layer storage-only
//     means tests and tools can mutate the store without spinning up an
//     event bus.
//
// References:
//   - phase-12-skills-v2.md §12.2 ("Loader + storage"), §12.6 ("Backend
//     wiring + script-mode host")

import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import * as path from 'node:path';

import { stringify as stringifyYaml } from 'yaml';

import type {
  InstallOptions,
  InstalledSkill,
  SkillStore,
} from '../../contracts/api.js';
import type {
  LoadedSkill,
  SkillFrontmatter,
  SkillId,
} from '../../contracts/skill-md.js';
import { loadSkillFromDir, loadSkillsFromDir } from './skill-md-loader.js';

// ── Public types ─────────────────────────────────────────────────────────

export interface SkillMdStorageOptions {
  /** Writable root for user-installed skills. The store appends `/v2/`
   *  automatically so v1 and v2 stores can share a parent. */
  userRoot: string;
  /** Optional read-only root for built-in skills shipped in the desktop
   *  bundle. When a user skill shadows a built-in (same id), the user
   *  copy wins on `list()` / `get()`. Built-ins cannot be uninstalled —
   *  `uninstall()` returns `false` when only a built-in exists. */
  builtinRoot?: string;
  /** Wall-clock source — pluggable for tests. */
  now?: () => number;
}

// ── Internal index row (user root only) ──────────────────────────────────

interface IndexRow {
  skillId: SkillId;
  source: InstalledSkill['source'];
  installedAt: number;
  signed: boolean;
  fingerprint?: string;
  installPath: string;
}

interface IndexFile {
  schemaVersion: 2;
  rows: IndexRow[];
}

const STORE_SCHEMA_VERSION = 2 as const;

// ── Factory ──────────────────────────────────────────────────────────────

export function createSkillMdStorage(
  opts: SkillMdStorageOptions
): SkillStore {
  const userVersionedRoot = path.join(opts.userRoot, `v${STORE_SCHEMA_VERSION}`);
  const indexPath = path.join(userVersionedRoot, 'index.json');
  const now = opts.now ?? Date.now;

  mkdirSync(userVersionedRoot, { recursive: true });

  // Built-in cache: walked once, never mutated. The desktop ships the
  // built-in root inside the app bundle, so any updates require an app
  // restart anyway.
  const builtinCache = new Map<SkillId, InstalledSkill>();
  if (opts.builtinRoot && existsSync(opts.builtinRoot)) {
    const walked = loadSkillsFromDir(opts.builtinRoot);
    for (const err of walked.errors) {
      console.warn(
        `[skill-md-storage] built-in skill load failed for "${err.skillId}": ${err.message}`
      );
    }
    for (const loaded of walked.loaded) {
      const skillId = loaded.frontmatter.id;
      const installPath = path.join(opts.builtinRoot, skillId);
      builtinCache.set(skillId, {
        loaded,
        source: 'builtin',
        // Phase 12.13 will sign built-ins at build time. Until that
        // ships we mark them as unsigned and the install route's
        // signature gate is the only `signed: true` path.
        signed: false,
        installedAt: 0,
        installPath,
      });
    }
  }

  // User cache: bootstrap from `index.json` + on-disk SKILL.md so a
  // user editing SKILL.md by hand between runs takes effect.
  const userCache = new Map<SkillId, InstalledSkill>();
  for (const row of readIndex(indexPath).rows) {
    const skillDir = path.join(userVersionedRoot, sanitize(row.skillId));
    const loadResult = loadSkillFromDir(skillDir, { idOverride: row.skillId });
    if (!loadResult.ok) {
      console.warn(
        `[skill-md-storage] dropping user skill "${row.skillId}" from index: ${loadResult.error.message}`
      );
      continue;
    }
    userCache.set(row.skillId, hydrate(loadResult.loaded, row));
  }

  function persist(): void {
    const file: IndexFile = {
      schemaVersion: STORE_SCHEMA_VERSION,
      rows: [...userCache.values()].map(toIndexRow),
    };
    writeFileSync(indexPath, JSON.stringify(file, null, 2), 'utf-8');
  }

  function merged(): InstalledSkill[] {
    // User shadows built-in. Iterate built-ins first then overwrite from
    // user — preserves built-in ordering for ids that aren't shadowed.
    const out = new Map<SkillId, InstalledSkill>();
    for (const [id, record] of builtinCache) out.set(id, record);
    for (const [id, record] of userCache) out.set(id, record);
    return [...out.values()];
  }

  return {
    list(): InstalledSkill[] {
      return merged();
    },
    get(id: SkillId): InstalledSkill | null {
      return userCache.get(id) ?? builtinCache.get(id) ?? null;
    },
    install(loaded: LoadedSkill, installOpts: InstallOptions): InstalledSkill {
      if (installOpts.source === 'builtin') {
        throw new Error(
          'install() cannot persist a builtin skill — drop it under builtinRoot at build time'
        );
      }
      const skillId = loaded.frontmatter.id;
      const skillDir = path.join(userVersionedRoot, sanitize(skillId));
      mkdirSync(skillDir, { recursive: true });

      // Reconstruct SKILL.md from the parsed result. The canonical
      // SKILL.md has the resolved frontmatter (post-Zod) and the body
      // verbatim — re-parsing disk → re-render produces a byte-stable
      // file. Lossy for original whitespace / comments, which is fine
      // since the parser is the source of truth post-install.
      const skillMdSource = renderSkillMd(loaded);
      writeFileSync(path.join(skillDir, 'SKILL.md'), skillMdSource, 'utf-8');

      if (installOpts.resources) {
        for (const resource of installOpts.resources) {
          if (!isSafeRelativePath(resource.path)) {
            throw new Error(
              `unsafe resource path rejected: ${resource.path}`
            );
          }
          const target = path.join(skillDir, resource.path);
          mkdirSync(path.dirname(target), { recursive: true });
          writeFileSync(target, resource.content);
        }
      }

      const record: InstalledSkill = {
        loaded: { ...loaded, sourceFile: path.join(skillDir, 'SKILL.md') },
        source: installOpts.source,
        signed: installOpts.signed,
        fingerprint: installOpts.fingerprint,
        installPath: skillDir,
        installedAt: now(),
      };
      userCache.set(skillId, record);
      persist();
      return record;
    },
    uninstall(id: SkillId): boolean {
      // Built-ins are immutable — `uninstall` is a no-op for ids that
      // only exist in the built-in cache. The contract on api.ts is
      // explicit: "Returns true iff a skill was removed from the user
      // root."
      const existed = userCache.delete(id);
      if (!existed) return false;
      const skillDir = path.join(userVersionedRoot, sanitize(id));
      if (existsSync(skillDir)) {
        rmSync(skillDir, { recursive: true, force: true });
      }
      persist();
      return true;
    },
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────

function readIndex(indexPath: string): IndexFile {
  if (!existsSync(indexPath)) {
    return { schemaVersion: STORE_SCHEMA_VERSION, rows: [] };
  }
  try {
    const raw = readFileSync(indexPath, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<IndexFile>;
    if (!parsed || parsed.schemaVersion !== STORE_SCHEMA_VERSION) {
      throw new Error(
        `unexpected v2 skill index schema version: ${String(parsed?.schemaVersion)}`
      );
    }
    return { schemaVersion: STORE_SCHEMA_VERSION, rows: parsed.rows ?? [] };
  } catch (error) {
    throw new Error(
      `failed to read v2 skill index at ${indexPath}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

function hydrate(loaded: LoadedSkill, row: IndexRow): InstalledSkill {
  return {
    loaded,
    source: row.source,
    installedAt: row.installedAt,
    signed: row.signed,
    fingerprint: row.fingerprint,
    installPath: row.installPath,
  };
}

function toIndexRow(record: InstalledSkill): IndexRow {
  return {
    skillId: record.loaded.frontmatter.id,
    source: record.source,
    installedAt: record.installedAt,
    signed: record.signed,
    fingerprint: record.fingerprint,
    installPath: record.installPath,
  };
}

// Skill ids pass the frontmatter regex
// (`/^[a-z0-9]([a-z0-9._-]*[a-z0-9])?$/i`). Sanitize anyway so a future
// schema loosening can't surprise the disk layer.
function sanitize(id: string): string {
  return id.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function isSafeRelativePath(p: string): boolean {
  if (p.length === 0) return false;
  if (p.includes('\\')) return false;
  if (p.startsWith('/')) return false;
  if (p.split('/').includes('..')) return false;
  return true;
}

// ── SKILL.md serializer ──────────────────────────────────────────────────
// We re-emit the YAML frontmatter from the parsed object rather than
// stashing the original source. The parser (Phase 12.1) is lossy for
// formatting (whitespace, comments), but the canonical representation is
// what every downstream consumer (bundle exporter, signing, the runner)
// uses — keeping one canonical form on disk simplifies the install /
// upgrade story.
//
// Frontmatter keys are emitted in a fixed display order so a re-parse of
// disk → re-render produces a byte-stable file. Undefined values are
// dropped (the schema would have rejected them anyway).

const FRONTMATTER_KEY_ORDER: ReadonlyArray<keyof SkillFrontmatter> = [
  'id',
  'name',
  'description',
  'category',
  'icon',
  'version',
  'triggers',
  'requires',
  'inputs',
  'scripts',
  'ui',
  'bundledUi',
];

function renderSkillMd(loaded: LoadedSkill): string {
  const orderedFm: Record<string, unknown> = {};
  for (const key of FRONTMATTER_KEY_ORDER) {
    const value = loaded.frontmatter[key];
    if (value !== undefined) orderedFm[key] = value;
  }
  const yaml = stringifyYaml(orderedFm, { lineWidth: 0 });
  const body = loaded.body.endsWith('\n') ? loaded.body : loaded.body + '\n';
  const bodyJoiner = body.startsWith('\n') ? '' : '\n';
  return `---\n${yaml}---${bodyJoiner}${body}`;
}
