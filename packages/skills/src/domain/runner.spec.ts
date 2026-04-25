// ── @pipefx/skills/domain — runner tests ─────────────────────────────────
// The runner is the choke point that converts "user clicked Run" into a
// brain-loop call plus a clean lifecycle event trail. These tests verify:
//
//   • Pre-flight gates (skill exists, runnable, quota allows).
//   • Lifecycle ordering (started before finished/failed; record IDs match).
//   • Event-bus payloads carry the right run/skill/session IDs.
//   • Failures from the brain become `failed` records, not thrown errors.
//   • allowedTools is derived from the manifest's required capabilities.

import { createEventBus } from '@pipefx/event-bus';
import { describe, expect, it, vi } from 'vitest';

import type { BrainLoopApi } from '@pipefx/brain-contracts';

import type {
  CapabilityMatcher,
  SkillRunStore,
  SkillStore,
} from '../contracts/api.js';
import type {
  SkillEventMap,
  SkillRunFailedEvent,
  SkillRunFinishedEvent,
  SkillRunStartedEvent,
} from '../contracts/events.js';
import type {
  CapabilityRequirement,
  InstalledSkill,
  SkillAvailability,
  SkillManifest,
  SkillRunRecord,
  SkillRunRequest,
} from '../contracts/types.js';

import { parseManifestOrThrow } from './manifest-schema.js';
import {
  createSkillRunner,
  deriveAllowedTools,
  SkillNotFoundError,
  SkillRunQuotaError,
  SkillUnavailableError,
} from './runner.js';

// ── Fixtures ─────────────────────────────────────────────────────────────

function makeManifest(overrides: Partial<SkillManifest> = {}): SkillManifest {
  return parseManifestOrThrow({
    schemaVersion: 1,
    id: 'cut-to-beat',
    version: '1.0.0',
    name: 'Cut to Beat',
    description: 'Inserts timeline markers on detected beats.',
    inputs: [{ name: 'sensitivity', type: 'number', default: 0.5 }],
    prompt: 'Detect beats with sensitivity {{sensitivity}} then mark them.',
    requires: {
      capabilities: [
        { connectorId: 'resolve', toolName: 'add_timeline_marker' },
      ],
    },
    ...overrides,
  });
}

function makeInstalled(manifest: SkillManifest): InstalledSkill {
  return {
    manifest,
    source: 'local',
    installedAt: 1700_000_000,
    signed: false,
  };
}

interface Harness {
  store: SkillStore;
  runs: SkillRunStore;
  matcher: CapabilityMatcher;
  brain: BrainLoopApi;
  chatMock: ReturnType<typeof vi.fn<BrainLoopApi['chat']>>;
  bus: ReturnType<typeof createEventBus<SkillEventMap>>;
  events: {
    started: SkillRunStartedEvent[];
    finished: SkillRunFinishedEvent[];
    failed: SkillRunFailedEvent[];
  };
  installed: Map<string, InstalledSkill>;
  availabilityRef: { value: ReadonlyArray<SkillAvailability> };
  records: SkillRunRecord[];
}

function createHarness(opts: {
  manifests?: SkillManifest[];
  availability?: ReadonlyArray<SkillAvailability>;
  chat?: BrainLoopApi['chat'];
} = {}): Harness {
  const installed = new Map<string, InstalledSkill>();
  for (const manifest of opts.manifests ?? [makeManifest()]) {
    installed.set(manifest.id, makeInstalled(manifest));
  }

  const availabilityRef = { value: opts.availability ?? [] };
  const records: SkillRunRecord[] = [];
  let nextId = 0;

  const store: SkillStore = {
    list: () => [...installed.values()],
    get: (id) => installed.get(id) ?? null,
    install: () => {
      throw new Error('not used');
    },
    uninstall: () => {
      throw new Error('not used');
    },
  };

  const runs: SkillRunStore = {
    start(req: SkillRunRequest, sessionId) {
      const record: SkillRunRecord = {
        id: `run-${++nextId}`,
        skillId: req.skillId,
        sessionId,
        status: 'running',
        startedAt: 1700_000_001,
      };
      records.push(record);
      return record;
    },
    finish(runId) {
      const i = records.findIndex((r) => r.id === runId);
      const updated = {
        ...records[i],
        status: 'succeeded' as const,
        finishedAt: 1700_000_002,
      };
      records[i] = updated;
      return updated;
    },
    fail(runId, error) {
      const i = records.findIndex((r) => r.id === runId);
      const updated = {
        ...records[i],
        status: 'failed' as const,
        finishedAt: 1700_000_003,
        error,
      };
      records[i] = updated;
      return updated;
    },
    list: () => [...records],
  };

  const matcher: CapabilityMatcher = {
    snapshot: () => availabilityRef.value,
    subscribe: () => () => undefined,
  };

  const chatMock = vi.fn<BrainLoopApi['chat']>(
    opts.chat ?? (async () => 'ok')
  );
  const brain: BrainLoopApi = { chat: chatMock };

  const bus = createEventBus<SkillEventMap>();
  const events: Harness['events'] = {
    started: [],
    finished: [],
    failed: [],
  };
  bus.subscribe('skills.run.started', (e) => {
    events.started.push(e);
  });
  bus.subscribe('skills.run.finished', (e) => {
    events.finished.push(e);
  });
  bus.subscribe('skills.run.failed', (e) => {
    events.failed.push(e);
  });

  return {
    store,
    runs,
    matcher,
    brain,
    chatMock,
    bus,
    events,
    installed,
    availabilityRef,
    records,
  };
}

function defaultRequest(
  overrides: Partial<SkillRunRequest> = {}
): SkillRunRequest {
  return {
    skillId: 'cut-to-beat',
    inputs: { sensitivity: 0.7 },
    ...overrides,
  };
}

// ── Pre-flight gates ─────────────────────────────────────────────────────

describe('createSkillRunner — pre-flight', () => {
  it('throws SkillNotFoundError for an unknown skill', async () => {
    const h = createHarness();
    const runner = createSkillRunner(h);
    await expect(
      runner.run({ skillId: 'unknown', inputs: {} })
    ).rejects.toBeInstanceOf(SkillNotFoundError);
    expect(h.chatMock).not.toHaveBeenCalled();
    expect(h.records).toHaveLength(0);
  });

  it('throws SkillUnavailableError when matcher reports the skill is not runnable', async () => {
    const missing: CapabilityRequirement[] = [
      { connectorId: 'resolve', toolName: 'add_timeline_marker' },
    ];
    const h = createHarness({
      availability: [
        { skillId: 'cut-to-beat', runnable: false, missing },
      ],
    });
    const runner = createSkillRunner(h);
    const error = await runner.run(defaultRequest()).catch((e) => e);
    expect(error).toBeInstanceOf(SkillUnavailableError);
    expect((error as SkillUnavailableError).missing).toEqual(missing);
    expect(h.chatMock).not.toHaveBeenCalled();
    expect(h.records).toHaveLength(0);
  });

  it('skips the availability check when the matcher has no entry for the skill', async () => {
    // Matchers may lag a fresh install by one tick; absence ≠ unavailable.
    const h = createHarness({ availability: [] });
    const runner = createSkillRunner(h);
    const record = await runner.run(defaultRequest());
    expect(record.status).toBe('succeeded');
  });
});

// ── Quota hook ───────────────────────────────────────────────────────────

describe('createSkillRunner — quota', () => {
  it('throws SkillRunQuotaError when the quota hook returns allowed: false', async () => {
    const h = createHarness();
    const runner = createSkillRunner({
      ...h,
      quota: () => ({ allowed: false, reason: 'out of credits' }),
    });
    const error = await runner.run(defaultRequest()).catch((e) => e);
    expect(error).toBeInstanceOf(SkillRunQuotaError);
    expect((error as SkillRunQuotaError).message).toMatch(/out of credits/);
    expect(h.chatMock).not.toHaveBeenCalled();
    expect(h.records).toHaveLength(0);
  });

  it('wraps a quota-hook throw as SkillRunQuotaError preserving the cause', async () => {
    const h = createHarness();
    const cause = new Error('credit-service unreachable');
    const runner = createSkillRunner({
      ...h,
      quota: () => {
        throw cause;
      },
    });
    const error = await runner.run(defaultRequest()).catch((e) => e);
    expect(error).toBeInstanceOf(SkillRunQuotaError);
    expect((error as SkillRunQuotaError).cause).toBe(cause);
    expect(h.records).toHaveLength(0);
  });

  it('proceeds when the quota hook resolves with allowed: true', async () => {
    const h = createHarness();
    const quota = vi.fn(async () => ({ allowed: true }));
    const runner = createSkillRunner({ ...h, quota });
    const record = await runner.run(defaultRequest());
    expect(quota).toHaveBeenCalledOnce();
    expect(record.status).toBe('succeeded');
  });
});

// ── Happy path ───────────────────────────────────────────────────────────

describe('createSkillRunner — happy path', () => {
  it('renders the prompt, calls brain.chat, and finishes the run', async () => {
    const h = createHarness();
    const runner = createSkillRunner(h);
    const record = await runner.run(defaultRequest());

    expect(h.chatMock).toHaveBeenCalledOnce();
    const [prompt, opts] = h.chatMock.mock.calls[0];
    expect(prompt).toBe('Detect beats with sensitivity 0.7 then mark them.');
    expect(opts).toMatchObject({
      allowedTools: ['add_timeline_marker'],
    });

    expect(record.status).toBe('succeeded');
    expect(record.finishedAt).toBeDefined();
    expect(h.events.started).toHaveLength(1);
    expect(h.events.finished).toHaveLength(1);
    expect(h.events.failed).toHaveLength(0);
    expect(h.events.started[0].runId).toBe(record.id);
    expect(h.events.finished[0].runId).toBe(record.id);
  });

  it('forwards an explicit sessionId through to the brain', async () => {
    const h = createHarness();
    const runner = createSkillRunner(h);
    await runner.run(defaultRequest({ sessionId: 'sess-42' }));
    const [, opts] = h.chatMock.mock.calls[0];
    expect(opts).toMatchObject({ sessionId: 'sess-42' });
    expect(h.events.started[0].sessionId).toBe('sess-42');
  });

  it('uses defaults from the manifest when the user omits an input', async () => {
    const h = createHarness();
    const runner = createSkillRunner(h);
    await runner.run({ skillId: 'cut-to-beat', inputs: {} });
    const [prompt] = h.chatMock.mock.calls[0];
    expect(prompt).toBe('Detect beats with sensitivity 0.5 then mark them.');
  });
});

// ── Failure path ─────────────────────────────────────────────────────────

describe('createSkillRunner — failure', () => {
  it('records a failed run and emits skills.run.failed when brain.chat throws', async () => {
    const h = createHarness({
      chat: vi.fn(async () => {
        throw new Error('model timeout');
      }),
    });
    const runner = createSkillRunner(h);
    const record = await runner.run(defaultRequest());

    expect(record.status).toBe('failed');
    expect(record.error).toBe('model timeout');
    expect(h.events.started).toHaveLength(1);
    expect(h.events.finished).toHaveLength(0);
    expect(h.events.failed).toHaveLength(1);
    expect(h.events.failed[0].runId).toBe(record.id);
    expect(h.events.failed[0].error).toBe('model timeout');
  });

  it('coerces non-Error throws to a string error message', async () => {
    const h = createHarness({
      chat: vi.fn(async () => {
        throw 'raw string failure';
      }),
    });
    const runner = createSkillRunner(h);
    const record = await runner.run(defaultRequest());
    expect(record.status).toBe('failed');
    expect(record.error).toBe('raw string failure');
  });
});

// ── deriveAllowedTools ───────────────────────────────────────────────────

describe('deriveAllowedTools', () => {
  it('returns the set of toolNames declared in requires.capabilities', () => {
    const manifest = makeManifest({
      requires: {
        capabilities: [
          { connectorId: 'resolve', toolName: 'add_timeline_marker' },
          { connectorId: 'resolve', toolName: 'execute_macro' },
        ],
      },
    });
    expect(deriveAllowedTools(manifest)).toEqual([
      'add_timeline_marker',
      'execute_macro',
    ]);
  });

  it('returns [] for an LLM-only skill (no required capabilities)', () => {
    const manifest = makeManifest({ requires: { capabilities: [] } });
    expect(deriveAllowedTools(manifest)).toEqual([]);
  });

  it('returns undefined when any requirement is connector-scoped without a toolName', () => {
    // No way to enumerate the connector's tools from the domain layer,
    // so the runner falls back to letting the brain see everything.
    const manifest = makeManifest({
      requires: {
        capabilities: [{ connectorId: 'resolve' }],
      },
    });
    expect(deriveAllowedTools(manifest)).toBeUndefined();
  });

  it('deduplicates repeated toolNames', () => {
    const manifest = makeManifest({
      requires: {
        capabilities: [
          { connectorId: 'resolve', toolName: 'add_timeline_marker' },
          { connectorId: 'resolve', toolName: 'add_timeline_marker' },
        ],
      },
    });
    expect(deriveAllowedTools(manifest)).toEqual(['add_timeline_marker']);
  });
});
