// ── @pipefx/skills/backend — v2 SkillStore tests ─────────────────────────
// Drives the storage layer through a real temp directory: install →
// list → get → uninstall → reload-from-disk. Mirrors the v1 store's
// test approach so future migrations can compare behavior side-by-side.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';

import { parseSkillMdOrThrow } from '../../domain/skill-md-parser.js';
import { createSkillMdStorage } from './skill-md-storage.js';

const subtitlesSkillMd = `---
id: subtitles
name: Generate Subtitles
description: Render a clip, transcribe, and import.
category: post-production
triggers:
  - subtitle*
  - "/subtitles"
requires:
  tools:
    - render_clip
    - import_subtitle_track
  capabilities:
    - resolve | premiere
inputs:
  - id: clipId
    type: clip-ref
    label: Clip
    required: true
  - id: targetLang
    type: enum
    options:
      - en
      - he
    default: en
ui: inline
---

# Generate Subtitles

This is the prompt body the model sees.
`;

let rootDir: string;

beforeEach(() => {
  rootDir = mkdtempSync(path.join(tmpdir(), 'pipefx-skills-md-store-'));
});

afterEach(() => {
  rmSync(rootDir, { recursive: true, force: true });
});

describe('createSkillMdStorage', () => {
  it('install + list + get round-trip', () => {
    const store = createSkillMdStorage({ rootDir, now: () => 1000 });
    const loaded = parseSkillMdOrThrow(subtitlesSkillMd);

    const installed = store.install(loaded, {
      source: 'local',
      signed: false,
    });

    expect(installed.installedAt).toBe(1000);
    expect(installed.source).toBe('local');
    expect(installed.signed).toBe(false);
    expect(store.list()).toHaveLength(1);
    expect(store.get('subtitles')?.loaded.frontmatter.id).toBe('subtitles');
    expect(store.get('does-not-exist')).toBeNull();
  });

  it('persists SKILL.md to disk in the v2 subdirectory', () => {
    const store = createSkillMdStorage({ rootDir });
    store.install(parseSkillMdOrThrow(subtitlesSkillMd), {
      source: 'local',
      signed: false,
    });

    const skillMdPath = path.join(
      rootDir,
      'v2',
      'subtitles',
      'SKILL.md'
    );
    expect(existsSync(skillMdPath)).toBe(true);
    const persisted = readFileSync(skillMdPath, 'utf-8');
    expect(persisted).toMatch(/^---\n/);
    expect(persisted).toMatch(/id: subtitles/);
    expect(persisted).toMatch(/Generate Subtitles/);
  });

  it('writes resources alongside SKILL.md and rejects unsafe paths', () => {
    const store = createSkillMdStorage({ rootDir });
    store.install(parseSkillMdOrThrow(subtitlesSkillMd), {
      source: 'bundle',
      signed: false,
      resources: [
        {
          path: 'scripts/run.py',
          content: new TextEncoder().encode('print("hi")\n'),
        },
      ],
    });

    const scriptPath = path.join(
      rootDir,
      'v2',
      'subtitles',
      'scripts',
      'run.py'
    );
    expect(existsSync(scriptPath)).toBe(true);
    expect(readFileSync(scriptPath, 'utf-8')).toContain('print("hi")');

    expect(() =>
      store.install(parseSkillMdOrThrow(subtitlesSkillMd), {
        source: 'bundle',
        signed: false,
        resources: [
          { path: '../../escape', content: new TextEncoder().encode('x') },
        ],
      })
    ).toThrow(/unsafe resource path/);
  });

  it('uninstall removes the directory and the index row', () => {
    const store = createSkillMdStorage({ rootDir });
    store.install(parseSkillMdOrThrow(subtitlesSkillMd), {
      source: 'local',
      signed: false,
    });

    const skillDir = path.join(rootDir, 'v2', 'subtitles');
    expect(existsSync(skillDir)).toBe(true);

    expect(store.uninstall('subtitles')).toBe(true);
    expect(existsSync(skillDir)).toBe(false);
    expect(store.list()).toEqual([]);
    expect(store.uninstall('subtitles')).toBe(false);
  });

  it('reload-from-disk picks up persisted skills', () => {
    const original = createSkillMdStorage({ rootDir, now: () => 5000 });
    original.install(parseSkillMdOrThrow(subtitlesSkillMd), {
      source: 'remote',
      signed: true,
      fingerprint: 'a1b2c3d4',
    });

    // New store on the same directory — bootstrap should rehydrate.
    const reloaded = createSkillMdStorage({ rootDir });
    const skill = reloaded.get('subtitles');
    expect(skill).not.toBeNull();
    expect(skill?.installedAt).toBe(5000);
    expect(skill?.source).toBe('remote');
    expect(skill?.signed).toBe(true);
    expect(skill?.fingerprint).toBe('a1b2c3d4');
  });

  it('drops index rows whose SKILL.md disappeared', () => {
    const store = createSkillMdStorage({ rootDir });
    store.install(parseSkillMdOrThrow(subtitlesSkillMd), {
      source: 'local',
      signed: false,
    });

    // Simulate a partial cleanup: remove the SKILL.md but leave the
    // directory + index row.
    rmSync(path.join(rootDir, 'v2', 'subtitles', 'SKILL.md'), {
      force: true,
    });

    const reloaded = createSkillMdStorage({ rootDir });
    expect(reloaded.list()).toHaveLength(0);
    expect(reloaded.get('subtitles')).toBeNull();
  });

  it('canonicalizes SKILL.md on install (re-parses cleanly)', () => {
    const store = createSkillMdStorage({ rootDir });
    store.install(parseSkillMdOrThrow(subtitlesSkillMd), {
      source: 'local',
      signed: false,
    });

    const persistedPath = path.join(
      rootDir,
      'v2',
      'subtitles',
      'SKILL.md'
    );
    const persisted = readFileSync(persistedPath, 'utf-8');
    // Re-parse the canonical form. It must still validate and carry the
    // same frontmatter id.
    const reparsed = parseSkillMdOrThrow(persisted);
    expect(reparsed.frontmatter.id).toBe('subtitles');
    expect(reparsed.frontmatter.inputs).toHaveLength(2);
    expect(reparsed.body.trim()).toContain('Generate Subtitles');
  });
});
