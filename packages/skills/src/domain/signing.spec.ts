// ── @pipefx/skills/domain — signing.spec.ts ──────────────────────────────
// Round-trip tests for the v2 canonical payload + Ed25519 sign/verify.
// Runs under Node 22+, which is the same runtime CI uses to sign the
// built-in bundles.

import { describe, expect, it } from 'vitest';

import {
  bytesToHex,
  buildCanonicalPayload,
  CANONICAL_PAYLOAD_VERSION,
  generateEd25519Keypair,
  hexToBytes,
  signCanonicalPayload,
  verifyCanonicalPayload,
} from './signing.js';

const SAMPLE_SKILL_MD = `---
id: sample
name: Sample
description: A skill used to test signing.
---
# Sample skill body
`;

const SAMPLE_RESOURCES = [
  { path: 'scripts/main.py', content: new TextEncoder().encode('print("hi")') },
  { path: 'assets/template.txt', content: new TextEncoder().encode('hello') },
];

describe('buildCanonicalPayload', () => {
  it('embeds the schema version header', async () => {
    const payload = await buildCanonicalPayload({ skillMd: SAMPLE_SKILL_MD });
    const text = new TextDecoder().decode(payload);
    expect(text.startsWith(`${CANONICAL_PAYLOAD_VERSION}\n`)).toBe(true);
  });

  it('is deterministic for byte-identical inputs', async () => {
    const a = await buildCanonicalPayload({
      skillMd: SAMPLE_SKILL_MD,
      resources: SAMPLE_RESOURCES,
    });
    const b = await buildCanonicalPayload({
      skillMd: SAMPLE_SKILL_MD,
      resources: SAMPLE_RESOURCES,
    });
    expect(bytesToHex(a)).toBe(bytesToHex(b));
  });

  it('sorts resources by path so input order does not affect the hash', async () => {
    const reversed = [...SAMPLE_RESOURCES].reverse();
    const a = await buildCanonicalPayload({
      skillMd: SAMPLE_SKILL_MD,
      resources: SAMPLE_RESOURCES,
    });
    const b = await buildCanonicalPayload({
      skillMd: SAMPLE_SKILL_MD,
      resources: reversed,
    });
    expect(bytesToHex(a)).toBe(bytesToHex(b));
  });

  it('changes when the SKILL.md text changes', async () => {
    const a = await buildCanonicalPayload({ skillMd: SAMPLE_SKILL_MD });
    const b = await buildCanonicalPayload({
      skillMd: SAMPLE_SKILL_MD + '\n# extra\n',
    });
    expect(bytesToHex(a)).not.toBe(bytesToHex(b));
  });

  it('changes when a resource content changes', async () => {
    const [scriptResource] = SAMPLE_RESOURCES;
    if (!scriptResource) throw new Error('test fixture is empty');
    const a = await buildCanonicalPayload({
      skillMd: SAMPLE_SKILL_MD,
      resources: SAMPLE_RESOURCES,
    });
    const tweaked = [
      scriptResource,
      {
        path: 'assets/template.txt',
        content: new TextEncoder().encode('hello!'),
      },
    ];
    const b = await buildCanonicalPayload({
      skillMd: SAMPLE_SKILL_MD,
      resources: tweaked,
    });
    expect(bytesToHex(a)).not.toBe(bytesToHex(b));
  });
});

describe('signCanonicalPayload + verifyCanonicalPayload', () => {
  it('round-trips a freshly generated keypair', async () => {
    const { privateKey } = await generateEd25519Keypair();
    const payload = await buildCanonicalPayload({
      skillMd: SAMPLE_SKILL_MD,
      resources: SAMPLE_RESOURCES,
    });
    const sig = await signCanonicalPayload(payload, privateKey);
    expect(sig.signatureHex).toMatch(/^[0-9a-f]{128}$/);
    expect(sig.publicKeyHex).toMatch(/^[0-9a-f]{64}$/);

    const result = await verifyCanonicalPayload(payload, sig);
    expect(result.ok).toBe(true);
  });

  it('rejects a payload that has been tampered with', async () => {
    const { privateKey } = await generateEd25519Keypair();
    const original = await buildCanonicalPayload({
      skillMd: SAMPLE_SKILL_MD,
    });
    const sig = await signCanonicalPayload(original, privateKey);

    const tampered = await buildCanonicalPayload({
      skillMd: SAMPLE_SKILL_MD + '\nappend\n',
    });
    const result = await verifyCanonicalPayload(tampered, sig);
    expect(result.ok).toBe(false);
  });

  it('rejects a signature signed by a different key', async () => {
    const a = await generateEd25519Keypair();
    const b = await generateEd25519Keypair();
    const payload = await buildCanonicalPayload({ skillMd: SAMPLE_SKILL_MD });
    const sigFromA = await signCanonicalPayload(payload, a.privateKey);

    // Force-swap the public key in the sidecar to b's key — the
    // signature was made by a, so verification under b must fail.
    const result = await verifyCanonicalPayload(payload, {
      signatureHex: sigFromA.signatureHex,
      publicKeyHex: bytesToHex(b.publicKey),
    });
    expect(result.ok).toBe(false);
  });

  it('rejects malformed hex without throwing', async () => {
    const payload = await buildCanonicalPayload({ skillMd: SAMPLE_SKILL_MD });
    const result = await verifyCanonicalPayload(payload, {
      signatureHex: 'not-hex',
      publicKeyHex: '00'.repeat(32),
    });
    expect(result.ok).toBe(false);
  });

  it('rejects a public key that is the wrong length', async () => {
    const payload = await buildCanonicalPayload({ skillMd: SAMPLE_SKILL_MD });
    const result = await verifyCanonicalPayload(payload, {
      signatureHex: '00'.repeat(64),
      publicKeyHex: '00'.repeat(16),
    });
    expect(result.ok).toBe(false);
  });
});

describe('hex helpers', () => {
  it('round-trips arbitrary bytes', () => {
    const bytes = new Uint8Array([0x00, 0x01, 0x7f, 0xff, 0xab]);
    expect(hexToBytes(bytesToHex(bytes))).toEqual(bytes);
  });

  it('rejects odd-length hex', () => {
    expect(() => hexToBytes('abc')).toThrow();
  });

  it('rejects non-hex characters', () => {
    expect(() => hexToBytes('zz')).toThrow();
  });
});
