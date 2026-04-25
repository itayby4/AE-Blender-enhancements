// ── @pipefx/skills/backend — SKILL.md loader tests ───────────────────────
// Exercises the FS walker against ad-hoc temp directories. Uses node:fs
// directly (no test-only mocks) so the test mirrors the real read path.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';

import {
  loadSkillsFromDir,
  loadSkillFromDir,
} from './skill-md-loader.js';

const validSkillMd = (id: string) =>
  `---
id: ${id}
name: Skill ${id}
description: Test skill ${id}.
---

Body for ${id}.
`;

let tempRoot: string;

beforeEach(() => {
  tempRoot = mkdtempSync(path.join(tmpdir(), 'pipefx-skills-loader-'));
});

afterEach(() => {
  rmSync(tempRoot, { recursive: true, force: true });
});

describe('loadSkillsFromDir', () => {
  it('returns empty result when root does not exist', () => {
    const result = loadSkillsFromDir(path.join(tempRoot, 'nope'));
    expect(result.loaded).toEqual([]);
    expect(result.errors).toEqual([]);
  });

  it('walks one-deep and loads valid skills', () => {
    mkdirSync(path.join(tempRoot, 'alpha'));
    mkdirSync(path.join(tempRoot, 'beta'));
    writeFileSync(
      path.join(tempRoot, 'alpha', 'SKILL.md'),
      validSkillMd('alpha')
    );
    writeFileSync(
      path.join(tempRoot, 'beta', 'SKILL.md'),
      validSkillMd('beta')
    );

    const result = loadSkillsFromDir(tempRoot);
    expect(result.errors).toEqual([]);
    expect(result.loaded.map((s) => s.frontmatter.id).sort()).toEqual([
      'alpha',
      'beta',
    ]);
  });

  it('skips non-directory entries silently', () => {
    writeFileSync(path.join(tempRoot, 'README.txt'), 'not a skill');
    mkdirSync(path.join(tempRoot, 'real'));
    writeFileSync(
      path.join(tempRoot, 'real', 'SKILL.md'),
      validSkillMd('real')
    );

    const result = loadSkillsFromDir(tempRoot);
    expect(result.loaded).toHaveLength(1);
    expect(result.loaded[0]?.frontmatter.id).toBe('real');
    expect(result.errors).toEqual([]);
  });

  it('reports parse errors as per-skill errors, not throws', () => {
    mkdirSync(path.join(tempRoot, 'good'));
    writeFileSync(path.join(tempRoot, 'good', 'SKILL.md'), validSkillMd('good'));

    mkdirSync(path.join(tempRoot, 'bad'));
    writeFileSync(
      path.join(tempRoot, 'bad', 'SKILL.md'),
      '---\nid: bad\n---\nno required fields'
    );

    const result = loadSkillsFromDir(tempRoot);
    expect(result.loaded).toHaveLength(1);
    expect(result.loaded[0]?.frontmatter.id).toBe('good');
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.skillId).toBe('bad');
  });

  it('reports a directory missing SKILL.md as an error', () => {
    mkdirSync(path.join(tempRoot, 'empty'));
    const result = loadSkillsFromDir(tempRoot);
    expect(result.loaded).toEqual([]);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.skillId).toBe('empty');
    expect(result.errors[0]?.message).toMatch(/missing SKILL\.md/);
  });

  it('rejects skills whose frontmatter id mismatches the directory name', () => {
    mkdirSync(path.join(tempRoot, 'dir-name'));
    writeFileSync(
      path.join(tempRoot, 'dir-name', 'SKILL.md'),
      validSkillMd('different-id')
    );
    const result = loadSkillsFromDir(tempRoot);
    expect(result.loaded).toEqual([]);
    expect(result.errors[0]?.message).toMatch(/does not match directory name/);
  });
});

describe('loadSkillFromDir', () => {
  it('threads sourceFile through to the LoadedSkill', () => {
    mkdirSync(path.join(tempRoot, 'one'));
    const mdPath = path.join(tempRoot, 'one', 'SKILL.md');
    writeFileSync(mdPath, validSkillMd('one'));

    const result = loadSkillFromDir(path.join(tempRoot, 'one'));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.loaded.sourceFile).toBe(mdPath);
  });

  it('honors idOverride for cross-checking against the directory name', () => {
    mkdirSync(path.join(tempRoot, 'renamed'));
    writeFileSync(
      path.join(tempRoot, 'renamed', 'SKILL.md'),
      validSkillMd('original-id')
    );
    const result = loadSkillFromDir(path.join(tempRoot, 'renamed'), {
      idOverride: 'renamed',
    });
    expect(result.ok).toBe(false);
  });
});
