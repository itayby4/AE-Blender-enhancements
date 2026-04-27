// ── @pipefx/skills/backend — v2 SkillStore tests ─────────────────────────
// Drives the storage layer through real temp directories: install →
// list → get → uninstall → reload-from-disk, plus the two-root merge
// (built-in vs user) added in Phase 12.6.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
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
    - name: import_subtitle_track
      connector:
        - resolve
        - premiere
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

const builtinSkillMd = `---
id: builtin-hello
name: Built-in Hello
description: Ships with the desktop.
ui: inline
---

# Hello from a built-in skill.
`;

let userRoot: string;
let builtinRoot: string;

beforeEach(() => {
  userRoot = mkdtempSync(path.join(tmpdir(), 'pipefx-skills-md-user-'));
  builtinRoot = mkdtempSync(path.join(tmpdir(), 'pipefx-skills-md-builtin-'));
});

afterEach(() => {
  rmSync(userRoot, { recursive: true, force: true });
  rmSync(builtinRoot, { recursive: true, force: true });
});

function seedBuiltin(id: string, source: string): void {
  const dir = path.join(builtinRoot, id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'SKILL.md'), source, 'utf-8');
}

describe('createSkillMdStorage', () => {
  it('install + list + get round-trip (user root only)', () => {
    const store = createSkillMdStorage({ userRoot, now: () => 1000 });
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
    const store = createSkillMdStorage({ userRoot });
    store.install(parseSkillMdOrThrow(subtitlesSkillMd), {
      source: 'local',
      signed: false,
    });

    const skillMdPath = path.join(
      userRoot,
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
    const store = createSkillMdStorage({ userRoot });
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
      userRoot,
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
    const store = createSkillMdStorage({ userRoot });
    store.install(parseSkillMdOrThrow(subtitlesSkillMd), {
      source: 'local',
      signed: false,
    });

    const skillDir = path.join(userRoot, 'v2', 'subtitles');
    expect(existsSync(skillDir)).toBe(true);

    expect(store.uninstall('subtitles')).toBe(true);
    expect(existsSync(skillDir)).toBe(false);
    expect(store.list()).toEqual([]);
    expect(store.uninstall('subtitles')).toBe(false);
  });

  it('reload-from-disk picks up persisted skills', () => {
    const original = createSkillMdStorage({ userRoot, now: () => 5000 });
    original.install(parseSkillMdOrThrow(subtitlesSkillMd), {
      source: 'remote',
      signed: true,
      fingerprint: 'a1b2c3d4',
    });

    // New store on the same directory — bootstrap should rehydrate.
    const reloaded = createSkillMdStorage({ userRoot });
    const skill = reloaded.get('subtitles');
    expect(skill).not.toBeNull();
    expect(skill?.installedAt).toBe(5000);
    expect(skill?.source).toBe('remote');
    expect(skill?.signed).toBe(true);
    expect(skill?.fingerprint).toBe('a1b2c3d4');
  });

  it('drops index rows whose SKILL.md disappeared', () => {
    const store = createSkillMdStorage({ userRoot });
    store.install(parseSkillMdOrThrow(subtitlesSkillMd), {
      source: 'local',
      signed: false,
    });

    rmSync(path.join(userRoot, 'v2', 'subtitles', 'SKILL.md'), {
      force: true,
    });

    const reloaded = createSkillMdStorage({ userRoot });
    expect(reloaded.list()).toHaveLength(0);
    expect(reloaded.get('subtitles')).toBeNull();
  });

  it('canonicalizes SKILL.md on install (re-parses cleanly)', () => {
    const store = createSkillMdStorage({ userRoot });
    store.install(parseSkillMdOrThrow(subtitlesSkillMd), {
      source: 'local',
      signed: false,
    });

    const persistedPath = path.join(
      userRoot,
      'v2',
      'subtitles',
      'SKILL.md'
    );
    const persisted = readFileSync(persistedPath, 'utf-8');
    const reparsed = parseSkillMdOrThrow(persisted);
    expect(reparsed.frontmatter.id).toBe('subtitles');
    expect(reparsed.frontmatter.inputs).toHaveLength(2);
    expect(reparsed.body.trim()).toContain('Generate Subtitles');
  });

  // ── Two-root merge (Phase 12.6) ──────────────────────────────────────

  it('list() merges builtin + user roots; user shadows builtin', () => {
    seedBuiltin('builtin-hello', builtinSkillMd);
    seedBuiltin('shadowed', builtinSkillMd.replace('builtin-hello', 'shadowed'));

    const store = createSkillMdStorage({ userRoot, builtinRoot });
    expect(store.list().map((s) => s.loaded.frontmatter.id).sort()).toEqual([
      'builtin-hello',
      'shadowed',
    ]);
    expect(store.get('builtin-hello')?.source).toBe('builtin');

    // Install a user skill with the same id as a built-in — user wins.
    const shadowingMd = builtinSkillMd
      .replace('builtin-hello', 'shadowed')
      .replace('Built-in Hello', 'User Override');
    store.install(parseSkillMdOrThrow(shadowingMd), {
      source: 'local',
      signed: false,
    });

    const merged = store.list();
    expect(merged).toHaveLength(2);
    const shadowed = merged.find((s) => s.loaded.frontmatter.id === 'shadowed');
    expect(shadowed?.source).toBe('local');
    expect(shadowed?.loaded.frontmatter.name).toBe('User Override');
  });

  it('uninstall is a no-op for builtin-only skills', () => {
    seedBuiltin('builtin-hello', builtinSkillMd);
    const store = createSkillMdStorage({ userRoot, builtinRoot });
    expect(store.uninstall('builtin-hello')).toBe(false);
    expect(store.get('builtin-hello')?.source).toBe('builtin');
  });

  it('refuses to install with source: "builtin"', () => {
    const store = createSkillMdStorage({ userRoot });
    expect(() =>
      store.install(parseSkillMdOrThrow(subtitlesSkillMd), {
        source: 'builtin',
        signed: true,
      })
    ).toThrow(/cannot persist a builtin skill/);
  });

  it('uninstalling a shadowing user skill reveals the built-in again', () => {
    seedBuiltin('shadowed', builtinSkillMd.replace('builtin-hello', 'shadowed'));
    const store = createSkillMdStorage({ userRoot, builtinRoot });

    const userMd = builtinSkillMd
      .replace('builtin-hello', 'shadowed')
      .replace('Built-in Hello', 'User Override');
    store.install(parseSkillMdOrThrow(userMd), {
      source: 'local',
      signed: false,
    });
    expect(store.get('shadowed')?.source).toBe('local');

    expect(store.uninstall('shadowed')).toBe(true);
    expect(store.get('shadowed')?.source).toBe('builtin');
  });
});
