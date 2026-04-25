// ── @pipefx/skills/domain — template-engine tests ────────────────────────

import { describe, it, expect } from 'vitest';

import { parseManifestOrThrow } from './manifest-schema.js';
import { renderManifestPrompt, renderTemplate } from './template-engine.js';

describe('renderTemplate — substitution', () => {
  it('substitutes a single variable', () => {
    const r = renderTemplate('Hello {{name}}!', { name: 'world' });
    expect(r.text).toBe('Hello world!');
    expect(r.usedVariables).toEqual(['name']);
  });

  it('substitutes numbers and booleans by stringifying', () => {
    const r = renderTemplate('n={{n}} b={{b}}', { n: 42, b: true });
    expect(r.text).toBe('n=42 b=true');
  });

  it('tolerates whitespace inside the delimiters', () => {
    const r = renderTemplate('Hello {{  name  }}!', { name: 'x' });
    expect(r.text).toBe('Hello x!');
  });

  it('throws in strict mode on an undeclared variable', () => {
    expect(() => renderTemplate('Hi {{ghost}}', {})).toThrow(/undeclared variable "ghost"/);
  });

  it('renders blank for an undeclared variable in non-strict mode', () => {
    const r = renderTemplate('Hi {{ghost}}', {}, { strict: false });
    expect(r.text).toBe('Hi ');
  });
});

describe('renderTemplate — comments', () => {
  it('strips author comments before rendering', () => {
    const r = renderTemplate('A{{! note for the next maintainer }}B', {});
    expect(r.text).toBe('AB');
  });

  it('strips multiple comments without affecting substitution', () => {
    const r = renderTemplate(
      '{{! intro }}Hi {{name}}{{! outro }}',
      { name: 'ada' }
    );
    expect(r.text).toBe('Hi ada');
  });
});

describe('renderTemplate — conditional blocks', () => {
  it('includes an {{#if}} block when truthy', () => {
    const r = renderTemplate('{{#if greet}}hi {{name}}{{/if}}', {
      greet: true,
      name: 'ada',
    });
    expect(r.text).toBe('hi ada');
  });

  it('drops an {{#if}} block when falsy', () => {
    const r = renderTemplate('{{#if greet}}hi{{/if}}done', { greet: false });
    expect(r.text).toBe('done');
  });

  it('treats empty strings as falsy', () => {
    const r = renderTemplate('{{#if note}}has note{{/if}}', { note: '' });
    expect(r.text).toBe('');
  });

  it('treats zero as falsy', () => {
    const r = renderTemplate('{{#if count}}got {{count}}{{/if}}', { count: 0 });
    expect(r.text).toBe('');
  });

  it('inverts with {{#unless}}', () => {
    const r = renderTemplate('{{#unless silent}}speaking{{/unless}}', {
      silent: false,
    });
    expect(r.text).toBe('speaking');
  });

  it('rejects nested blocks of the same kind with a clear error', () => {
    expect(() =>
      renderTemplate('{{#if a}}{{#if b}}x{{/if}}{{/if}}', { a: true, b: true })
    ).toThrow(/nested .* blocks are not supported/);
  });

  it('rejects an unmatched block tag', () => {
    expect(() => renderTemplate('{{#if a}}oops', { a: true })).toThrow(
      /unmatched block tag/
    );
  });
});

describe('renderManifestPrompt', () => {
  const manifest = parseManifestOrThrow({
    schemaVersion: 1,
    id: 'demo',
    version: '1.0.0',
    name: 'Demo',
    description: 'Demo skill.',
    inputs: [
      { name: 'tone', type: 'string', default: 'cheerful' },
      { name: 'mention_user', type: 'boolean' },
      { name: 'user', type: 'string' },
    ],
    prompt:
      'Write in a {{tone}} tone.{{#if mention_user}} Greet {{user}} by name.{{/if}}',
    requires: { capabilities: [] },
  });

  it('falls back to declared defaults when a value is omitted', () => {
    const r = renderManifestPrompt(manifest, { mention_user: false, user: '' });
    expect(r.text).toBe('Write in a cheerful tone.');
  });

  it('lets the caller override declared defaults', () => {
    const r = renderManifestPrompt(manifest, {
      tone: 'somber',
      mention_user: true,
      user: 'Ada',
    });
    expect(r.text).toBe('Write in a somber tone. Greet Ada by name.');
  });

  it('reports usedVariables for the dry-run UI', () => {
    const r = renderManifestPrompt(manifest, {
      mention_user: true,
      user: 'Ada',
    });
    expect(new Set(r.usedVariables)).toEqual(new Set(['tone', 'mention_user', 'user']));
  });

  it('does not throw on an undeclared {{var}} that is declared on the manifest but missing from values', () => {
    // `tone` has a default, so it should resolve even without passing the value.
    const r = renderManifestPrompt(manifest, { mention_user: false, user: '' });
    expect(r.text).toContain('cheerful');
  });
});
