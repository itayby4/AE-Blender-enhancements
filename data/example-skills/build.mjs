// ── Example skills build script ──────────────────────────────────────────
// Reads each manifest under ./manifests/, packages it as a `.pfxskill`
// JSON envelope via @pipefx/skills/marketplace, and writes the result to
// ./dist/. The bundles ship UNSIGNED on purpose: shipping a private key
// alongside the bundles would defeat the point of signing (anyone could
// re-sign locally). Real authors generate their own keypair via the
// (upcoming) Authoring UI.
//
// Usage (run from workspace root):
//
//   pnpm nx build @pipefx/skills        # build skills first
//   node data/example-skills/build.mjs  # then package the bundles
//
// Output: data/example-skills/dist/<skill-id>.pfxskill

import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as path from 'node:path';

import { exportSkillBundle } from '@pipefx/skills/marketplace';
import { parseManifestOrThrow } from '@pipefx/skills/domain';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MANIFESTS_DIR = path.join(HERE, 'manifests');
const DIST_DIR = path.join(HERE, 'dist');

async function main() {
  if (!existsSync(MANIFESTS_DIR)) {
    throw new Error(`manifests dir not found: ${MANIFESTS_DIR}`);
  }
  await mkdir(DIST_DIR, { recursive: true });

  const files = (await readdir(MANIFESTS_DIR)).filter((f) =>
    f.endsWith('.json')
  );
  if (files.length === 0) {
    console.warn('no manifest files found — nothing to do');
    return;
  }

  for (const file of files) {
    const sourcePath = path.join(MANIFESTS_DIR, file);
    const raw = await readFile(sourcePath, 'utf-8');
    let manifest;
    try {
      manifest = parseManifestOrThrow(JSON.parse(raw));
    } catch (err) {
      console.error(`✗ ${file}: ${err.message}`);
      process.exitCode = 1;
      continue;
    }

    const bundleBytes = exportSkillBundle({ manifest });

    const outPath = path.join(DIST_DIR, `${manifest.id}.pfxskill`);
    await writeFile(outPath, bundleBytes);
    console.log(
      `✓ ${manifest.id}@${manifest.version}  →  ${path.relative(process.cwd(), outPath)}`
    );
  }
}

main().catch((err) => {
  console.error('build failed:', err);
  process.exit(1);
});
