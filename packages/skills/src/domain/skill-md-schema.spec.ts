// ── @pipefx/skills/domain — frontmatter schema tests ─────────────────────
// Mirrors the tests for v1's `manifest-schema.spec.ts`: we accept realistic
// frontmatter, reject the failure modes the schema exists to catch.

import { describe, it, expect } from 'vitest';

import {
  parseFrontmatter,
  parseFrontmatterOrThrow,
} from './skill-md-schema.js';

const validFrontmatter = {
  id: 'subtitles',
  name: 'Generate Subtitles',
  description: 'Render a clip, run VAD, transcribe, translate, and import.',
  category: 'post-production',
  triggers: ['subtitle*', 'caption*', '/subtitles'],
  requires: {
    tools: [
      'render_clip',
      { name: 'import_subtitle_track', connector: ['resolve', 'premiere'] },
    ],
    optional: ['burn_in_subtitles'],
  },
  inputs: [
    { id: 'clipId', type: 'clip-ref', label: 'Clip', required: true },
    {
      id: 'targetLang',
      type: 'enum',
      options: ['en', 'he', 'fr', 'es', 'ja'],
      default: 'en',
    },
  ],
  ui: 'inline',
};

describe('parseFrontmatter', () => {
  it('accepts a realistic SKILL.md frontmatter', () => {
    const result = parseFrontmatter(validFrontmatter);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.frontmatter.id).toBe('subtitles');
      expect(result.frontmatter.inputs).toHaveLength(2);
      expect(result.frontmatter.triggers).toEqual([
        'subtitle*',
        'caption*',
        '/subtitles',
      ]);
    }
  });

  it('accepts a minimal frontmatter (id + name + description only)', () => {
    const result = parseFrontmatter({
      id: 'minimal',
      name: 'Minimal',
      description: 'Bare-bones skill.',
    });
    expect(result.ok).toBe(true);
  });

  it('rejects an id with leading dot', () => {
    const result = parseFrontmatter({
      ...validFrontmatter,
      id: '.bad',
    });
    expect(result.ok).toBe(false);
  });

  it('rejects duplicate input ids', () => {
    const result = parseFrontmatter({
      ...validFrontmatter,
      inputs: [
        { id: 'dup', type: 'string' },
        { id: 'dup', type: 'number' },
      ],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.error.issues.some((i) => i.message.includes('duplicate input id'))
      ).toBe(true);
    }
  });

  it('rejects an input id that is not a valid identifier', () => {
    const result = parseFrontmatter({
      ...validFrontmatter,
      inputs: [{ id: '1starts-with-digit', type: 'string' }],
    });
    expect(result.ok).toBe(false);
  });

  it('rejects an enum default that is not in options', () => {
    const result = parseFrontmatter({
      ...validFrontmatter,
      inputs: [
        {
          id: 'mode',
          type: 'enum',
          options: ['a', 'b'],
          default: 'c',
        },
      ],
    });
    expect(result.ok).toBe(false);
  });

  it('rejects ui: bundled without a bundledUi manifest', () => {
    const result = parseFrontmatter({
      ...validFrontmatter,
      ui: 'bundled',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.error.issues.some((i) => i.message.includes('bundledUi'))
      ).toBe(true);
    }
  });

  it('accepts ui: bundled with a bundledUi manifest', () => {
    const result = parseFrontmatter({
      ...validFrontmatter,
      ui: 'bundled',
      bundledUi: { entry: 'ui/index.tsx', mount: 'modal' },
    });
    expect(result.ok).toBe(true);
  });

  it('rejects bundledUi when ui is not bundled', () => {
    const result = parseFrontmatter({
      ...validFrontmatter,
      ui: 'inline',
      bundledUi: { entry: 'ui/index.tsx' },
    });
    expect(result.ok).toBe(false);
  });

  it('rejects a script entry with ".." segments', () => {
    const result = parseFrontmatter({
      ...validFrontmatter,
      scripts: { entry: '../escape.py' },
    });
    expect(result.ok).toBe(false);
  });

  it('rejects a script entry with a leading slash', () => {
    const result = parseFrontmatter({
      ...validFrontmatter,
      scripts: { entry: '/abs/path.py' },
    });
    expect(result.ok).toBe(false);
  });

  it('accepts a script entry that is a relative POSIX path', () => {
    const result = parseFrontmatter({
      ...validFrontmatter,
      scripts: { entry: 'scripts/correlate.py', interpreter: 'python3' },
    });
    expect(result.ok).toBe(true);
  });

  it('rejects clip-ref / file inputs that declare a default', () => {
    const result = parseFrontmatter({
      ...validFrontmatter,
      inputs: [{ id: 'clip', type: 'clip-ref', default: 'fake-default' }],
    });
    expect(result.ok).toBe(false);
  });

  it('parseFrontmatterOrThrow throws with a concatenated message', () => {
    expect(() =>
      parseFrontmatterOrThrow({ id: 'x', name: '', description: '' })
    ).toThrow(/invalid skill frontmatter/);
  });

  // ── requires.tools[] / optional[] (Phase 12.3) ─────────────────────────

  it('accepts a bare-string entry in requires.tools[]', () => {
    const result = parseFrontmatter({
      ...validFrontmatter,
      requires: { tools: ['render_clip'] },
    });
    expect(result.ok).toBe(true);
  });

  it('accepts a `{ name, connector: [...] }` entry in requires.tools[]', () => {
    const result = parseFrontmatter({
      ...validFrontmatter,
      requires: {
        tools: [{ name: 'import_subtitle_track', connector: ['resolve'] }],
      },
    });
    expect(result.ok).toBe(true);
  });

  it('accepts requires with both tools[] and optional[]', () => {
    const result = parseFrontmatter({
      ...validFrontmatter,
      requires: {
        tools: ['render_clip'],
        optional: [{ name: 'burn_in_subtitles' }],
      },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.frontmatter.requires?.tools).toHaveLength(1);
      expect(result.frontmatter.requires?.optional).toHaveLength(1);
    }
  });

  it('accepts requires.tools as an empty array (no required tools)', () => {
    // A pure prompt-mode skill may declare no tool requirements explicitly.
    const result = parseFrontmatter({
      ...validFrontmatter,
      requires: { tools: [] },
    });
    expect(result.ok).toBe(true);
  });

  it('rejects the legacy `capabilities[]` key with a migration hint', () => {
    const result = parseFrontmatter({
      ...validFrontmatter,
      requires: {
        tools: ['render_clip'],
        capabilities: ['resolve | premiere'],
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const issue = result.error.issues.find((i) =>
        i.path.join('.').endsWith('capabilities')
      );
      expect(issue).toBeDefined();
      expect(issue?.message).toMatch(/capabilities/i);
      expect(issue?.message).toMatch(/connector/i);
    }
  });

  it('rejects an unrecognized key inside requires', () => {
    const result = parseFrontmatter({
      ...validFrontmatter,
      requires: { tools: ['x'], whatever: 'nope' },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.error.issues.some((i) => i.message.includes('whatever'))
      ).toBe(true);
    }
  });

  it('rejects an empty tool name (bare string)', () => {
    const result = parseFrontmatter({
      ...validFrontmatter,
      requires: { tools: [''] },
    });
    expect(result.ok).toBe(false);
  });

  it('rejects a tool object with an empty name', () => {
    const result = parseFrontmatter({
      ...validFrontmatter,
      requires: { tools: [{ name: '' }] },
    });
    expect(result.ok).toBe(false);
  });

  it('rejects a tool object with an unknown field (e.g. `connectors`)', () => {
    // `.strict()` on the tool object catches the common typo.
    const result = parseFrontmatter({
      ...validFrontmatter,
      requires: {
        tools: [
          { name: 'render_clip', connectors: ['resolve'] } as unknown as object,
        ],
      },
    });
    expect(result.ok).toBe(false);
  });

  it('rejects a tool object whose connector[] contains an empty string', () => {
    const result = parseFrontmatter({
      ...validFrontmatter,
      requires: { tools: [{ name: 'render_clip', connector: [''] }] },
    });
    expect(result.ok).toBe(false);
  });
});
