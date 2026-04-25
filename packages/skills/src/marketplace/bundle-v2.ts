// ── @pipefx/skills/marketplace — .pfxskill v2 (zip) ──────────────────────
// Phase 12 wire format: a zip archive with a `SKILL.md` at the root plus
// optional `scripts/`, `ui/`, `assets/` directories and an optional
// `pfxskill.json` signing sidecar. Replaces v1's flat JSON envelope so
// bundles can carry binary resources (the `ui/` React component is the
// motivating example) without ballooning the manifest with base64 blobs.
//
// Why zip:
//   • Fits the on-disk skill layout exactly — `parseSkillBundleV2` returns
//     the same `(SKILL.md, resources)` shape the FS loader returns. The
//     install path becomes "unzip into <root>/v2/<id>/" verbatim.
//   • Native tooling: any user can inspect a `.pfxskill` with `unzip -l`.
//   • `fflate` ships a pure-JS implementation with no Node-only deps, so
//     this module stays browser-safe (the desktop's import dialog needs
//     to read bundles in the renderer for the consent prompt).
//
// What this module does NOT do:
//   • Verify signatures. Same separation as v1: parsing is browser-safe,
//     signature verification is Node-only and lives at the install route.
//   • Persist bundles. The v2 SkillStore (Phase 12.2) is responsible for
//     placing files on disk; the marketplace produces and consumes byte
//     streams.
//
// References:
//   - phase-12-skills-v2.md §"Skill on disk" + §"Migration"

import { unzipSync, zipSync } from 'fflate';

import type { LoadedSkill } from '../contracts/skill-md.js';
import { parseSkillMd } from '../domain/skill-md-parser.js';

// ── Wire constants ───────────────────────────────────────────────────────

/** Filename inside the zip that carries the SKILL.md source. */
export const SKILL_MD_FILENAME = 'SKILL.md';

/** Optional sidecar carrying signature material. Only present for signed
 *  bundles; bundles without this entry are unsigned. */
export const SIGNING_MANIFEST_FILENAME = 'pfxskill.json';

/** Bundle-format version. Bumps on incompatible changes. */
export const BUNDLE_V2_SCHEMA_VERSION = 2 as const;

// ── Public types ─────────────────────────────────────────────────────────

export interface ParsedSkillBundleResource {
  /** POSIX-style relative path inside the bundle (e.g. `scripts/x.py`). */
  path: string;
  content: Uint8Array;
}

export interface ParsedSkillBundleSigning {
  /** Hex-encoded Ed25519 signature over the canonical payload. */
  signatureHex: string;
  /** Hex-encoded Ed25519 public key (32 bytes = 64 hex chars). */
  publicKeyHex: string;
}

export interface ParsedSkillBundleV2 {
  loaded: LoadedSkill;
  /** Everything in the zip except the SKILL.md and the signing sidecar. */
  resources: ParsedSkillBundleResource[];
  signing?: ParsedSkillBundleSigning;
}

export type ParseSkillBundleV2Result =
  | { ok: true; bundle: ParsedSkillBundleV2 }
  | { ok: false; error: string };

export interface CreateSkillBundleV2Input {
  /** Full SKILL.md source (frontmatter + body) as a UTF-8 string. */
  skillMd: string;
  /** Resources to ship alongside SKILL.md. Paths are POSIX-relative;
   *  must not include `SKILL.md` or `pfxskill.json` (reserved). */
  resources?: ReadonlyArray<ParsedSkillBundleResource>;
  /** Optional signing sidecar. The marketplace layer writes whatever the
   *  caller provides verbatim — the canonical-payload algorithm and key
   *  generation live in `domain/signing.ts` (Node-only). */
  signing?: ParsedSkillBundleSigning;
}

// ── Public API ───────────────────────────────────────────────────────────

/**
 * Parse a `.pfxskill` v2 byte stream. Validates the embedded SKILL.md via
 * the v2 frontmatter schema; does NOT verify signatures.
 */
export function parseSkillBundleV2(
  bytes: Uint8Array
): ParseSkillBundleV2Result {
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(bytes);
  } catch (error) {
    return {
      ok: false,
      error: `failed to unzip bundle: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }

  // Reject backslash-pathed and absolute-pathed entries up front. zip
  // archives can carry traversal-shaped names; refusing them at parse
  // time is cheaper than relying on every consumer to sanitize.
  for (const path of Object.keys(entries)) {
    if (path.includes('\\')) {
      return {
        ok: false,
        error: `bundle entry uses backslash path: ${path}`,
      };
    }
    if (path.startsWith('/')) {
      return {
        ok: false,
        error: `bundle entry uses absolute path: ${path}`,
      };
    }
    if (path.split('/').includes('..')) {
      return {
        ok: false,
        error: `bundle entry contains ".." segment: ${path}`,
      };
    }
  }

  const skillMdBytes = entries[SKILL_MD_FILENAME];
  if (!skillMdBytes) {
    return {
      ok: false,
      error: `bundle is missing ${SKILL_MD_FILENAME} at the archive root`,
    };
  }

  let skillMdSource: string;
  try {
    skillMdSource = new TextDecoder('utf-8', { fatal: true }).decode(
      skillMdBytes
    );
  } catch {
    return { ok: false, error: 'SKILL.md is not valid UTF-8' };
  }

  const parsed = parseSkillMd(skillMdSource);
  if (!parsed.ok) {
    return {
      ok: false,
      error: `bundle SKILL.md is invalid: ${parsed.error.message}`,
    };
  }

  let signing: ParsedSkillBundleSigning | undefined;
  const signingBytes = entries[SIGNING_MANIFEST_FILENAME];
  if (signingBytes) {
    let parsedSigning: unknown;
    try {
      parsedSigning = JSON.parse(
        new TextDecoder('utf-8', { fatal: true }).decode(signingBytes)
      );
    } catch (error) {
      return {
        ok: false,
        error: `${SIGNING_MANIFEST_FILENAME} is not valid JSON: ${
          error instanceof Error ? error.message : String(error)
        }`,
      };
    }
    const validated = validateSigningSidecar(parsedSigning);
    if (!validated.ok) return { ok: false, error: validated.error };
    signing = validated.signing;
  }

  // Resources = everything except SKILL.md + the signing sidecar. Sorted
  // for stable ordering — the canonical-payload algorithm (Phase 7.4)
  // already sorts before signing, so this just gives diff-friendly output.
  const resources: ParsedSkillBundleResource[] = [];
  for (const [path, content] of Object.entries(entries)) {
    if (path === SKILL_MD_FILENAME) continue;
    if (path === SIGNING_MANIFEST_FILENAME) continue;
    // Skip explicit directory entries (zips occasionally include them as
    // zero-byte names ending in `/`).
    if (path.endsWith('/') && content.length === 0) continue;
    resources.push({ path, content });
  }
  resources.sort((a, b) => a.path.localeCompare(b.path));

  return {
    ok: true,
    bundle: {
      loaded: parsed.loaded,
      resources,
      ...(signing ? { signing } : {}),
    },
  };
}

/**
 * Create a `.pfxskill` v2 byte stream from a SKILL.md source + resources.
 * Output is a deterministic zip — paths are sorted, the SKILL.md always
 * sits at the root. Callers can sign the result by adding a `signing`
 * sidecar (typically computed via `domain/signing.ts` over the same
 * canonical payload).
 */
export function createSkillBundleV2(
  input: CreateSkillBundleV2Input
): Uint8Array {
  const entries: Record<string, Uint8Array> = {};
  entries[SKILL_MD_FILENAME] = new TextEncoder().encode(input.skillMd);

  if (input.resources) {
    const seen = new Set<string>();
    // Stable order — matches what `parseSkillBundleV2` will produce on
    // the way back out.
    const sorted = [...input.resources].sort((a, b) =>
      a.path.localeCompare(b.path)
    );
    for (const resource of sorted) {
      if (resource.path === SKILL_MD_FILENAME) {
        throw new Error(
          `resource path collides with reserved ${SKILL_MD_FILENAME}`
        );
      }
      if (resource.path === SIGNING_MANIFEST_FILENAME) {
        throw new Error(
          `resource path collides with reserved ${SIGNING_MANIFEST_FILENAME} — pass via input.signing instead`
        );
      }
      if (seen.has(resource.path)) {
        throw new Error(`duplicate resource path: ${resource.path}`);
      }
      seen.add(resource.path);
      entries[resource.path] = resource.content;
    }
  }

  if (input.signing) {
    const sidecar = JSON.stringify(
      {
        schemaVersion: BUNDLE_V2_SCHEMA_VERSION,
        signature: input.signing.signatureHex,
        publicKey: input.signing.publicKeyHex,
      },
      null,
      2
    );
    entries[SIGNING_MANIFEST_FILENAME] = new TextEncoder().encode(sidecar);
  }

  // `level: 9` keeps bundles small; pinning `mtime` to a fixed epoch
  // avoids leaking wall-clock timestamps into the binary so two builds
  // of the same skill diff cleanly. fflate's DOS-time encoder rejects
  // dates outside [1980, 2099]; 2020-01-01 sits comfortably in range.
  return zipSync(entries, { level: 9, mtime: BUNDLE_DETERMINISTIC_MTIME });
}

const BUNDLE_DETERMINISTIC_MTIME = new Date('2020-01-01T00:00:00Z');

// ── Internals ────────────────────────────────────────────────────────────

function validateSigningSidecar(
  raw: unknown
):
  | { ok: true; signing: ParsedSkillBundleSigning }
  | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object') {
    return { ok: false, error: `${SIGNING_MANIFEST_FILENAME} must be an object` };
  }
  const obj = raw as Record<string, unknown>;
  if (obj['schemaVersion'] !== BUNDLE_V2_SCHEMA_VERSION) {
    return {
      ok: false,
      error: `${SIGNING_MANIFEST_FILENAME} schemaVersion must be ${BUNDLE_V2_SCHEMA_VERSION}, got ${String(obj['schemaVersion'])}`,
    };
  }
  const signature = obj['signature'];
  const publicKey = obj['publicKey'];
  if (typeof signature !== 'string' || !/^[0-9a-f]+$/i.test(signature)) {
    return {
      ok: false,
      error: `${SIGNING_MANIFEST_FILENAME}.signature must be hex-encoded`,
    };
  }
  if (
    typeof publicKey !== 'string' ||
    publicKey.length !== 64 ||
    !/^[0-9a-f]+$/i.test(publicKey)
  ) {
    return {
      ok: false,
      error: `${SIGNING_MANIFEST_FILENAME}.publicKey must be 64 hex chars (32-byte Ed25519 key)`,
    };
  }
  return {
    ok: true,
    signing: {
      signatureHex: signature,
      publicKeyHex: publicKey,
    },
  };
}
