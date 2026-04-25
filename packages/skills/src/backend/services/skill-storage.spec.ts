import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { SkillManifest } from '../../contracts/types.js';
import { createSkillStorage } from './skill-storage.js';

function makeManifest(id: string): SkillManifest {
  return {
    schemaVersion: 1,
    id,
    version: '1.0.0',
    name: id,
    description: 'A test skill',
    inputs: [],
    prompt: 'Hello {{world}}',
    requires: { capabilities: [] },
  };
}

describe('createSkillStorage', () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'skills-store-'));
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('persists installed skills under v1/', () => {
    const store = createSkillStorage({ rootDir: root, now: () => 100 });
    const record = store.install(makeManifest('alpha'), {
      source: 'local',
      signed: false,
    });

    expect(record.manifest.id).toBe('alpha');
    expect(record.installedAt).toBe(100);
    expect(store.list()).toHaveLength(1);
    expect(store.get('alpha')).not.toBeNull();

    const indexPath = path.join(root, 'v1', 'index.json');
    const indexJson = JSON.parse(readFileSync(indexPath, 'utf-8'));
    expect(indexJson.schemaVersion).toBe(1);
    expect(indexJson.rows).toHaveLength(1);
    expect(indexJson.rows[0].skillId).toBe('alpha');

    const manifestPath = path.join(root, 'v1', 'alpha', 'manifest.json');
    const manifestJson = JSON.parse(readFileSync(manifestPath, 'utf-8'));
    expect(manifestJson.id).toBe('alpha');
  });

  it('rehydrates installed skills on construction', () => {
    const first = createSkillStorage({ rootDir: root, now: () => 1 });
    first.install(makeManifest('beta'), { source: 'local', signed: false });
    first.install(makeManifest('gamma'), {
      source: 'bundle',
      signed: true,
      fingerprint: 'abc123',
    });

    const second = createSkillStorage({ rootDir: root });
    const list = second.list().map((r) => r.manifest.id).sort();
    expect(list).toEqual(['beta', 'gamma']);
    const gamma = second.get('gamma');
    expect(gamma?.signed).toBe(true);
    expect(gamma?.fingerprint).toBe('abc123');
  });

  it('uninstall removes the row + on-disk directory', () => {
    const store = createSkillStorage({ rootDir: root });
    store.install(makeManifest('delta'), { source: 'local', signed: false });
    expect(store.uninstall('delta')).toBe(true);
    expect(store.get('delta')).toBeNull();
    expect(store.uninstall('delta')).toBe(false);
  });

  it('rejects malformed manifests at install time', () => {
    const store = createSkillStorage({ rootDir: root });
    expect(() =>
      store.install(
        { ...makeManifest('bad'), id: 'has spaces' } as SkillManifest,
        { source: 'local', signed: false }
      )
    ).toThrow();
  });
});
