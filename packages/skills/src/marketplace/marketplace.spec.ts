// ── @pipefx/skills/marketplace — round-trip + tamper tests ───────────────
// Coverage:
//   • Round-trip: export then import returns the same manifest + resources
//   • Signed export round-trips through `verifySkill` against the
//     canonical payload (signing.ts is the source of truth — marketplace
//     just packages bytes)
//   • Tamper detection: mutating the manifest after signing breaks verify;
//     mutating a resource breaks verify (because the canonical payload
//     hashes resource contents)
//   • Malformed input: non-JSON, schema-invalid manifest, half-supplied
//     signature material, bad base64

import { describe, expect, it } from 'vitest';

import { parseManifestOrThrow } from '../domain/manifest-schema.js';
import {
  generateSkillKeyPair,
  signSkill,
  verifySkill,
  type SignableResource,
} from '../domain/signing.js';
import type { SkillManifest } from '../contracts/types.js';

import {
  bundleToInstallRequest,
  exportSkillBundle,
  parseSkillBundle,
} from './index.js';

// ── Fixtures ─────────────────────────────────────────────────────────────

function makeManifest(overrides: Partial<SkillManifest> = {}): SkillManifest {
  return parseManifestOrThrow({
    schemaVersion: 1,
    id: 'cut-to-beat',
    version: '1.0.0',
    name: 'Cut to Beat',
    description: 'Inserts timeline markers on detected beats.',
    inputs: [{ name: 'sensitivity', type: 'number', default: 0.5 }],
    prompt: 'Detect beats then insert markers.',
    requires: {
      capabilities: [
        { connectorId: 'resolve', toolName: 'add_timeline_marker' },
      ],
    },
    ...overrides,
  });
}

function bytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

// ── Round-trip ───────────────────────────────────────────────────────────

describe('marketplace export/import round-trip', () => {
  it('round-trips a manifest with no resources or signature', () => {
    const manifest = makeManifest();
    const bundleBytes = exportSkillBundle({ manifest });
    const result = parseSkillBundle(bundleBytes);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.bundle.manifest).toEqual(manifest);
    expect(result.bundle.resources).toEqual([]);
    expect(result.bundle.signing).toBeUndefined();
  });

  it('round-trips resources byte-for-byte', () => {
    const manifest = makeManifest();
    const original = new Uint8Array([0x00, 0x01, 0xff, 0x7f, 0x80, 0x42]);
    const bundleBytes = exportSkillBundle({
      manifest,
      resources: [{ path: 'icon.bin', content: original }],
    });

    const result = parseSkillBundle(bundleBytes);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.bundle.resources).toHaveLength(1);
    expect(Array.from(result.bundle.resources[0].content)).toEqual(
      Array.from(original)
    );
    expect(result.bundle.resources[0].path).toBe('icon.bin');
  });

  it('round-trips a signed bundle and verifies against signing.ts', () => {
    const manifest = makeManifest();
    const keys = generateSkillKeyPair();
    const resources: SignableResource[] = [
      { path: 'a.txt', content: bytes('alpha') },
      { path: 'b.txt', content: bytes('beta') },
    ];
    const signature = signSkill(
      { manifest, resources },
      keys.privateKey
    );

    const bundleBytes = exportSkillBundle({
      manifest,
      resources: resources.map((r) => ({ path: r.path, content: r.content })),
      signing: { signature, publicKey: keys.publicKey },
    });

    const result = parseSkillBundle(bundleBytes);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.bundle.signing?.signatureHex).toMatch(/^[0-9a-f]+$/);
    expect(result.bundle.signing?.publicKeyHex).toHaveLength(64);

    // The verify path uses the SAME canonical payload that signing.ts
    // computes — exporting + re-parsing must not perturb byte equality.
    const reconstructed = result.bundle.resources.map((r) => ({
      path: r.path,
      content: r.content,
    }));
    const ok = verifySkill(
      { manifest: result.bundle.manifest, resources: reconstructed },
      hexToBytes(result.bundle.signing!.signatureHex),
      hexToBytes(result.bundle.signing!.publicKeyHex)
    );
    expect(ok).toBe(true);
  });
});

// ── Tamper detection ─────────────────────────────────────────────────────

describe('marketplace tamper detection', () => {
  it('verify fails when the manifest is mutated post-export', () => {
    const manifest = makeManifest();
    const keys = generateSkillKeyPair();
    const signature = signSkill({ manifest }, keys.privateKey);

    const bundleBytes = exportSkillBundle({
      manifest,
      signing: { signature, publicKey: keys.publicKey },
    });

    // Mutate the JSON in place — change the prompt to something the user
    // didn't review at signing time.
    const text = new TextDecoder().decode(bundleBytes);
    const tampered = text.replace(
      'Detect beats then insert markers.',
      'rm -rf the timeline'
    );
    expect(tampered).not.toBe(text);
    const tamperedBytes = new TextEncoder().encode(tampered);

    const parsed = parseSkillBundle(tamperedBytes);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    // Parsing still succeeds (it's structurally valid JSON + manifest)
    // — but the cryptographic check fails, which is the gate the install
    // route enforces.
    const ok = verifySkill(
      { manifest: parsed.bundle.manifest },
      hexToBytes(parsed.bundle.signing!.signatureHex),
      hexToBytes(parsed.bundle.signing!.publicKeyHex)
    );
    expect(ok).toBe(false);
  });

  it('verify fails when a resource is mutated post-export', () => {
    const manifest = makeManifest();
    const keys = generateSkillKeyPair();
    const resources: SignableResource[] = [
      { path: 'config.txt', content: bytes('safe-config') },
    ];
    const signature = signSkill({ manifest, resources }, keys.privateKey);

    const bundleBytes = exportSkillBundle({
      manifest,
      resources: resources.map((r) => ({ path: r.path, content: r.content })),
      signing: { signature, publicKey: keys.publicKey },
    });

    const parsed = parseSkillBundle(bundleBytes);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    // Swap in different bytes for the resource — verify must fail because
    // canonical payload hashes resource content.
    const tampered = parsed.bundle.resources.map((r) => ({
      path: r.path,
      content: bytes('attacker-config'),
    }));

    const ok = verifySkill(
      { manifest: parsed.bundle.manifest, resources: tampered },
      hexToBytes(parsed.bundle.signing!.signatureHex),
      hexToBytes(parsed.bundle.signing!.publicKeyHex)
    );
    expect(ok).toBe(false);
  });
});

// ── Malformed input ──────────────────────────────────────────────────────

describe('marketplace malformed input', () => {
  it('rejects non-UTF-8 bytes', () => {
    // Lone continuation byte — invalid UTF-8.
    const result = parseSkillBundle(new Uint8Array([0xff, 0xff, 0xff]));
    expect(result.ok).toBe(false);
  });

  it('rejects non-JSON text', () => {
    const result = parseSkillBundle(bytes('not json at all'));
    expect(result.ok).toBe(false);
  });

  it('rejects an envelope with the wrong schemaVersion', () => {
    const text = JSON.stringify({
      schemaVersion: 999,
      manifest: makeManifest(),
      resources: [],
    });
    const result = parseSkillBundle(bytes(text));
    expect(result.ok).toBe(false);
  });

  it('rejects an envelope with a malformed manifest', () => {
    const text = JSON.stringify({
      schemaVersion: 1,
      manifest: { id: 'oops' }, // missing required fields
      resources: [],
    });
    const result = parseSkillBundle(bytes(text));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues?.length ?? 0).toBeGreaterThan(0);
    }
  });

  it('rejects half-supplied signature material', () => {
    const manifest = makeManifest();
    const text = JSON.stringify({
      schemaVersion: 1,
      manifest,
      resources: [],
      signature: 'deadbeef',
      // publicKey omitted
    });
    const result = parseSkillBundle(bytes(text));
    expect(result.ok).toBe(false);
  });

  it('rejects a resource with malformed base64', () => {
    const manifest = makeManifest();
    const text = JSON.stringify({
      schemaVersion: 1,
      manifest,
      resources: [{ path: 'icon.bin', contentBase64: '!!!not-base64!!!' }],
    });
    const result = parseSkillBundle(bytes(text));
    expect(result.ok).toBe(false);
  });

  it('rejects path-traversal resource paths', () => {
    const manifest = makeManifest();
    const text = JSON.stringify({
      schemaVersion: 1,
      manifest,
      resources: [{ path: '../etc/passwd', contentBase64: '' }],
    });
    const result = parseSkillBundle(bytes(text));
    expect(result.ok).toBe(false);
  });
});

// ── bundleToInstallRequest ───────────────────────────────────────────────

describe('bundleToInstallRequest', () => {
  it('forwards manifest only when bundle is unsigned', () => {
    const manifest = makeManifest();
    const result = parseSkillBundle(exportSkillBundle({ manifest }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const req = bundleToInstallRequest(result.bundle);
    expect(req.manifest).toEqual(manifest);
    expect(req.signature).toBeUndefined();
    expect(req.publicKey).toBeUndefined();
  });

  it('forwards manifest + signature + publicKey when signed', () => {
    const manifest = makeManifest();
    const keys = generateSkillKeyPair();
    const signature = signSkill({ manifest }, keys.privateKey);
    const bundleBytes = exportSkillBundle({
      manifest,
      signing: { signature, publicKey: keys.publicKey },
    });
    const result = parseSkillBundle(bundleBytes);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const req = bundleToInstallRequest(result.bundle);
    expect(req.manifest).toEqual(manifest);
    expect(req.signature).toMatch(/^[0-9a-f]+$/);
    expect(req.publicKey).toHaveLength(64);
  });
});

// ── Helpers ──────────────────────────────────────────────────────────────

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return out;
}
