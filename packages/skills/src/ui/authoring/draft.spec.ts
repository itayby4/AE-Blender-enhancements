// ── @pipefx/skills/ui — authoring draft tests ────────────────────────────
// Unit-tests the pure helpers backing `useSkillDraft`. The React hook
// itself isn't tested here (the package's vitest env is node, not jsdom),
// but every meaningful piece of logic lives in these helpers — the hook
// is just `useState` + `useMemo` glue.

import { describe, it, expect } from 'vitest';

import type { SkillManifest } from '../../contracts/types.js';
import {
  draftToManifestInput,
  emptyDraft,
  emptyDraftCapability,
  emptyDraftInput,
  extractTemplateVariables,
  manifestToDraft,
  synthesizeSampleValues,
  validateDraft,
  type SkillDraft,
} from './draft.js';

// ── Helpers ──────────────────────────────────────────────────────────────

function validDraft(overrides: Partial<SkillDraft> = {}): SkillDraft {
  const draft = emptyDraft();
  draft.id = 'test.skill';
  draft.version = '0.1.0';
  draft.name = 'Test Skill';
  draft.description = 'A skill that exists for testing.';
  draft.prompt = 'Hello from the test skill.';
  return { ...draft, ...overrides };
}

function manifestRoundTrips(draft: SkillDraft): SkillManifest {
  const result = validateDraft(draft);
  if (!result.ok) {
    throw new Error(
      `expected valid draft but got errors: ${JSON.stringify(result.errors)}`
    );
  }
  if (!result.manifest) throw new Error('expected manifest on success');
  return result.manifest;
}

// ── emptyDraft / constructors ────────────────────────────────────────────

describe('emptyDraft', () => {
  it('produces a clean draft with empty arrays and a default version', () => {
    const d = emptyDraft();
    expect(d.id).toBe('');
    expect(d.version).toBe('0.1.0');
    expect(d.inputs).toEqual([]);
    expect(d.capabilities).toEqual([]);
  });
});

describe('emptyDraftInput / emptyDraftCapability', () => {
  it('mints unique row ids per call so React keys are stable', () => {
    const a = emptyDraftInput();
    const b = emptyDraftInput();
    expect(a.rowId).not.toBe(b.rowId);
    const c = emptyDraftCapability();
    const d = emptyDraftCapability();
    expect(c.rowId).not.toBe(d.rowId);
  });

  it('defaults string-type input to non-required with no default', () => {
    const i = emptyDraftInput();
    expect(i.type).toBe('string');
    expect(i.required).toBe(false);
    expect(i.defaultRaw).toBe('');
  });
});

// ── validateDraft ────────────────────────────────────────────────────────

describe('validateDraft', () => {
  it('flags an empty draft with the expected field errors', () => {
    const result = validateDraft(emptyDraft());
    expect(result.ok).toBe(false);
    // id and name are required strings — they should appear in the error map.
    expect(result.errors).toHaveProperty('id');
    expect(result.errors).toHaveProperty('name');
    expect(result.errors).toHaveProperty('description');
    expect(result.errors).toHaveProperty('prompt');
  });

  it('accepts a minimal valid draft', () => {
    const result = validateDraft(validDraft());
    expect(result.ok).toBe(true);
    expect(result.manifest?.id).toBe('test.skill');
  });

  it('rejects a malformed semver', () => {
    const result = validateDraft(validDraft({ version: 'not-a-version' }));
    expect(result.ok).toBe(false);
    expect(result.errors.version).toBeTruthy();
  });

  it('rejects an enum input whose default is not in options', () => {
    const draft = validDraft();
    draft.inputs = [
      {
        ...emptyDraftInput(),
        name: 'mode',
        type: 'enum',
        optionsRaw: 'fast\nbalanced\nthorough',
        defaultRaw: 'turbo',
      },
    ];
    const result = validateDraft(draft);
    expect(result.ok).toBe(false);
    // The error path lands on the per-row default field.
    expect(Object.keys(result.errors).some((k) => k.includes('default'))).toBe(
      true
    );
  });

  it('rejects an empty capability requirement (no connectorId or toolName)', () => {
    const draft = validDraft();
    draft.capabilities = [
      { ...emptyDraftCapability(), description: 'just a description' },
    ];
    const result = validateDraft(draft);
    expect(result.ok).toBe(false);
    expect(
      Object.keys(result.errors).some((k) => k.startsWith('requires.capabilities'))
    ).toBe(true);
  });
});

// ── draftToManifestInput coercions ───────────────────────────────────────

describe('draftToManifestInput', () => {
  it('drops empty optional identity fields rather than emitting empty strings', () => {
    const draft = validDraft();
    const out = draftToManifestInput(draft) as Record<string, unknown>;
    expect(out).not.toHaveProperty('category');
    expect(out).not.toHaveProperty('icon');
    expect(out).not.toHaveProperty('author');
  });

  it('emits author when authorName is non-empty', () => {
    const draft = validDraft({ authorName: 'Ada Lovelace' });
    const out = draftToManifestInput(draft) as Record<string, unknown>;
    expect(out).toHaveProperty('author');
    expect((out.author as Record<string, unknown>).name).toBe('Ada Lovelace');
  });

  it('coerces a number input default through Number()', () => {
    const draft = validDraft();
    draft.inputs = [
      {
        ...emptyDraftInput(),
        name: 'count',
        type: 'number',
        defaultRaw: '42',
      },
    ];
    const manifest = manifestRoundTrips(draft);
    expect(manifest.inputs[0].default).toBe(42);
  });

  it('parses boolean defaults from common string forms', () => {
    const cases: Array<[string, boolean]> = [
      ['true', true],
      ['false', false],
      ['yes', true],
      ['no', false],
      ['1', true],
      ['0', false],
    ];
    for (const [raw, expected] of cases) {
      const draft = validDraft();
      draft.inputs = [
        {
          ...emptyDraftInput(),
          name: 'flag',
          type: 'boolean',
          defaultRaw: raw,
        },
      ];
      const manifest = manifestRoundTrips(draft);
      expect(manifest.inputs[0].default).toBe(expected);
    }
  });

  it('parses enum options from comma- AND newline-separated input', () => {
    const draft = validDraft();
    draft.inputs = [
      {
        ...emptyDraftInput(),
        name: 'mode',
        type: 'enum',
        optionsRaw: 'fast, balanced\nthorough',
        defaultRaw: 'balanced',
      },
    ];
    const manifest = manifestRoundTrips(draft);
    expect(manifest.inputs[0].options).toEqual(['fast', 'balanced', 'thorough']);
    expect(manifest.inputs[0].default).toBe('balanced');
  });

  it('treats whitespace-only defaultRaw as undefined', () => {
    const draft = validDraft();
    draft.inputs = [
      {
        ...emptyDraftInput(),
        name: 'note',
        type: 'string',
        defaultRaw: '',
      },
    ];
    const manifest = manifestRoundTrips(draft);
    expect(manifest.inputs[0].default).toBeUndefined();
  });
});

// ── manifestToDraft round-trip ───────────────────────────────────────────

describe('manifestToDraft', () => {
  it('round-trips a manifest through draft form', () => {
    const original: SkillManifest = {
      schemaVersion: 1,
      id: 'rt.skill',
      version: '1.2.3',
      name: 'Round Trip',
      description: 'A skill for round-trip testing.',
      category: 'analysis',
      icon: 'sparkles',
      author: { name: 'Ada' },
      inputs: [
        {
          name: 'language',
          type: 'enum',
          options: ['en', 'fr', 'de'],
          default: 'en',
          required: true,
        },
        { name: 'count', type: 'number', default: 5 },
      ],
      prompt: 'Translate to {{language}} ({{count}} variants).',
      requires: { capabilities: [{ toolName: 'translate' }] },
    };
    const draft = manifestToDraft(original);
    const result = validateDraft(draft);
    expect(result.ok).toBe(true);
    expect(result.manifest).toBeDefined();
    // Field-by-field equivalence — author preserved, options preserved as
    // a sorted list, defaults coerced back to the original types.
    expect(result.manifest!.id).toBe(original.id);
    expect(result.manifest!.version).toBe(original.version);
    expect(result.manifest!.author?.name).toBe('Ada');
    expect(result.manifest!.inputs[0].options).toEqual(['en', 'fr', 'de']);
    expect(result.manifest!.inputs[1].default).toBe(5);
  });
});

// ── extractTemplateVariables ─────────────────────────────────────────────

describe('extractTemplateVariables', () => {
  it('returns each variable once, marking undeclared ones', () => {
    const refs = extractTemplateVariables(
      'Hello {{name}}, please run {{action}} {{name}}.',
      [{ name: 'name' }]
    );
    expect(refs).toHaveLength(2);
    const byName = Object.fromEntries(refs.map((r) => [r.name, r.undeclared]));
    expect(byName.name).toBe(false);
    expect(byName.action).toBe(true);
  });

  it('picks up variables inside #if / #unless blocks', () => {
    const refs = extractTemplateVariables(
      '{{#if verbose}}…{{/if}}{{#unless quiet}}…{{/unless}}',
      []
    );
    expect(refs.map((r) => r.name).sort()).toEqual(['quiet', 'verbose']);
  });

  it('is reentrant — calling twice yields the same answer', () => {
    const a = extractTemplateVariables('{{x}} {{y}}', []);
    const b = extractTemplateVariables('{{x}} {{y}}', []);
    expect(a).toEqual(b);
  });
});

// ── synthesizeSampleValues ───────────────────────────────────────────────

describe('synthesizeSampleValues', () => {
  it('uses overrides when provided', () => {
    const out = synthesizeSampleValues(
      [{ name: 'count', type: 'number', default: 1 }],
      { count: 99 }
    );
    expect(out.count).toBe(99);
  });

  it('falls back to declared defaults', () => {
    const out = synthesizeSampleValues([
      { name: 'count', type: 'number', default: 7 },
    ]);
    expect(out.count).toBe(7);
  });

  it('synthesizes type-appropriate placeholders when no default exists', () => {
    const out = synthesizeSampleValues([
      { name: 's', type: 'string' },
      { name: 'n', type: 'number' },
      { name: 'b', type: 'boolean' },
      { name: 'e', type: 'enum', options: ['a', 'b'] },
    ]);
    expect(out.s).toBe('<s>');
    expect(out.n).toBe(0);
    expect(out.b).toBe(false);
    expect(out.e).toBe('a');
  });
});
