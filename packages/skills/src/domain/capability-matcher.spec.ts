// ── @pipefx/skills/domain — capability-matcher tests ─────────────────────
// Verifies the matching rule against the documented MCP scenarios from
// phase-07-skills.md ("no MCPs, one MCP, multi-MCP, MCP connecting /
// disconnecting mid-session"), plus the requirement-shape variants the
// manifest schema admits (connectorId-only, toolName-only, both).

import { describe, expect, it, vi } from 'vitest';

import type {
  McpEventMap,
  McpToolsChangedEvent,
  ToolDescriptor,
} from '@pipefx/connectors-contracts';
import { createEventBus } from '@pipefx/event-bus';

import { parseManifestOrThrow } from './manifest-schema.js';
import {
  computeAvailability,
  createCapabilityMatcher,
} from './capability-matcher.js';
import type { SkillEventMap } from '../contracts/events.js';
import type { SkillManifest } from '../contracts/types.js';

// ── Fixtures ─────────────────────────────────────────────────────────────

function makeSkill(
  id: string,
  capabilities: SkillManifest['requires']['capabilities']
): SkillManifest {
  return parseManifestOrThrow({
    schemaVersion: 1,
    id,
    version: '1.0.0',
    name: id,
    description: `${id} description`,
    inputs: [],
    prompt: 'Do the thing.',
    requires: { capabilities },
  });
}

const llmOnly = makeSkill('summarize', []);
const cutToBeat = makeSkill('cut-to-beat', [
  { connectorId: 'resolve', toolName: 'add_timeline_marker' },
]);
const anyAbletonTool = makeSkill('ableton-summary', [
  { connectorId: 'ableton' },
]);
const anyConnectorWithDetect = makeSkill('detect-anywhere', [
  { toolName: 'detect_beats' },
]);

function tool(connectorId: string, name: string): ToolDescriptor {
  return { connectorId, name, inputSchema: {} };
}

function toolsChanged(
  tools: ToolDescriptor[],
  activeConnectors: string[]
): McpToolsChangedEvent {
  return {
    type: 'mcp.tools.changed',
    tools,
    activeConnectors,
    timestamp: 0,
  };
}

// ── Pure helper ──────────────────────────────────────────────────────────

describe('computeAvailability', () => {
  it('marks an LLM-only skill runnable with no MCPs connected', () => {
    const result = computeAvailability([llmOnly], []);
    expect(result).toEqual([
      { skillId: 'summarize', runnable: true, missing: [] },
    ]);
  });

  it('marks a connector-bound skill unavailable when its MCP is offline', () => {
    const result = computeAvailability([cutToBeat], []);
    expect(result[0].runnable).toBe(false);
    expect(result[0].missing).toEqual([
      { connectorId: 'resolve', toolName: 'add_timeline_marker' },
    ]);
  });

  it('marks a connector-bound skill runnable once its tool is present', () => {
    const result = computeAvailability(
      [cutToBeat],
      [tool('resolve', 'add_timeline_marker')]
    );
    expect(result[0].runnable).toBe(true);
    expect(result[0].missing).toEqual([]);
  });

  it('matches a connectorId-only requirement against any tool from that connector', () => {
    const offline = computeAvailability([anyAbletonTool], []);
    expect(offline[0].runnable).toBe(false);
    const online = computeAvailability(
      [anyAbletonTool],
      [tool('ableton', 'play_clip')]
    );
    expect(online[0].runnable).toBe(true);
  });

  it('matches a toolName-only requirement across connectors', () => {
    const result = computeAvailability(
      [anyConnectorWithDetect],
      [tool('audio-utils', 'detect_beats')]
    );
    expect(result[0].runnable).toBe(true);
  });

  it('keeps an unrelated connector from satisfying a connector-bound skill', () => {
    const result = computeAvailability(
      [cutToBeat],
      [tool('ableton', 'add_timeline_marker')]
    );
    expect(result[0].runnable).toBe(false);
  });

  it('partitions a multi-skill set across a multi-connector tool surface', () => {
    const result = computeAvailability(
      [llmOnly, cutToBeat, anyAbletonTool],
      [
        tool('resolve', 'add_timeline_marker'),
        tool('ableton', 'play_clip'),
      ]
    );
    expect(result.map((r) => [r.skillId, r.runnable])).toEqual([
      ['summarize', true],
      ['cut-to-beat', true],
      ['ableton-summary', true],
    ]);
  });
});

// ── Reactive matcher ─────────────────────────────────────────────────────

describe('createCapabilityMatcher', () => {
  it('exposes the initial snapshot synchronously', () => {
    const bus = createEventBus<McpEventMap & SkillEventMap>();
    const matcher = createCapabilityMatcher({
      skillsProvider: () => [llmOnly, cutToBeat],
      bus,
    });
    const snap = matcher.snapshot();
    expect(snap.map((r) => [r.skillId, r.runnable])).toEqual([
      ['summarize', true],
      ['cut-to-beat', false],
    ]);
    matcher.dispose();
  });

  it('lights up a skill when its MCP connects mid-session', async () => {
    const bus = createEventBus<McpEventMap & SkillEventMap>();
    const matcher = createCapabilityMatcher({
      skillsProvider: () => [cutToBeat],
      bus,
    });
    expect(matcher.snapshot()[0].runnable).toBe(false);

    await bus.publish(
      'mcp.tools.changed',
      toolsChanged([tool('resolve', 'add_timeline_marker')], ['resolve'])
    );

    expect(matcher.snapshot()[0].runnable).toBe(true);
    matcher.dispose();
  });

  it('greys out a skill when its MCP disconnects mid-session', async () => {
    const bus = createEventBus<McpEventMap & SkillEventMap>();
    const matcher = createCapabilityMatcher({
      skillsProvider: () => [cutToBeat],
      bus,
      initialTools: [tool('resolve', 'add_timeline_marker')],
    });
    expect(matcher.snapshot()[0].runnable).toBe(true);

    await bus.publish('mcp.tools.changed', toolsChanged([], []));

    expect(matcher.snapshot()[0].runnable).toBe(false);
    expect(matcher.snapshot()[0].missing).toHaveLength(1);
    matcher.dispose();
  });

  it('swaps which skills are runnable when the active connector changes', async () => {
    const bus = createEventBus<McpEventMap & SkillEventMap>();
    const matcher = createCapabilityMatcher({
      skillsProvider: () => [cutToBeat, anyAbletonTool],
      bus,
      initialTools: [tool('resolve', 'add_timeline_marker')],
    });
    expect(matcher.snapshot().map((r) => r.runnable)).toEqual([true, false]);

    await bus.publish(
      'mcp.tools.changed',
      toolsChanged([tool('ableton', 'play_clip')], ['ableton'])
    );

    expect(matcher.snapshot().map((r) => r.runnable)).toEqual([false, true]);
    matcher.dispose();
  });

  it('notifies subscribers and republishes on the bus when availability changes', async () => {
    const bus = createEventBus<McpEventMap & SkillEventMap>();
    const matcher = createCapabilityMatcher({
      skillsProvider: () => [cutToBeat],
      bus,
    });
    const local = vi.fn();
    const onBus = vi.fn();
    matcher.subscribe(local);
    bus.subscribe('skills.available-changed', onBus);

    await bus.publish(
      'mcp.tools.changed',
      toolsChanged([tool('resolve', 'add_timeline_marker')], ['resolve'])
    );

    expect(local).toHaveBeenCalledTimes(1);
    expect(local.mock.calls[0][0][0].runnable).toBe(true);
    expect(onBus).toHaveBeenCalledTimes(1);
    expect(onBus.mock.calls[0][0].availability[0].runnable).toBe(true);
    matcher.dispose();
  });

  it('does not notify when the new snapshot is structurally identical', async () => {
    const bus = createEventBus<McpEventMap & SkillEventMap>();
    const matcher = createCapabilityMatcher({
      skillsProvider: () => [cutToBeat],
      bus,
      initialTools: [tool('resolve', 'add_timeline_marker')],
    });
    const local = vi.fn();
    matcher.subscribe(local);

    // Same effective tool surface — different array identity, same contents.
    await bus.publish(
      'mcp.tools.changed',
      toolsChanged([tool('resolve', 'add_timeline_marker')], ['resolve'])
    );

    expect(local).not.toHaveBeenCalled();
    matcher.dispose();
  });

  it('recompute() picks up changes to the installed-skill set', () => {
    const bus = createEventBus<McpEventMap & SkillEventMap>();
    let installed: SkillManifest[] = [llmOnly];
    const matcher = createCapabilityMatcher({
      skillsProvider: () => installed,
      bus,
    });
    expect(matcher.snapshot()).toHaveLength(1);

    installed = [llmOnly, cutToBeat];
    matcher.recompute();

    expect(matcher.snapshot().map((r) => r.skillId)).toEqual([
      'summarize',
      'cut-to-beat',
    ]);
    matcher.dispose();
  });

  it('dispose() unsubscribes from the bus', async () => {
    const bus = createEventBus<McpEventMap & SkillEventMap>();
    const matcher = createCapabilityMatcher({
      skillsProvider: () => [cutToBeat],
      bus,
    });
    matcher.dispose();

    await bus.publish(
      'mcp.tools.changed',
      toolsChanged([tool('resolve', 'add_timeline_marker')], ['resolve'])
    );

    // Snapshot stays at the pre-dispose state because the subscription
    // is gone.
    expect(matcher.snapshot()[0].runnable).toBe(false);
  });
});
