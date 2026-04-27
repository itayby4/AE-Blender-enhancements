// ── @pipefx/skills/domain — capability matcher ───────────────────────────
// Decides which installed skills are *runnable right now* given the live
// MCP tool set. Phase 12.4 ships:
//
//   • A pair of pure helpers — `isToolSatisfied` (per-requirement) and
//     `computeAvailability` (per-skill) — that are the heart of the
//     matching logic. Both are total over their inputs and have no I/O,
//     so they're trivially unit-testable and reusable from places that
//     don't want a live event-bus subscription (e.g. the run dispatcher
//     re-checks runnability at run-start).
//
//   • A factory `createCapabilityMatcher` that wires the helpers to the
//     event bus: subscribes to `mcp.tools.changed`, `skills.installed`,
//     and `skills.uninstalled`; recomputes the snapshot on each; pushes
//     it to local listeners and publishes `skills.available-changed` on
//     the shared bus.
//
// The matcher is the only place where the v2 `RequiredTool` shape is
// interpreted — bare-string vs `{name, connector?}`. Everything upstream
// (schema, parser, store) treats it as opaque data; everything downstream
// (UI, runner) consumes the resulting `SkillAvailability[]`.

import type {
  McpEventMap,
  ToolDescriptor,
} from '@pipefx/connectors-contracts';
import type { EventBus } from '@pipefx/event-bus';

import type {
  CapabilityMatcher,
  InstalledSkill,
  SkillAvailability,
  SkillStore,
} from '../contracts/api.js';
import type { SkillEventMap } from '../contracts/events.js';
import type { RequiredTool } from '../contracts/skill-md.js';

// ── Pure helpers ─────────────────────────────────────────────────────────

/**
 * `true` iff at least one tool in `tools` satisfies `required`. Bare-string
 * requirements match any connector; object form with `connector[]` only
 * matches when the live tool's connector id is in the allow-list. An empty
 * or absent `connector[]` is treated as "any connector" — same as the
 * bare-string form, but explicit.
 */
export function isToolSatisfied(
  required: RequiredTool,
  tools: ReadonlyArray<ToolDescriptor>
): boolean {
  if (typeof required === 'string') {
    return tools.some((t) => t.name === required);
  }
  const allowed = required.connector;
  return tools.some((t) => {
    if (t.name !== required.name) return false;
    if (!allowed || allowed.length === 0) return true;
    return allowed.includes(t.connectorId as string);
  });
}

/**
 * Per-skill availability snapshot. Iteration order matches `skills`, so
 * callers can zip the result back against the input list.
 */
export function computeAvailability(
  skills: ReadonlyArray<InstalledSkill>,
  tools: ReadonlyArray<ToolDescriptor>
): ReadonlyArray<SkillAvailability> {
  return skills.map((skill) => {
    const requires = skill.loaded.frontmatter.requires;
    const required = requires?.tools ?? [];
    const optional = requires?.optional ?? [];
    const missing = required.filter((r) => !isToolSatisfied(r, tools));
    const optionalPresent = optional.filter((r) => isToolSatisfied(r, tools));
    return {
      skillId: skill.loaded.frontmatter.id,
      runnable: missing.length === 0,
      missing,
      optionalPresent,
    };
  });
}

// ── Reactive matcher ─────────────────────────────────────────────────────

export interface CapabilityMatcherDeps {
  readonly store: SkillStore;
  readonly bus: EventBus<McpEventMap & SkillEventMap>;
  /** Wall-clock for the `changedAt` field on `skills.available-changed`. */
  readonly now?: () => number;
  /** Initial live-tool snapshot. Wire this when the matcher is created
   *  after a connector is already up so the first `snapshot()` reflects
   *  reality instead of an empty tool set. Defaults to `[]`. */
  readonly initialTools?: ReadonlyArray<ToolDescriptor>;
}

export interface CapabilityMatcherHandle extends CapabilityMatcher {
  /** Detach all bus subscriptions and clear local listeners. */
  dispose(): void;
}

/**
 * Wire the pure helpers to the event bus. The matcher recomputes on three
 * triggers:
 *
 *   • `mcp.tools.changed` — connector connect/disconnect/refresh.
 *   • `skills.installed`  — store grew a new skill.
 *   • `skills.uninstalled`— store dropped a skill.
 *
 * Each recompute pushes the new snapshot to in-process listeners and
 * publishes `skills.available-changed` on the bus. The initial snapshot
 * is computed eagerly at construction so `snapshot()` is always non-null.
 */
export function createCapabilityMatcher(
  deps: CapabilityMatcherDeps
): CapabilityMatcherHandle {
  const {
    store,
    bus,
    now = () => Date.now(),
    initialTools = [],
  } = deps;

  let tools: ReadonlyArray<ToolDescriptor> = initialTools;
  let current: ReadonlyArray<SkillAvailability> = computeAvailability(
    store.list(),
    tools
  );

  const listeners = new Set<
    (availability: ReadonlyArray<SkillAvailability>) => void
  >();

  const recompute = () => {
    current = computeAvailability(store.list(), tools);
    for (const listener of listeners) listener(current);
    void bus.publish('skills.available-changed', {
      availability: current,
      changedAt: now(),
    });
  };

  const offTools = bus.subscribe('mcp.tools.changed', (event) => {
    tools = event.tools;
    recompute();
  });
  const offInstalled = bus.subscribe('skills.installed', () => {
    recompute();
  });
  const offUninstalled = bus.subscribe('skills.uninstalled', () => {
    recompute();
  });

  return {
    snapshot: () => current,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    dispose() {
      offTools();
      offInstalled();
      offUninstalled();
      listeners.clear();
    },
  };
}
