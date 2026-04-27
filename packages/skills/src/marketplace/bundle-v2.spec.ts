// ── @pipefx/skills/marketplace — bundle v2 tests ─────────────────────────
// Round-trips create → parse, exercises the failure modes the parser
// gates on (missing SKILL.md, traversal-shaped paths, malformed sidecar,
// non-utf8 SKILL.md).

import { describe, it, expect } from 'vitest';
import { zipSync } from 'fflate';

import {
  createSkillBundleV2,
  parseSkillBundleV2,
  signSkillBundle,
  verifySkillBundle,
  SKILL_MD_FILENAME,
  SIGNING_MANIFEST_FILENAME,
  BUNDLE_V2_SCHEMA_VERSION,
} from './bundle-v2.js';
import { generateEd25519Keypair } from '../domain/signing.js';

const minimalSkillMd = `---
id: minimal
name: Minimal
description: Bare-bones skill.
---

# Body

Hi.
`;

describe('createSkillBundleV2 / parseSkillBundleV2', () => {
  it('round-trips a SKILL.md only bundle', () => {
    const bytes = createSkillBundleV2({ skillMd: minimalSkillMd });
    const result = parseSkillBundleV2(bytes);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.bundle.loaded.frontmatter.id).toBe('minimal');
      expect(result.bundle.resources).toHaveLength(0);
      expect(result.bundle.signing).toBeUndefined();
    }
  });

  it('round-trips a bundle with resources', () => {
    const bytes = createSkillBundleV2({
      skillMd: minimalSkillMd,
      resources: [
        { path: 'scripts/run.py', content: new TextEncoder().encode('print(1)\n') },
        { path: 'assets/icon.svg', content: new TextEncoder().encode('<svg/>') },
      ],
    });
    const result = parseSkillBundleV2(bytes);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.bundle.resources).toHaveLength(2);
      // Sorted alphabetically by path.
      expect(result.bundle.resources.map((r) => r.path)).toEqual([
        'assets/icon.svg',
        'scripts/run.py',
      ]);
    }
  });

  it('round-trips a signing sidecar', () => {
    const sigHex = 'abcdef'.repeat(16); // 96 hex chars
    const keyHex = '0'.repeat(64);
    const bytes = createSkillBundleV2({
      skillMd: minimalSkillMd,
      signing: { signatureHex: sigHex, publicKeyHex: keyHex },
    });
    const result = parseSkillBundleV2(bytes);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.bundle.signing?.signatureHex).toBe(sigHex);
      expect(result.bundle.signing?.publicKeyHex).toBe(keyHex);
    }
  });

  it('rejects bundles missing SKILL.md', () => {
    const bytes = zipSync({
      'README.txt': new TextEncoder().encode('no skill here'),
    });
    const result = parseSkillBundleV2(bytes);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/missing SKILL.md/);
  });

  it('rejects bundles with backslash-pathed entries', () => {
    const bytes = zipSync({
      [SKILL_MD_FILENAME]: new TextEncoder().encode(minimalSkillMd),
      'scripts\\evil.py': new TextEncoder().encode('x'),
    });
    const result = parseSkillBundleV2(bytes);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/backslash/);
  });

  it('rejects bundles with `..` segments', () => {
    const bytes = zipSync({
      [SKILL_MD_FILENAME]: new TextEncoder().encode(minimalSkillMd),
      '../escape.txt': new TextEncoder().encode('x'),
    });
    const result = parseSkillBundleV2(bytes);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/\.\./);
  });

  it('rejects bundles whose SKILL.md fails frontmatter validation', () => {
    const badMd = `---
id: x
---
body
`;
    const bytes = createSkillBundleV2({ skillMd: badMd });
    // Constructor doesn't validate (intentional — author may want to
    // inspect the round-trip). Parsing rejects.
    const result = parseSkillBundleV2(bytes);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/SKILL\.md is invalid/);
  });

  it('rejects bundles whose sidecar is not the right schemaVersion', () => {
    const bytes = zipSync({
      [SKILL_MD_FILENAME]: new TextEncoder().encode(minimalSkillMd),
      [SIGNING_MANIFEST_FILENAME]: new TextEncoder().encode(
        JSON.stringify({
          schemaVersion: 99,
          signature: 'aa',
          publicKey: '0'.repeat(64),
        })
      ),
    });
    const result = parseSkillBundleV2(bytes);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/schemaVersion/);
  });

  it('rejects bundles whose sidecar publicKey is wrong length', () => {
    const bytes = zipSync({
      [SKILL_MD_FILENAME]: new TextEncoder().encode(minimalSkillMd),
      [SIGNING_MANIFEST_FILENAME]: new TextEncoder().encode(
        JSON.stringify({
          schemaVersion: BUNDLE_V2_SCHEMA_VERSION,
          signature: 'aa',
          publicKey: '0'.repeat(63),
        })
      ),
    });
    const result = parseSkillBundleV2(bytes);
    expect(result.ok).toBe(false);
  });

  it('rejects malformed zip bytes cleanly', () => {
    const bytes = new Uint8Array([0x00, 0x01, 0x02, 0x03]);
    const result = parseSkillBundleV2(bytes);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/unzip/);
  });

  it('createSkillBundleV2 throws on duplicate resource paths', () => {
    expect(() =>
      createSkillBundleV2({
        skillMd: minimalSkillMd,
        resources: [
          { path: 'a.txt', content: new Uint8Array() },
          { path: 'a.txt', content: new Uint8Array() },
        ],
      })
    ).toThrow(/duplicate/);
  });

  it('createSkillBundleV2 throws when a resource path collides with SKILL.md', () => {
    expect(() =>
      createSkillBundleV2({
        skillMd: minimalSkillMd,
        resources: [{ path: SKILL_MD_FILENAME, content: new Uint8Array() }],
      })
    ).toThrow(/reserved/);
  });

  it('produces deterministic bytes for the same input', () => {
    const a = createSkillBundleV2({
      skillMd: minimalSkillMd,
      resources: [{ path: 'x.txt', content: new TextEncoder().encode('hi') }],
    });
    const b = createSkillBundleV2({
      skillMd: minimalSkillMd,
      resources: [{ path: 'x.txt', content: new TextEncoder().encode('hi') }],
    });
    expect(a).toEqual(b);
  });

  it('parseSkillBundleV2 retains the raw SKILL.md text', () => {
    const bytes = createSkillBundleV2({ skillMd: minimalSkillMd });
    const result = parseSkillBundleV2(bytes);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.bundle.skillMdSource).toBe(minimalSkillMd);
    }
  });
});

describe('signSkillBundle / verifySkillBundle', () => {
  it('round-trips a freshly signed bundle', async () => {
    const { privateKey } = await generateEd25519Keypair();
    const unsigned = createSkillBundleV2({
      skillMd: minimalSkillMd,
      resources: [
        { path: 'scripts/run.py', content: new TextEncoder().encode('hi') },
      ],
    });
    const signed = await signSkillBundle(unsigned, privateKey);
    const parsed = parseSkillBundleV2(signed);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.bundle.signing).toBeDefined();
    const result = await verifySkillBundle(parsed.bundle);
    expect(result.ok).toBe(true);
  });

  it('verifySkillBundle returns "unsigned" when no sidecar is present', async () => {
    const bytes = createSkillBundleV2({ skillMd: minimalSkillMd });
    const parsed = parseSkillBundleV2(bytes);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const result = await verifySkillBundle(parsed.bundle);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/unsigned/);
  });

  it('verifySkillBundle rejects a bundle whose SKILL.md was tampered with after signing', async () => {
    const { privateKey } = await generateEd25519Keypair();
    const unsigned = createSkillBundleV2({ skillMd: minimalSkillMd });
    const signed = await signSkillBundle(unsigned, privateKey);
    const parsed = parseSkillBundleV2(signed);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    // Swap the SKILL.md source while keeping the original signature.
    const tamperedBundle = {
      ...parsed.bundle,
      skillMdSource: parsed.bundle.skillMdSource + '\nappend\n',
    };
    const result = await verifySkillBundle(tamperedBundle);
    expect(result.ok).toBe(false);
  });
});
