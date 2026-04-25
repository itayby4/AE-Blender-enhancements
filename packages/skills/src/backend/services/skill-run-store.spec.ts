import { describe, expect, it } from 'vitest';

import type { SkillRunRequest } from '../../contracts/types.js';
import { createSkillRunStore } from './skill-run-store.js';

function makeRequest(skillId: string): SkillRunRequest {
  return { skillId, inputs: {} };
}

describe('createSkillRunStore', () => {
  it('lifecycle transitions: start → finish', () => {
    let id = 0;
    let now = 100;
    const store = createSkillRunStore({
      generateId: () => `run-${++id}`,
      now: () => now,
    });

    const started = store.start(makeRequest('alpha'), 'sess-1');
    expect(started).toMatchObject({
      id: 'run-1',
      skillId: 'alpha',
      sessionId: 'sess-1',
      status: 'running',
      startedAt: 100,
    });

    now = 200;
    const finished = store.finish('run-1');
    expect(finished.status).toBe('succeeded');
    expect(finished.finishedAt).toBe(200);
  });

  it('lifecycle transitions: start → fail captures error', () => {
    const store = createSkillRunStore({ generateId: () => 'run-x' });
    store.start(makeRequest('beta'), null);
    const failed = store.fail('run-x', 'boom');
    expect(failed.status).toBe('failed');
    expect(failed.error).toBe('boom');
  });

  it('finish/fail throw for unknown run ids', () => {
    const store = createSkillRunStore();
    expect(() => store.finish('missing')).toThrow(/not found/);
    expect(() => store.fail('missing', 'x')).toThrow(/not found/);
  });

  it('list returns newest-first and supports skillId filter + limit', () => {
    let counter = 0;
    const store = createSkillRunStore({
      generateId: () => `run-${++counter}`,
    });
    store.start(makeRequest('a'), null);
    store.start(makeRequest('b'), null);
    store.start(makeRequest('a'), null);
    store.start(makeRequest('c'), null);

    const all = store.list();
    expect(all.map((r) => r.id)).toEqual(['run-4', 'run-3', 'run-2', 'run-1']);

    const onlyA = store.list('a');
    expect(onlyA.map((r) => r.id)).toEqual(['run-3', 'run-1']);

    const limited = store.list(undefined, 2);
    expect(limited.map((r) => r.id)).toEqual(['run-4', 'run-3']);
  });

  it('evicts oldest record when capacity is exceeded', () => {
    let counter = 0;
    const store = createSkillRunStore({
      capacity: 2,
      generateId: () => `run-${++counter}`,
    });
    store.start(makeRequest('a'), null);
    store.start(makeRequest('b'), null);
    store.start(makeRequest('c'), null);

    const list = store.list();
    expect(list.map((r) => r.id)).toEqual(['run-3', 'run-2']);
    // run-1 should be gone — finishing it must throw.
    expect(() => store.finish('run-1')).toThrow(/not found/);
  });
});
