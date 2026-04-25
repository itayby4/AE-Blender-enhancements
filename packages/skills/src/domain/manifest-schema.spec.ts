// ── @pipefx/skills/domain — manifest-schema tests ────────────────────────
// Validates that the Zod manifest schema accepts realistic skills and
// rejects the specific failure modes we know we need to catch (duplicate
// input names, missing capability targets, enum default not in options,
// non-identifier input names that would break {{var}} substitution).

import { describe, it, expect } from 'vitest';

import { parseManifest, parseManifestOrThrow } from './manifest-schema.js';

const validManifest = {
  schemaVersion: 1,
  id: 'com.pipefx.cut-to-beat',
  version: '0.1.0',
  name: 'Cut to Beat',
  description: 'Cuts the timeline at every detected beat.',
  category: 'editing',
  icon: 'scissors',
  author: { name: 'PipeFX', publicKeyFingerprint: 'a1b2c3d4e5f60718' },
  inputs: [
    {
      name: 'sensitivity',
      type: 'number',
      label: 'Sensitivity',
      required: true,
      default: 0.5,
    },
    {
      name: 'mode',
      type: 'enum',
      options: ['hard', 'soft'],
      default: 'soft',
    },
  ],
  prompt: 'Cut at every beat with sensitivity {{sensitivity}} in {{mode}} mode.',
  requires: {
    capabilities: [
      { connectorId: 'resolve', toolName: 'add_timeline_marker' },
      { toolName: 'detect_beats', description: 'Audio beat detection tool' },
    ],
  },
};

describe('parseManifest', () => {
  it('accepts a realistic skill manifest', () => {
    const result = parseManifest(validManifest);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.manifest.id).toBe('com.pipefx.cut-to-beat');
      expect(result.manifest.inputs).toHaveLength(2);
    }
  });

  it('accepts a minimal manifest with no inputs and no capabilities', () => {
    const result = parseManifest({
      schemaVersion: 1,
      id: 'minimal',
      version: '1.0.0',
      name: 'Minimal',
      description: 'Bare-bones skill.',
      inputs: [],
      prompt: 'Hello world.',
      requires: { capabilities: [] },
    });
    expect(result.ok).toBe(true);
  });

  it('rejects an unknown schemaVersion', () => {
    const result = parseManifest({ ...validManifest, schemaVersion: 2 });
    expect(result.ok).toBe(false);
  });

  it('rejects an id with invalid characters', () => {
    const result = parseManifest({ ...validManifest, id: 'has spaces' });
    expect(result.ok).toBe(false);
  });

  it('rejects a non-semver version string', () => {
    const result = parseManifest({ ...validManifest, version: 'one-point-oh' });
    expect(result.ok).toBe(false);
  });

  it('rejects an input name that is not a JS identifier', () => {
    const result = parseManifest({
      ...validManifest,
      inputs: [{ name: '1bad', type: 'string' }],
    });
    expect(result.ok).toBe(false);
  });

  it('rejects duplicate input names', () => {
    const result = parseManifest({
      ...validManifest,
      inputs: [
        { name: 'tone', type: 'string' },
        { name: 'tone', type: 'string' },
      ],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const messages = result.error.issues.map((i) => i.message).join('|');
      expect(messages).toMatch(/duplicate input name/);
    }
  });

  it('rejects an enum input without options', () => {
    const result = parseManifest({
      ...validManifest,
      inputs: [{ name: 'mode', type: 'enum', options: [] }],
    });
    expect(result.ok).toBe(false);
  });

  it('rejects an enum default that is not in options', () => {
    const result = parseManifest({
      ...validManifest,
      inputs: [
        {
          name: 'mode',
          type: 'enum',
          options: ['a', 'b'],
          default: 'c',
        },
      ],
    });
    expect(result.ok).toBe(false);
  });

  it('rejects a capability requirement with neither connectorId nor toolName', () => {
    const result = parseManifest({
      ...validManifest,
      requires: { capabilities: [{ description: 'wide open' }] },
    });
    expect(result.ok).toBe(false);
  });

  it('rejects a publicKeyFingerprint that is not hex', () => {
    const result = parseManifest({
      ...validManifest,
      author: { publicKeyFingerprint: 'not-hex-zzzzzzzz' },
    });
    expect(result.ok).toBe(false);
  });

  it('rejects an empty prompt', () => {
    const result = parseManifest({ ...validManifest, prompt: '' });
    expect(result.ok).toBe(false);
  });
});

describe('parseManifestOrThrow', () => {
  it('returns the manifest on success', () => {
    const m = parseManifestOrThrow(validManifest);
    expect(m.id).toBe('com.pipefx.cut-to-beat');
  });

  it('throws with field-level detail on failure', () => {
    expect(() => parseManifestOrThrow({ ...validManifest, id: 'bad id!' })).toThrow(
      /invalid skill manifest.*id/
    );
  });
});
