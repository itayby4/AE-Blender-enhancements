// ── @pipefx/skills/backend — filesystem-backed SkillStore ────────────────
// Persists installed skills under a versioned subfolder so we can evolve the
// on-disk format without colliding with v1 installs:
//
//   <root>/v1/
//     index.json                    ─ list of installed-skill metadata rows
//     <skill-id>/manifest.json      ─ canonical manifest (re-validated on read)
//
// The store reads `index.json` once at construction and keeps an in-memory
// snapshot for synchronous `list()` / `get()` calls (the SkillStore port is
// intentionally sync — the runner reads it on the request hot path and we
// don't want to await disk for every lookup). Mutations rewrite the index
// + write per-skill manifest files, then update the snapshot.
//
// What this layer does NOT do:
//
//   • Verify signatures. Phase 7.4 (signing) and Phase 7.6 install routes
//     verify before calling `install`; once persisted, the manifest is
//     trusted. Re-verification on read would require shipping the public
//     key + signature alongside, which is the install route's concern.
//
//   • Lock the index file across processes. v1 assumes a single backend
//     process owns the directory — multi-writer support is out of scope
//     until we have a real reason to add it.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import * as fs from 'node:fs';
import * as path from 'node:path';

import type {
  InstallOptions,
  SkillStore,
} from '../../contracts/api.js';
import type {
  InstalledSkill,
  SkillId,
  SkillManifest,
} from '../../contracts/types.js';
import { parseManifestOrThrow } from '../../domain/manifest-schema.js';

// ── Public types ─────────────────────────────────────────────────────────

export interface SkillStorageOptions {
  /** Root directory for installs. The store appends `/v1/` automatically. */
  rootDir: string;
  /** Wall-clock source — pluggable so tests can pin `installedAt`. */
  now?: () => number;
}

// ── Internal index row ───────────────────────────────────────────────────
// We persist row metadata (source, signed, fingerprint, installedAt,
// installPath) in `index.json` and the manifest itself in a per-skill
// `manifest.json`. Splitting them lets us list the library without parsing
// every manifest, and lets a manifest be re-read in isolation when the
// runner needs it.

interface IndexRow {
  skillId: SkillId;
  source: InstalledSkill['source'];
  installedAt: number;
  signed: boolean;
  fingerprint?: string;
  installPath?: string;
}

interface IndexFile {
  schemaVersion: 1;
  rows: IndexRow[];
}

const STORE_SCHEMA_VERSION = 1 as const;

// ── Factory ──────────────────────────────────────────────────────────────

export function createSkillStorage(opts: SkillStorageOptions): SkillStore {
  const versionedRoot = path.join(opts.rootDir, `v${STORE_SCHEMA_VERSION}`);
  const indexPath = path.join(versionedRoot, 'index.json');
  const now = opts.now ?? Date.now;

  mkdirSync(versionedRoot, { recursive: true });

  // In-memory snapshot. Keyed by skillId → InstalledSkill so `get` is O(1).
  const cache = new Map<SkillId, InstalledSkill>();

  // Bootstrap: load index + every manifest. A bad row (missing manifest,
  // schema-invalid manifest) is dropped from the cache and logged so the
  // backend boots cleanly even if a partial uninstall left orphaned files.
  for (const row of readIndex(indexPath).rows) {
    try {
      const manifest = readManifest(versionedRoot, row.skillId);
      cache.set(row.skillId, hydrate(manifest, row));
    } catch (error) {
      console.warn(
        `[skill-storage] dropping skill ${row.skillId} from index: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  function persist(): void {
    const file: IndexFile = {
      schemaVersion: STORE_SCHEMA_VERSION,
      rows: [...cache.values()].map(toIndexRow),
    };
    writeFileSync(indexPath, JSON.stringify(file, null, 2), 'utf-8');
  }

  return {
    list(): InstalledSkill[] {
      return [...cache.values()];
    },
    get(id: SkillId): InstalledSkill | null {
      return cache.get(id) ?? null;
    },
    install(manifest: SkillManifest, installOpts: InstallOptions): InstalledSkill {
      // Re-validate. The install route should already have validated, but
      // this is the last hop before disk — better to fail loud than to
      // persist a malformed manifest because an upstream gate regressed.
      const validated = parseManifestOrThrow(manifest);

      const skillDir = path.join(versionedRoot, sanitize(validated.id));
      mkdirSync(skillDir, { recursive: true });
      writeFileSync(
        path.join(skillDir, 'manifest.json'),
        JSON.stringify(validated, null, 2),
        'utf-8'
      );

      const record: InstalledSkill = {
        manifest: validated,
        source: installOpts.source,
        signed: installOpts.signed,
        fingerprint: installOpts.fingerprint,
        installPath: installOpts.installPath ?? skillDir,
        installedAt: now(),
      };
      cache.set(validated.id, record);
      persist();
      return record;
    },
    uninstall(id: SkillId): boolean {
      const existed = cache.delete(id);
      if (!existed) return false;
      const skillDir = path.join(versionedRoot, sanitize(id));
      if (existsSync(skillDir)) {
        fs.rmSync(skillDir, { recursive: true, force: true });
      }
      persist();
      return true;
    },
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────

function readIndex(indexPath: string): IndexFile {
  if (!existsSync(indexPath)) return { schemaVersion: STORE_SCHEMA_VERSION, rows: [] };
  try {
    const raw = readFileSync(indexPath, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<IndexFile>;
    if (!parsed || parsed.schemaVersion !== STORE_SCHEMA_VERSION) {
      // Different on-disk version: refuse to silently mis-interpret.
      // Future migrations should branch here explicitly.
      throw new Error(
        `unexpected skill index schema version: ${String(parsed?.schemaVersion)}`
      );
    }
    return { schemaVersion: STORE_SCHEMA_VERSION, rows: parsed.rows ?? [] };
  } catch (error) {
    throw new Error(
      `failed to read skill index at ${indexPath}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

function readManifest(versionedRoot: string, skillId: SkillId): SkillManifest {
  const manifestPath = path.join(versionedRoot, sanitize(skillId), 'manifest.json');
  const raw = readFileSync(manifestPath, 'utf-8');
  return parseManifestOrThrow(JSON.parse(raw));
}

function hydrate(manifest: SkillManifest, row: IndexRow): InstalledSkill {
  return {
    manifest,
    source: row.source,
    installedAt: row.installedAt,
    signed: row.signed,
    fingerprint: row.fingerprint,
    installPath: row.installPath,
  };
}

function toIndexRow(record: InstalledSkill): IndexRow {
  return {
    skillId: record.manifest.id,
    source: record.source,
    installedAt: record.installedAt,
    signed: record.signed,
    fingerprint: record.fingerprint,
    installPath: record.installPath,
  };
}

// Skill IDs are validated by the manifest schema (regex
// `/^[a-z0-9]([a-z0-9._-]*[a-z0-9])?$/i`), but disk operations reach this
// code via the cache too — sanitize defensively so a future schema
// loosening can't surprise us with a path-traversal-shaped id.
function sanitize(id: string): string {
  return id.replace(/[^a-zA-Z0-9._-]/g, '_');
}
