// ── @pipefx/skills/domain — SKILL.md parser tests ────────────────────────
// Exercises the frontmatter/body split, YAML decode, and the round-trip
// from raw source string to LoadedSkill.

import { describe, it, expect } from 'vitest';

import {
  parseSkillMd,
  parseSkillMdOrThrow,
} from './skill-md-parser.js';

const minimalSource = `---
id: minimal
name: Minimal
description: Bare-bones skill.
---

# Body

The model sees this verbatim.
`;

describe('parseSkillMd', () => {
  it('parses a minimal SKILL.md round-trip', () => {
    const result = parseSkillMd(minimalSource);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.loaded.frontmatter.id).toBe('minimal');
      expect(result.loaded.body).toContain('# Body');
      expect(result.loaded.body).toContain('verbatim');
    }
  });

  it('preserves body content exactly (including leading blank line)', () => {
    const result = parseSkillMdOrThrow(minimalSource);
    // The opening blank line after `---` is consumed; subsequent content
    // including the blank line between `---` and `# Body` survives.
    expect(result.body.startsWith('\n# Body')).toBe(true);
  });

  it('threads sourceFile through to LoadedSkill', () => {
    const result = parseSkillMd(minimalSource, {
      sourceFile: '/abs/path/SKILL.md',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.loaded.sourceFile).toBe('/abs/path/SKILL.md');
    }
  });

  it('handles a UTF-8 BOM at the start of the source', () => {
    const result = parseSkillMd('﻿' + minimalSource);
    expect(result.ok).toBe(true);
  });

  it('handles CRLF line endings', () => {
    const crlf = minimalSource.replace(/\n/g, '\r\n');
    const result = parseSkillMd(crlf);
    expect(result.ok).toBe(true);
  });

  it('reports missing-frontmatter when source has no `---` opener', () => {
    const result = parseSkillMd('# Just a markdown body\n');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('missing-frontmatter');
    }
  });

  it('reports unterminated-frontmatter when no closing delimiter', () => {
    const result = parseSkillMd('---\nid: oops\nname: x\ndescription: y\n');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('unterminated-frontmatter');
    }
  });

  it('accepts `...` as a closing delimiter', () => {
    const dotDot = `---
id: dots
name: Dots
description: Closes with ellipsis.
...

body
`;
    const result = parseSkillMd(dotDot);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.loaded.body.trim()).toBe('body');
    }
  });

  it('reports invalid-yaml on malformed frontmatter', () => {
    const bad = `---
id: x
name: : bad : colons :
---
body
`;
    const result = parseSkillMd(bad);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(['invalid-yaml', 'invalid-frontmatter']).toContain(
        result.error.kind
      );
    }
  });

  it('reports invalid-frontmatter when YAML decodes but Zod rejects', () => {
    const missingFields = `---
id: x
---
body
`;
    const result = parseSkillMd(missingFields);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('invalid-frontmatter');
    }
  });

  it('reports invalid-frontmatter on empty frontmatter block', () => {
    const empty = `---
---
body
`;
    const result = parseSkillMd(empty);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('invalid-frontmatter');
    }
  });

  it('parseSkillMdOrThrow throws on parse error', () => {
    expect(() => parseSkillMdOrThrow('no frontmatter\n')).toThrow(
      /failed to parse SKILL.md/
    );
  });
});
