// ── @pipefx/skills/backend — v2 SKILL.md store ───────────────────────────
// Phase 12.2 storage layer. Persists installed skills under a versioned
// subfolder so v1 and v2 coexist without touching each other:
//
//   <root>/v2/
//     index.json                       ─ list of installed-skill metadata
//     <skill-id>/SKILL.md              ─ canonical source of truth
//     <skill-id>/<resource paths…>     ─ scripts/, ui/, assets/, etc.
//
// The store owns the directory: install writes SKILL.md + the bundled
// resources, uninstall rm-rfs the skill directory. The on-disk SKILL.md
// is the source of truth — `index.json` only carries install metadata
// (source, signed, fingerprint, installedAt) so we don't re-parse every
// SKILL.md on `list()`.
//
// What this layer does NOT do:
//
//   • Verify signatures. Phase 12.x install routes verify before
//     calling `install`; once persisted, the SKILL.md is trusted.
//
//   • Lock the directory across processes. Same single-writer assumption
//     as v1's store.
//
// References:
//   - phase-12-skills-v2.md §12.2 ("Loader + storage")
//   - skill-storage.ts (the v1 sibling — same shape, JSON-manifest payload)

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
  LoadedSkill,
  SkillFrontmatter,
  SkillId,
} from '../../contracts/index.js';
import { loadSkillFromDir } from './skill-md-loader.js';

// ── Public types ─────────────────────────────────────────────────────────
// Mirrors v1's `SkillStore` shape but takes a `LoadedSkill` (frontmatter +
// body) and an optional resource list instead of a JSON `SkillManifest`.
// The runner (Phase 12.4) decides which to call based on the skill format.

export type SkillMdSource = 'local' | 'bundle' | 'remote';

export interface InstalledSkillMd {
  loaded: LoadedSkill;
  source: SkillMdSource;
  installedAt: number;
  /** True iff the bundle carried a valid Ed25519 signature. */
  signed: boolean;
  /** Author fingerprint at install time. */
  fingerprint?: string;
  /** Filesystem path of the unpacked skill directory. */
  installPath: string;
}

export interface InstallSkillMdOptions {
  source: SkillMdSource;
  signed: boolean;
  fingerprint?: string;
  /** Resources to write alongside SKILL.md (scripts/, ui/, assets/).
   *  Paths are POSIX-style and relative to the skill directory. */
  resources?: ReadonlyArray<{ path: string; content: Uint8Array }>;
}

export interface SkillMdStore {
  list(): InstalledSkillMd[];
  get(id: SkillId): InstalledSkillMd | null;
  install(loaded: LoadedSkill, opts: InstallSkillMdOptions): InstalledSkillMd;
  /** Returns true iff a skill was removed. */
  uninstall(id: SkillId): boolean;
}

export interface SkillMdStorageOptions {
  /** Root directory for installs. The store appends `/v2/` automatically
   *  so v1 and v2 stores can share a parent (e.g. `~/.pipefx/skills/`)
   *  without colliding. */
  rootDir: string;
  /** Wall-clock source — pluggable for tests. */
  now?: () => number;
}

// ── Internal index row ───────────────────────────────────────────────────

interface IndexRow {
  skillId: SkillId;
  source: SkillMdSource;
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
): SkillMdStore {
  const versionedRoot = path.join(opts.rootDir, `v${STORE_SCHEMA_VERSION}`);
  const indexPath = path.join(versionedRoot, 'index.json');
  const now = opts.now ?? Date.now;

  mkdirSync(versionedRoot, { recursive: true });

  // In-memory snapshot keyed by skillId. Bootstrap by re-reading every
  // SKILL.md so the cache reflects the on-disk source of truth — if the
  // user edits a SKILL.md by hand between runs, that edit takes effect.
  const cache = new Map<SkillId, InstalledSkillMd>();
  for (const row of readIndex(indexPath).rows) {
    const skillDir = path.join(versionedRoot, sanitize(row.skillId));
    const loadResult = loadSkillFromDir(skillDir, { idOverride: row.skillId });
    if (!loadResult.ok) {
      console.warn(
        `[skill-md-storage] dropping skill ${row.skillId} from index: ${loadResult.error.message}`
      );
      continue;
    }
    cache.set(row.skillId, hydrate(loadResult.loaded, row));
  }

  function persist(): void {
    const file: IndexFile = {
      schemaVersion: STORE_SCHEMA_VERSION,
      rows: [...cache.values()].map(toIndexRow),
    };
    writeFileSync(indexPath, JSON.stringify(file, null, 2), 'utf-8');
  }

  return {
    list(): InstalledSkillMd[] {
      return [...cache.values()];
    },
    get(id: SkillId): InstalledSkillMd | null {
      return cache.get(id) ?? null;
    },
    install(loaded, installOpts): InstalledSkillMd {
      const skillId = loaded.frontmatter.id;
      const skillDir = path.join(versionedRoot, sanitize(skillId));
      mkdirSync(skillDir, { recursive: true });

      // Reconstruct SKILL.md from the parsed result. We could keep the
      // original source byte-for-byte by passing it through — simpler
      // contract for now: the canonical SKILL.md has the resolved
      // frontmatter (post-Zod) and the body verbatim.
      const skillMdSource = renderSkillMd(loaded);
      writeFileSync(path.join(skillDir, 'SKILL.md'), skillMdSource, 'utf-8');

      // Write resources. The loader rejects backslash / absolute / `..`
      // paths at parse time (bundle-v2.ts), but we sanitize here too as
      // belt-and-suspenders — v2 SkillStore.install() can be called by
      // callers that didn't go through the bundle parser.
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

      const record: InstalledSkillMd = {
        loaded: { ...loaded, sourceFile: path.join(skillDir, 'SKILL.md') },
        source: installOpts.source,
        signed: installOpts.signed,
        fingerprint: installOpts.fingerprint,
        installPath: skillDir,
        installedAt: now(),
      };
      cache.set(skillId, record);
      persist();
      return record;
    },
    uninstall(id: SkillId): boolean {
      const existed = cache.delete(id);
      if (!existed) return false;
      const skillDir = path.join(versionedRoot, sanitize(id));
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

function hydrate(loaded: LoadedSkill, row: IndexRow): InstalledSkillMd {
  return {
    loaded,
    source: row.source,
    installedAt: row.installedAt,
    signed: row.signed,
    fingerprint: row.fingerprint,
    installPath: row.installPath,
  };
}

function toIndexRow(record: InstalledSkillMd): IndexRow {
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
  // `yaml.stringify` defaults are friendly: block scalars for arrays,
  // double-quotes only when needed. `lineWidth: 0` disables wrapping so
  // long descriptions stay on one line for easy diffing.
  const yaml = stringifyYaml(orderedFm, { lineWidth: 0 });
  const body = loaded.body.endsWith('\n') ? loaded.body : loaded.body + '\n';
  const bodyJoiner = body.startsWith('\n') ? '' : '\n';
  return `---\n${yaml}---${bodyJoiner}${body}`;
}
