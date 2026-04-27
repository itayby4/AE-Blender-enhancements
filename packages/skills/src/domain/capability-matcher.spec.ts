// ── @pipefx/skills/domain — capability matcher tests ────────────────────
// Two layers: pure helpers (`isToolSatisfied`, `computeAvailability`) get
// table-driven coverage; the reactive `createCapabilityMatcher` gets
// integration tests against a real `@pipefx/event-bus` instance and a
// hand-rolled in-memory store. No filesystem, no fake timers — the matcher
// has no time-based behavior of its own.

import type {
  McpEventMap,
  ToolDescriptor,
} from '@pipefx/connectors-contracts';
import { createEventBus, type EventBus } from '@pipefx/event-bus';
import { describe, it, expect } from 'vitest';

import type {
  InstalledSkill,
  SkillAvailability,
  SkillStore,
} from '../contracts/api.js';
import type { SkillEventMap } from '../contracts/events.js';
import type {
  LoadedSkill,
  SkillFrontmatter,
  SkillRequires,
} from '../contracts/skill-md.js';

import {
  computeAvailability,
  createCapabilityMatcher,
  isToolSatisfied,
} from './capability-matcher.js';

// ── Helpers ──────────────────────────────────────────────────────────────

type Bus = EventBus<McpEventMap & SkillEventMap>;

const tool = (
  name: string,
  connectorId: ToolDescriptor['connectorId'] = 'resolve'
): ToolDescriptor => ({
  name,
  connectorId,
  inputSchema: {},
});

function makeFrontmatter(
  id: string,
  requires?: SkillRequires
): SkillFrontmatter {
  return {
    id,
    name: id,
    description: `${id} test skill`,
    requires,
  };
}

function makeSkill(
  id: string,
  requires?: SkillRequires
): InstalledSkill {
  const loaded: LoadedSkill = {
    frontmatter: makeFrontmatter(id, requires),
    body: '',
  };
  return {
    loaded,
    source: 'local',
    signed: false,
    installedAt: 0,
    installPath: `/fake/${id}`,
  };
}

/** Minimal in-memory store. The matcher only calls `list()`, but the rest
 *  of `SkillStore` must type-check. */
function makeStore(initial: InstalledSkill[] = []): SkillStore & {
  set(skills: InstalledSkill[]): void;
} {
  let skills = [...initial];
  return {
    list: () => skills,
    get: (id) => skills.find((s) => s.loaded.frontmatter.id === id) ?? null,
    install: () => {
      throw new Error('not used in this test');
    },
    uninstall: () => false,
    set(next) {
      skills = [...next];
    },
  };
}

// ── isToolSatisfied (pure) ───────────────────────────────────────────────

describe('isToolSatisfied', () => {
  it('bare-string requirement matches any connector exposing the tool', () => {
    expect(isToolSatisfied('render_clip', [tool('render_clip', 'resolve')])).toBe(
      true
    );
    expect(
      isToolSatisfied('render_clip', [tool('render_clip', 'premiere')])
    ).toBe(true);
    expect(isToolSatisfied('render_clip', [tool('other')])).toBe(false);
    expect(isToolSatisfied('render_clip', [])).toBe(false);
  });

  it('object requirement without connector[] matches any connector', () => {
    expect(
      isToolSatisfied(
        { name: 'render_clip' },
        [tool('render_clip', 'premiere')]
      )
    ).toBe(true);
  });

  it('object requirement with empty connector[] is treated as any', () => {
    expect(
      isToolSatisfied(
        { name: 'render_clip', connector: [] },
        [tool('render_clip', 'premiere')]
      )
    ).toBe(true);
  });

  it('object requirement with connector[] only matches listed connectors', () => {
    const req = {
      name: 'import_subtitle_track',
      connector: ['resolve', 'premiere'],
    };
    expect(
      isToolSatisfied(req, [tool('import_subtitle_track', 'resolve')])
    ).toBe(true);
    expect(
      isToolSatisfied(req, [tool('import_subtitle_track', 'premiere')])
    ).toBe(true);
    expect(
      isToolSatisfied(req, [tool('import_subtitle_track', 'final-cut')])
    ).toBe(false);
  });

  it('returns false when the tool name does not match', () => {
    expect(
      isToolSatisfied(
        { name: 'import_subtitle_track', connector: ['resolve'] },
        [tool('render_clip', 'resolve')]
      )
    ).toBe(false);
  });
});

// ── computeAvailability (pure) ───────────────────────────────────────────

describe('computeAvailability', () => {
  it('marks a skill with no requires.tools[] as runnable', () => {
    const skills = [makeSkill('no-reqs')];
    const result = computeAvailability(skills, []);
    expect(result).toEqual<ReadonlyArray<SkillAvailability>>([
      {
        skillId: 'no-reqs',
        runnable: true,
        missing: [],
        optionalPresent: [],
      },
    ]);
  });

  it('marks a skill runnable when every required tool is present', () => {
    const skills = [
      makeSkill('subs', {
        tools: [
          'render_clip',
          { name: 'import_subtitle_track', connector: ['resolve'] },
        ],
      }),
    ];
    const tools = [
      tool('render_clip', 'resolve'),
      tool('import_subtitle_track', 'resolve'),
    ];
    const [snapshot] = computeAvailability(skills, tools);
    expect(snapshot.runnable).toBe(true);
    expect(snapshot.missing).toEqual([]);
  });

  it('reports the missing entries (not just the count) when something is absent', () => {
    const skills = [
      makeSkill('subs', {
        tools: [
          'render_clip',
          { name: 'import_subtitle_track', connector: ['resolve'] },
        ],
      }),
    ];
    const [snapshot] = computeAvailability(skills, [
      tool('render_clip', 'resolve'),
    ]);
    expect(snapshot.runnable).toBe(false);
    expect(snapshot.missing).toEqual([
      { name: 'import_subtitle_track', connector: ['resolve'] },
    ]);
  });

  it('treats a connector[]-mismatch as missing', () => {
    const skills = [
      makeSkill('subs', {
        tools: [{ name: 'import_subtitle_track', connector: ['resolve'] }],
      }),
    ];
    // Tool exists, but on a connector the skill does not allow.
    const [snapshot] = computeAvailability(skills, [
      tool('import_subtitle_track', 'premiere'),
    ]);
    expect(snapshot.runnable).toBe(false);
    expect(snapshot.missing).toHaveLength(1);
  });

  it('reports optionalPresent accurately and does not gate runnability on it', () => {
    const skills = [
      makeSkill('subs', {
        tools: ['render_clip'],
        optional: ['burn_in_subtitles', 'translate'],
      }),
    ];
    const [snapshot] = computeAvailability(skills, [
      tool('render_clip', 'resolve'),
      tool('burn_in_subtitles', 'resolve'),
      // `translate` not present.
    ]);
    expect(snapshot.runnable).toBe(true);
    expect(snapshot.optionalPresent).toEqual(['burn_in_subtitles']);
  });

  it('returns one entry per skill, in input order', () => {
    const skills = [makeSkill('a'), makeSkill('b'), makeSkill('c')];
    const result = computeAvailability(skills, []);
    expect(result.map((r) => r.skillId)).toEqual(['a', 'b', 'c']);
  });
});

// ── createCapabilityMatcher (reactive) ───────────────────────────────────

describe('createCapabilityMatcher', () => {
  it('computes an initial snapshot eagerly from the store + initialTools', () => {
    const store = makeStore([
      makeSkill('subs', { tools: ['render_clip'] }),
    ]);
    const bus: Bus = createEventBus();
    const matcher = createCapabilityMatcher({
      store,
      bus,
      initialTools: [tool('render_clip', 'resolve')],
    });

    const [snapshot] = matcher.snapshot();
    expect(snapshot.skillId).toBe('subs');
    expect(snapshot.runnable).toBe(true);
    matcher.dispose();
  });

  it('recomputes on `mcp.tools.changed` and notifies local listeners', async () => {
    const store = makeStore([
      makeSkill('subs', { tools: ['render_clip'] }),
    ]);
    const bus: Bus = createEventBus();
    const matcher = createCapabilityMatcher({ store, bus });

    expect(matcher.snapshot()[0].runnable).toBe(false);

    const seen: ReadonlyArray<SkillAvailability>[] = [];
    matcher.subscribe((a) => seen.push(a));

    await bus.publish('mcp.tools.changed', {
      type: 'mcp.tools.changed',
      tools: [tool('render_clip', 'resolve')],
      activeConnectors: ['resolve'],
      timestamp: 1,
    });

    expect(matcher.snapshot()[0].runnable).toBe(true);
    expect(seen).toHaveLength(1);
    expect(seen[0][0].runnable).toBe(true);
    matcher.dispose();
  });

  it('publishes `skills.available-changed` on every recompute', async () => {
    const store = makeStore([
      makeSkill('subs', { tools: ['render_clip'] }),
    ]);
    const bus: Bus = createEventBus();
    const events: { availability: ReadonlyArray<SkillAvailability>; changedAt: number }[] = [];
    bus.subscribe('skills.available-changed', (e) => {
      events.push(e);
    });

    let nowValue = 1000;
    const matcher = createCapabilityMatcher({
      store,
      bus,
      now: () => nowValue,
    });

    nowValue = 2000;
    await bus.publish('mcp.tools.changed', {
      type: 'mcp.tools.changed',
      tools: [tool('render_clip', 'resolve')],
      activeConnectors: ['resolve'],
      timestamp: 1,
    });

    expect(events).toHaveLength(1);
    expect(events[0].changedAt).toBe(2000);
    expect(events[0].availability[0].runnable).toBe(true);
    matcher.dispose();
  });

  it('recomputes on `skills.installed` (store grew between events)', async () => {
    const store = makeStore([]);
    const bus: Bus = createEventBus();
    const matcher = createCapabilityMatcher({
      store,
      bus,
      initialTools: [tool('render_clip', 'resolve')],
    });
    expect(matcher.snapshot()).toEqual([]);

    store.set([makeSkill('subs', { tools: ['render_clip'] })]);
    await bus.publish('skills.installed', {
      skillId: 'subs',
      source: 'local',
      signed: false,
      installedAt: 1,
    });

    expect(matcher.snapshot()).toHaveLength(1);
    expect(matcher.snapshot()[0].runnable).toBe(true);
    matcher.dispose();
  });

  it('recomputes on `skills.uninstalled`', async () => {
    const store = makeStore([
      makeSkill('subs', { tools: ['render_clip'] }),
    ]);
    const bus: Bus = createEventBus();
    const matcher = createCapabilityMatcher({ store, bus });
    expect(matcher.snapshot()).toHaveLength(1);

    store.set([]);
    await bus.publish('skills.uninstalled', {
      skillId: 'subs',
      uninstalledAt: 2,
    });

    expect(matcher.snapshot()).toEqual([]);
    matcher.dispose();
  });

  it('boot ordering: skills installed before connector connects → recompute', async () => {
    // Skills are already in the store; matcher is created BEFORE the
    // connector publishes any tools. Snapshot starts as not-runnable;
    // after `mcp.tools.changed` arrives it flips to runnable.
    const store = makeStore([
      makeSkill('subs', {
        tools: [{ name: 'render_clip', connector: ['resolve'] }],
      }),
    ]);
    const bus: Bus = createEventBus();
    const matcher = createCapabilityMatcher({ store, bus });

    expect(matcher.snapshot()[0].runnable).toBe(false);

    await bus.publish('mcp.tools.changed', {
      type: 'mcp.tools.changed',
      tools: [tool('render_clip', 'resolve')],
      activeConnectors: ['resolve'],
      timestamp: 1,
    });

    expect(matcher.snapshot()[0].runnable).toBe(true);
    matcher.dispose();
  });

  it('subscribe returns an unsubscribe that prevents further notifications', async () => {
    const store = makeStore([
      makeSkill('subs', { tools: ['render_clip'] }),
    ]);
    const bus: Bus = createEventBus();
    const matcher = createCapabilityMatcher({ store, bus });

    const seen: number[] = [];
    const unsubscribe = matcher.subscribe(() => seen.push(1));
    await bus.publish('mcp.tools.changed', {
      type: 'mcp.tools.changed',
      tools: [tool('render_clip', 'resolve')],
      activeConnectors: ['resolve'],
      timestamp: 1,
    });
    expect(seen).toEqual([1]);

    unsubscribe();
    await bus.publish('mcp.tools.changed', {
      type: 'mcp.tools.changed',
      tools: [],
      activeConnectors: [],
      timestamp: 2,
    });
    expect(seen).toEqual([1]);
    matcher.dispose();
  });

  it('dispose detaches all bus subscriptions', async () => {
    const store = makeStore([
      makeSkill('subs', { tools: ['render_clip'] }),
    ]);
    const bus: Bus = createEventBus();
    const matcher = createCapabilityMatcher({ store, bus });

    expect(bus.listenerCount('mcp.tools.changed')).toBe(1);
    expect(bus.listenerCount('skills.installed')).toBe(1);
    expect(bus.listenerCount('skills.uninstalled')).toBe(1);

    matcher.dispose();

    expect(bus.listenerCount('mcp.tools.changed')).toBe(0);
    expect(bus.listenerCount('skills.installed')).toBe(0);
    expect(bus.listenerCount('skills.uninstalled')).toBe(0);
  });
});
