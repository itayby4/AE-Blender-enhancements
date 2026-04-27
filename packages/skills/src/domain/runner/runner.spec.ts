// ── @pipefx/skills/domain — runner dispatcher tests ──────────────────────
// Three layers under test: the per-mode handlers (pure-ish), the template
// engine, and the dispatcher wired against a real `@pipefx/event-bus`
// instance with stub Brain + ScriptRunner ports. Tests assert the
// `skills.run.*` lifecycle events fire in the right order with the right
// payloads, and that component-mode hands off without auto-finishing.

import type { BrainLoopApi } from '@pipefx/brain-contracts';
import { createEventBus, type EventBus } from '@pipefx/event-bus';
import { describe, expect, it, vi } from 'vitest';

import type {
  CapabilityMatcher,
  InstalledSkill,
  SkillAvailability,
  SkillRunRecord,
  SkillStore,
} from '../../contracts/api.js';
import type { SkillEventMap } from '../../contracts/events.js';
import type {
  LoadedSkill,
  RequiredTool,
  SkillFrontmatter,
} from '../../contracts/skill-md.js';
import { createSkillRunStore } from '../../backend/services/skill-run-store.js';

import { buildMountInstruction } from './component-mode.js';
import {
  createSkillRunner,
  type SkillRunnerDeps,
} from './index.js';
import { deriveAllowedTools, runPromptMode } from './prompt-mode.js';
import { runScriptMode } from './script-mode.js';
import type { ScriptRunner, ScriptRunResult } from './script-runner.js';
import { renderTemplate } from './template.js';

// ── Helpers ──────────────────────────────────────────────────────────────

type Bus = EventBus<SkillEventMap>;

function makeFrontmatter(
  partial: Partial<SkillFrontmatter> & { id: string }
): SkillFrontmatter {
  return {
    name: partial.id,
    description: `${partial.id} test skill`,
    ...partial,
  };
}

function makeSkill(
  frontmatter: SkillFrontmatter,
  body = ''
): InstalledSkill {
  const loaded: LoadedSkill = { frontmatter, body };
  return {
    loaded,
    source: 'local',
    signed: false,
    installedAt: 0,
    installPath: `/fake/${frontmatter.id}`,
  };
}

function makeStore(initial: InstalledSkill[] = []): SkillStore {
  const skills = new Map(
    initial.map((s) => [s.loaded.frontmatter.id, s] as const)
  );
  return {
    list: () => [...skills.values()],
    get: (id) => skills.get(id) ?? null,
    install: () => {
      throw new Error('install not used in runner tests');
    },
    uninstall: () => false,
  };
}

function makeMatcher(
  availability: ReadonlyArray<SkillAvailability>
): CapabilityMatcher {
  return {
    snapshot: () => availability,
    subscribe: () => () => undefined,
  };
}

function makeBrain(
  reply: string | ((msg: string) => string | Promise<string>) = 'OK'
): BrainLoopApi & { calls: Array<{ message: string; opts: unknown }> } {
  const calls: Array<{ message: string; opts: unknown }> = [];
  return {
    calls,
    async chat(message, opts) {
      calls.push({ message, opts: opts ?? {} });
      return typeof reply === 'function' ? reply(message) : reply;
    },
  };
}

function makeScriptRunner(
  result: ScriptRunResult | ((input: unknown) => ScriptRunResult | Promise<ScriptRunResult>)
    = { exitCode: 0, stdout: '', stderr: '' }
): ScriptRunner & { calls: unknown[] } {
  const calls: unknown[] = [];
  return {
    calls,
    async run(input) {
      calls.push(input);
      return typeof result === 'function' ? result(input) : result;
    },
  };
}

function captureBus(bus: Bus): Array<{ event: string; payload: unknown }> {
  const log: Array<{ event: string; payload: unknown }> = [];
  bus.subscribe('skills.run.started', (p) =>
    void log.push({ event: 'skills.run.started', payload: p })
  );
  bus.subscribe('skills.run.finished', (p) =>
    void log.push({ event: 'skills.run.finished', payload: p })
  );
  bus.subscribe('skills.run.failed', (p) =>
    void log.push({ event: 'skills.run.failed', payload: p })
  );
  return log;
}

function makeDeps(
  overrides: Partial<SkillRunnerDeps> & {
    skills: InstalledSkill[];
  }
): {
  bus: Bus;
  deps: SkillRunnerDeps;
  log: Array<{ event: string; payload: unknown }>;
  brain: ReturnType<typeof makeBrain>;
  scriptRunner: ReturnType<typeof makeScriptRunner>;
} {
  const bus = createEventBus<SkillEventMap>();
  const log = captureBus(bus);
  const brain = (overrides.brain as ReturnType<typeof makeBrain>) ?? makeBrain();
  const scriptRunner =
    (overrides.scriptRunner as ReturnType<typeof makeScriptRunner>) ??
    makeScriptRunner();
  const deps: SkillRunnerDeps = {
    store: makeStore(overrides.skills),
    runStore: createSkillRunStore({ generateId: () => 'unused' }),
    bus,
    brain,
    scriptRunner,
    matcher: overrides.matcher,
    generateRunId: overrides.generateRunId,
  };
  return { bus, deps, log, brain, scriptRunner };
}

// ── Template ─────────────────────────────────────────────────────────────

describe('renderTemplate', () => {
  it('substitutes {{ name }} with stringified values', () => {
    const out = renderTemplate(
      'lang={{lang}} loud={{loud}} count={{ n }}',
      { lang: 'en', loud: true, n: 3 }
    );
    expect(out).toBe('lang=en loud=true count=3');
  });

  it('leaves unknown variables in place', () => {
    expect(renderTemplate('hi {{name}}', {})).toBe('hi {{name}}');
  });

  it('ignores non-identifier patterns', () => {
    // braces around a space-only token aren't matched.
    expect(renderTemplate('keep {{ }} as-is', {})).toBe('keep {{ }} as-is');
  });
});

// ── deriveAllowedTools ──────────────────────────────────────────────────

describe('deriveAllowedTools', () => {
  it('returns empty when requires is undefined', () => {
    expect(deriveAllowedTools(undefined)).toEqual([]);
  });

  it('flattens bare-string + object forms and includes optional', () => {
    const out = deriveAllowedTools({
      tools: ['render_clip', { name: 'import_subtitle_track' }],
      optional: ['burn_in_subtitles'],
    });
    expect(out.sort()).toEqual(
      ['burn_in_subtitles', 'import_subtitle_track', 'render_clip'].sort()
    );
  });

  it('dedupes when the same name appears in tools and optional', () => {
    const out = deriveAllowedTools({
      tools: ['render_clip'],
      optional: [{ name: 'render_clip' }],
    });
    expect(out).toEqual(['render_clip']);
  });
});

// ── Prompt mode handler ─────────────────────────────────────────────────

describe('runPromptMode', () => {
  it('renders body, derives allowedTools, threads sessionId', async () => {
    const skill = makeSkill(
      makeFrontmatter({
        id: 'subtitles',
        requires: { tools: ['render_clip'] },
      }),
      'Render clip {{clipId}} in {{lang}}.'
    );
    const brain = makeBrain('done');
    const result = await runPromptMode({
      skill,
      req: {
        skillId: 'subtitles',
        inputs: { clipId: 'c-1', lang: 'en' },
        sessionId: 'sess-7',
      },
      brain,
    });
    expect(result.text).toBe('done');
    expect(brain.calls).toHaveLength(1);
    expect(brain.calls[0]?.message).toBe('Render clip c-1 in en.');
    expect(brain.calls[0]?.opts).toMatchObject({
      sessionId: 'sess-7',
      allowedTools: ['render_clip'],
    });
  });

  it('prepends the optional-tools hint when optionalPresent is non-empty', async () => {
    const skill = makeSkill(
      makeFrontmatter({
        id: 'has-opts',
        requires: {
          tools: ['render_clip'],
          optional: ['burn_in_subtitles'],
        },
      }),
      'Body.'
    );
    const brain = makeBrain('done');
    await runPromptMode({
      skill,
      req: { skillId: 'has-opts', inputs: {} },
      brain,
      optionalPresent: ['burn_in_subtitles'] as ReadonlyArray<RequiredTool>,
    });
    expect(brain.calls[0]?.message).toBe(
      '[Available optional tools: burn_in_subtitles]\n\nBody.'
    );
  });

  it('omits the optional hint when optionalPresent is empty/undefined', async () => {
    const skill = makeSkill(
      makeFrontmatter({ id: 'plain', requires: { tools: [] } }),
      'just body'
    );
    const brain = makeBrain('done');
    await runPromptMode({
      skill,
      req: { skillId: 'plain', inputs: {} },
      brain,
    });
    expect(brain.calls[0]?.message).toBe('just body');
  });
});

// ── Script mode handler ─────────────────────────────────────────────────

describe('runScriptMode', () => {
  it('throws when frontmatter is missing scripts.entry', async () => {
    const skill = makeSkill(makeFrontmatter({ id: 'nope' }), '');
    const scriptRunner = makeScriptRunner();
    await expect(
      runScriptMode({
        runId: 'run-x',
        skill,
        req: { skillId: 'nope', inputs: {} },
        scriptRunner,
      })
    ).rejects.toThrow(/missing scripts.entry/);
    expect(scriptRunner.calls).toHaveLength(0);
  });

  it('forwards skill + inputs to the injected runner', async () => {
    const skill = makeSkill(
      makeFrontmatter({ id: 's', scripts: { entry: 'scripts/run.py' } }),
      ''
    );
    const scriptRunner = makeScriptRunner({
      exitCode: 0,
      stdout: 'ok',
      stderr: '',
    });
    const result = await runScriptMode({
      runId: 'run-y',
      skill,
      req: { skillId: 's', inputs: { x: 1 } },
      scriptRunner,
    });
    expect(result.stdout).toBe('ok');
    expect(scriptRunner.calls[0]).toMatchObject({
      runId: 'run-y',
      skill,
      inputs: { x: 1 },
    });
  });
});

// ── Component mode handler ──────────────────────────────────────────────

describe('buildMountInstruction', () => {
  it('builds an instruction with runId / entry / mount / inputs', () => {
    const skill = makeSkill(
      makeFrontmatter({
        id: 'subtitles',
        ui: 'bundled',
        bundledUi: { entry: 'ui/index.tsx', mount: 'full-screen' },
      }),
      ''
    );
    const instr = buildMountInstruction(
      'run-1',
      skill,
      { skillId: 'subtitles', inputs: { clipId: 'c-1' } }
    );
    expect(instr).toEqual({
      runId: 'run-1',
      skillId: 'subtitles',
      entry: 'ui/index.tsx',
      mount: 'full-screen',
      inputs: { clipId: 'c-1' },
    });
  });

  it('defaults mount to "modal" when not declared', () => {
    const skill = makeSkill(
      makeFrontmatter({
        id: 'x',
        ui: 'bundled',
        bundledUi: { entry: 'ui/index.tsx' },
      }),
      ''
    );
    const instr = buildMountInstruction('run-2', skill, {
      skillId: 'x',
      inputs: {},
    });
    expect(instr.mount).toBe('modal');
  });

  it('throws when bundledUi is absent', () => {
    const skill = makeSkill(
      makeFrontmatter({ id: 'no-ui', ui: 'bundled' }),
      ''
    );
    expect(() =>
      buildMountInstruction('run-3', skill, {
        skillId: 'no-ui',
        inputs: {},
      })
    ).toThrow(/missing bundledUi/);
  });
});

// ── Dispatcher ──────────────────────────────────────────────────────────

describe('createSkillRunner', () => {
  it('routes prompt mode → brain.chat → finish + lifecycle events', async () => {
    const skill = makeSkill(
      makeFrontmatter({
        id: 'p',
        requires: { tools: ['render_clip'] },
      }),
      'Body for {{x}}'
    );
    const { deps, log, brain } = makeDeps({
      skills: [skill],
      generateRunId: () => 'run-p',
    });
    const runner = createSkillRunner(deps);
    const record = await runner.run({
      skillId: 'p',
      inputs: { x: 'hi' },
      sessionId: 'sess-1',
    });

    expect(record.status).toBe('succeeded');
    expect(record.id).toBe('run-p');
    expect(record.mode).toBe('prompt');
    expect(brain.calls[0]?.message).toBe('Body for hi');
    expect(log.map((e) => e.event)).toEqual([
      'skills.run.started',
      'skills.run.finished',
    ]);
    expect(log[0]?.payload).toMatchObject({
      runId: 'run-p',
      mode: 'prompt',
      sessionId: 'sess-1',
    });
  });

  it('passes optionalPresent from the matcher into prompt mode', async () => {
    const skill = makeSkill(
      makeFrontmatter({
        id: 'opt',
        requires: { tools: [], optional: ['burn_in'] },
      }),
      'Body'
    );
    const matcher = makeMatcher([
      {
        skillId: 'opt',
        runnable: true,
        missing: [],
        optionalPresent: ['burn_in'],
      },
    ]);
    const { deps, brain } = makeDeps({
      skills: [skill],
      matcher,
      generateRunId: () => 'run-opt',
    });
    await createSkillRunner(deps).run({ skillId: 'opt', inputs: {} });
    expect(brain.calls[0]?.message).toBe(
      '[Available optional tools: burn_in]\n\nBody'
    );
  });

  it('routes script mode → script runner → finish + lifecycle events', async () => {
    const skill = makeSkill(
      makeFrontmatter({
        id: 's',
        scripts: { entry: 'scripts/run.py' },
      }),
      ''
    );
    const { deps, log, scriptRunner } = makeDeps({
      skills: [skill],
      generateRunId: () => 'run-s',
    });
    const record = await createSkillRunner(deps).run({
      skillId: 's',
      inputs: { foo: 'bar' },
    });
    expect(record.status).toBe('succeeded');
    expect(record.mode).toBe('script');
    expect(scriptRunner.calls).toHaveLength(1);
    expect(log.map((e) => e.event)).toEqual([
      'skills.run.started',
      'skills.run.finished',
    ]);
  });

  it('component mode → mountInstruction in record + started event only', async () => {
    const skill = makeSkill(
      makeFrontmatter({
        id: 'c',
        ui: 'bundled',
        bundledUi: { entry: 'ui/index.tsx', mount: 'full-screen' },
      }),
      ''
    );
    const { deps, log } = makeDeps({
      skills: [skill],
      generateRunId: () => 'run-c',
    });
    const record = await createSkillRunner(deps).run({
      skillId: 'c',
      inputs: { clipId: 'c-1' },
    });
    expect(record.status).toBe('running');
    expect(record.mode).toBe('component');
    expect(record.mountInstruction).toEqual({
      runId: 'run-c',
      skillId: 'c',
      entry: 'ui/index.tsx',
      mount: 'full-screen',
      inputs: { clipId: 'c-1' },
    });
    // The host owns lifecycle from here — the dispatcher only published `started`.
    expect(log.map((e) => e.event)).toEqual(['skills.run.started']);
  });

  it('failures in prompt mode → fail + skills.run.failed payload carries error', async () => {
    const skill = makeSkill(
      makeFrontmatter({ id: 'p', requires: { tools: [] } }),
      'body'
    );
    const brain: BrainLoopApi = {
      chat: vi.fn().mockRejectedValue(new Error('llm down')),
    };
    const { deps, log } = makeDeps({
      skills: [skill],
      brain: brain as ReturnType<typeof makeBrain>,
      generateRunId: () => 'run-fail',
    });
    const record = await createSkillRunner(deps).run({
      skillId: 'p',
      inputs: {},
    });
    expect(record.status).toBe('failed');
    expect(record.error).toBe('llm down');
    expect(log.map((e) => e.event)).toEqual([
      'skills.run.started',
      'skills.run.failed',
    ]);
    expect((log[1]?.payload as { error: string }).error).toBe('llm down');
  });

  it('rejects script mode when no scriptRunner is configured', async () => {
    const skill = makeSkill(
      makeFrontmatter({
        id: 's',
        scripts: { entry: 'scripts/run.py' },
      }),
      ''
    );
    const bus = createEventBus<SkillEventMap>();
    const log = captureBus(bus);
    const deps: SkillRunnerDeps = {
      store: makeStore([skill]),
      runStore: createSkillRunStore({ generateId: () => 'unused' }),
      bus,
      brain: makeBrain(),
      generateRunId: () => 'run-noscript',
    };
    const record = await createSkillRunner(deps).run({
      skillId: 's',
      inputs: {},
    });
    expect(record.status).toBe('failed');
    expect(record.error).toMatch(/script-mode runner is not configured/);
    expect(log.map((e) => e.event)).toEqual([
      'skills.run.started',
      'skills.run.failed',
    ]);
  });

  it('throws synchronously when skillId is unknown', async () => {
    const { deps } = makeDeps({ skills: [] });
    await expect(
      createSkillRunner(deps).run({ skillId: 'ghost', inputs: {} })
    ).rejects.toThrow(/not installed/);
  });

  it('mountInstruction.runId matches the run record id', async () => {
    const skill = makeSkill(
      makeFrontmatter({
        id: 'c',
        ui: 'bundled',
        bundledUi: { entry: 'ui/index.tsx' },
      }),
      ''
    );
    let counter = 0;
    const { deps } = makeDeps({
      skills: [skill],
      generateRunId: () => `auto-${++counter}`,
    });
    const record: SkillRunRecord = await createSkillRunner(deps).run({
      skillId: 'c',
      inputs: {},
    });
    expect(record.id).toBe('auto-1');
    expect(record.mountInstruction?.runId).toBe('auto-1');
  });
});
