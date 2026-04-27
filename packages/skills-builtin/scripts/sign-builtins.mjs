// ── @pipefx/skills-builtin — sign-builtins (Phase 12.13) ─────────────────
// Builds + signs a `.pfxskill` v2 bundle for every built-in skill listed
// in `BUILT_IN_SKILLS`. CI invokes this via:
//
//     pnpm nx run @pipefx/skills-builtin:sign-bundles
//
// Inputs:
//   - <repo>/SKILL/<id>/SKILL.md plus optional resource directories
//     (scripts/, ui/, assets/). The walker uses the same conventions as
//     `skill-md-loader.ts`, but inlined here so the signing tool stays
//     a thin top-level script.
//   - Env var `PFX_SKILL_SIGNING_KEY`: 64 hex chars (32-byte Ed25519
//     seed). When unset the script writes UNSIGNED bundles and exits 0
//     so local devs don't need to manage a key just to dogfood the
//     install path.
//
// Outputs:
//   - <repo>/dist/skill-bundles/<id>.pfxskill — signed (or unsigned)
//     bundle ready to ship inside the desktop installer.
//   - Stdout: one log line per skill summarizing the signing status.
//
// Generating a fresh dev key:
//   pnpm nx run @pipefx/skills-builtin:gen-key
//   → prints { privateKey, publicKey } as hex on stdout. Add the
//     publicKey to apps/backend trustedPublicKeys, stash the privateKey
//     in `PFX_SKILL_SIGNING_KEY`, rerun sign-bundles.

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  createSkillBundleV2,
  signSkillBundle,
} from '@pipefx/skills/marketplace';
import {
  bytesToHex,
  generateEd25519Keypair,
  hexToBytes,
} from '@pipefx/skills/domain';

import { BUILT_IN_SKILLS } from '../dist/skills.js';

// ── Layout ───────────────────────────────────────────────────────────────

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..', '..');
const skillsRoot = path.join(repoRoot, 'SKILL');
const outDir = path.join(repoRoot, 'dist', 'skill-bundles');

// ── Subcommands ──────────────────────────────────────────────────────────

const command = process.argv[2] ?? 'sign';
if (command === 'gen-key') {
  await runGenKey();
} else if (command === 'sign') {
  await runSignBundles();
} else {
  console.error(
    `unknown subcommand "${command}" — expected "sign" or "gen-key"`
  );
  process.exit(2);
}

// ── gen-key ──────────────────────────────────────────────────────────────

async function runGenKey() {
  const { privateKey, publicKey } = await generateEd25519Keypair();
  // JSON-on-one-line so the script's stdout can be `eval $(... | jq)`'d
  // by tooling. Pretty-printed underneath in case a human is reading.
  const result = {
    privateKey: bytesToHex(privateKey),
    publicKey: bytesToHex(publicKey),
  };
  console.log(JSON.stringify(result, null, 2));
}

// ── sign-bundles ─────────────────────────────────────────────────────────

async function runSignBundles() {
  const privateKey = readPrivateKeyFromEnv();
  mkdirSync(outDir, { recursive: true });

  let signedCount = 0;
  for (const builtin of BUILT_IN_SKILLS) {
    const skillDir = path.join(skillsRoot, builtin.id);
    if (!existsSync(path.join(skillDir, 'SKILL.md'))) {
      console.error(`[sign-builtins] skipping "${builtin.id}" — no SKILL.md found at ${skillDir}`);
      continue;
    }
    const skillMd = readFileSync(path.join(skillDir, 'SKILL.md'), 'utf-8');
    const resources = collectResources(skillDir);

    const unsigned = createSkillBundleV2({
      skillMd,
      resources,
    });

    const outPath = path.join(outDir, `${builtin.id}.pfxskill`);
    if (privateKey) {
      const signed = await signSkillBundle(unsigned, privateKey);
      writeFileSync(outPath, signed);
      signedCount += 1;
      console.log(
        `[sign-builtins] signed ${builtin.id} → ${path.relative(repoRoot, outPath)} (${signed.length} bytes, ${resources.length} resources)`
      );
    } else {
      writeFileSync(outPath, unsigned);
      console.log(
        `[sign-builtins] wrote UNSIGNED ${builtin.id} → ${path.relative(repoRoot, outPath)} (${unsigned.length} bytes, ${resources.length} resources)`
      );
    }
  }

  if (privateKey) {
    console.log(`[sign-builtins] done — ${signedCount} bundle(s) signed`);
  } else {
    console.log(
      `[sign-builtins] done — bundles are UNSIGNED (set PFX_SKILL_SIGNING_KEY to sign)`
    );
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────

function readPrivateKeyFromEnv() {
  const raw = process.env.PFX_SKILL_SIGNING_KEY;
  if (!raw) return null;
  const trimmed = raw.trim();
  if (trimmed.length !== 64) {
    throw new Error(
      `PFX_SKILL_SIGNING_KEY must be 64 hex chars (32-byte seed), got ${trimmed.length}`
    );
  }
  return hexToBytes(trimmed);
}

// Walk every file under skillDir except SKILL.md and pfxskill.json, build
// `ParsedSkillBundleResource[]` keyed by POSIX-relative path. Mirrors the
// loader walk in `skill-md-loader.ts` — kept inlined here so the script
// has no run-time dependency on the loader internals.
function collectResources(skillDir) {
  const resources = [];

  /**
   * @param {string} dir
   * @param {string} relPrefix
   */
  function walk(dir, relPrefix) {
    for (const entry of readdirSync(dir)) {
      const abs = path.join(dir, entry);
      const rel = relPrefix ? `${relPrefix}/${entry}` : entry;
      if (rel === 'SKILL.md' || rel === 'pfxskill.json') continue;
      const stat = statSync(abs);
      if (stat.isDirectory()) {
        walk(abs, rel);
      } else if (stat.isFile()) {
        resources.push({ path: rel, content: readFileSync(abs) });
      }
    }
  }

  walk(skillDir, '');
  // Stable ordering — `signSkillBundle` re-sorts internally, but keeping
  // the script's log output deterministic helps when diffing CI runs.
  resources.sort((a, b) => a.path.localeCompare(b.path));
  return resources;
}
