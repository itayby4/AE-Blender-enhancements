// ── @pipefx/skills/domain — capability matcher ───────────────────────────
// Computes which installed skills are runnable against the live MCP tool
// surface. Subscribes to `mcp.tools.changed` (Phase 5 event), recomputes
// the snapshot, fans out to local listeners, and publishes
// `skills.available-changed` on the shared event bus so other consumers
// (chat composer badges, library headers, telemetry) can react too.
//
// The matcher does NOT own the installed-skill set — that lives in the
// SkillStore (Phase 7.6). Consumers pass in a `skillsProvider` so the
// matcher always reflects the current set without taking on storage
// concerns. Call `recompute()` after install / uninstall to refresh.
//
// Matching rule:
//
//   A `CapabilityRequirement` is satisfied iff there exists a tool in the
//   active set such that, for every field the requirement specifies,
//   that field matches:
//
//     • connectorId — exact string match
//     • toolName    — exact string match
//
//   The manifest schema (manifest-schema.ts) rejects requirements that
//   specify neither, so a "matches everything" loophole can't reach this
//   layer. We still treat such a requirement defensively as "unsatisfied"
//   to avoid surprising the user if the schema is ever loosened.

import type {
  McpEventMap,
  ToolDescriptor,
} from '@pipefx/connectors-contracts';
import type { EventBus } from '@pipefx/event-bus';

import type { CapabilityMatcher } from '../contracts/api.js';
import type {
  SkillEventMap,
  SkillsAvailabilityChangedEvent,
} from '../contracts/events.js';
import type {
  CapabilityRequirement,
  SkillAvailability,
  SkillManifest,
} from '../contracts/types.js';

export interface CapabilityMatcherConfig {
  /** Returns the current installed-skill set. Called on every recompute,
   *  so it should be cheap (the SkillStore caches its rows). */
  skillsProvider: () => ReadonlyArray<SkillManifest>;
  /** Shared event bus carrying both MCP and skills events. */
  bus: EventBus<McpEventMap & SkillEventMap>;
  /** Optional initial tool surface so the first snapshot has a meaningful
   *  baseline before any `mcp.tools.changed` event fires. Defaults to []. */
  initialTools?: ReadonlyArray<ToolDescriptor>;
}

export interface CapabilityMatcherHandle extends CapabilityMatcher {
  /** Re-run matching against the cached tool surface. Call this after the
   *  installed-skill set changes (install / uninstall). */
  recompute(): void;
  /** Tear down the bus subscription. Tests + hot-reload paths must call
   *  this; production wiring leaks the subscription deliberately. */
  dispose(): void;
}

export function createCapabilityMatcher(
  config: CapabilityMatcherConfig
): CapabilityMatcherHandle {
  const { skillsProvider, bus } = config;

  let tools: ReadonlyArray<ToolDescriptor> = config.initialTools ?? [];
  let snapshot: ReadonlyArray<SkillAvailability> = computeAvailability(
    skillsProvider(),
    tools
  );
  const listeners = new Set<
    (availability: ReadonlyArray<SkillAvailability>) => void
  >();

  const unsubscribe = bus.subscribe('mcp.tools.changed', (event) => {
    tools = event.tools;
    refresh();
  });

  function refresh(): void {
    const next = computeAvailability(skillsProvider(), tools);
    if (sameAvailability(snapshot, next)) return;
    snapshot = next;
    fanOut(next);
  }

  function fanOut(next: ReadonlyArray<SkillAvailability>): void {
    for (const listener of listeners) {
      // Listener errors are isolated — one bad subscriber must not break
      // the rest. The bus has its own error reporting; here we keep it
      // deliberately quiet because the matcher is hot-path on every MCP
      // tool list refresh.
      try {
        listener(next);
      } catch {
        // intentionally swallowed; see comment above.
      }
    }
    const payload: SkillsAvailabilityChangedEvent = {
      availability: next,
      changedAt: Date.now(),
    };
    void bus.publish('skills.available-changed', payload);
  }

  return {
    snapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    recompute: refresh,
    dispose() {
      unsubscribe();
      listeners.clear();
    },
  };
}

// ── Pure helpers (exported for unit tests) ───────────────────────────────

/**
 * Compute the runnable / missing partition for every skill against a
 * given tool surface. Pure function — no I/O, no event-bus, suitable for
 * snapshot-style unit tests independent of the live matcher.
 */
export function computeAvailability(
  skills: ReadonlyArray<SkillManifest>,
  tools: ReadonlyArray<ToolDescriptor>
): ReadonlyArray<SkillAvailability> {
  return skills.map((skill) => {
    const missing: CapabilityRequirement[] = [];
    for (const requirement of skill.requires.capabilities) {
      if (!isSatisfied(requirement, tools)) missing.push(requirement);
    }
    return {
      skillId: skill.id,
      runnable: missing.length === 0,
      missing,
    };
  });
}

function isSatisfied(
  requirement: CapabilityRequirement,
  tools: ReadonlyArray<ToolDescriptor>
): boolean {
  // A requirement that names neither a connector nor a tool is rejected
  // by the manifest schema. Defensively treat it as unsatisfied here so a
  // future schema loosening can't silently mark every skill runnable.
  if (
    requirement.connectorId === undefined &&
    requirement.toolName === undefined
  ) {
    return false;
  }
  return tools.some((tool) => matches(requirement, tool));
}

function matches(
  requirement: CapabilityRequirement,
  tool: ToolDescriptor
): boolean {
  if (
    requirement.connectorId !== undefined &&
    requirement.connectorId !== tool.connectorId
  ) {
    return false;
  }
  if (
    requirement.toolName !== undefined &&
    requirement.toolName !== tool.name
  ) {
    return false;
  }
  return true;
}

function sameAvailability(
  a: ReadonlyArray<SkillAvailability>,
  b: ReadonlyArray<SkillAvailability>
): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    if (x.skillId !== y.skillId) return false;
    if (x.runnable !== y.runnable) return false;
    if (x.missing.length !== y.missing.length) return false;
    for (let j = 0; j < x.missing.length; j++) {
      const xm = x.missing[j];
      const ym = y.missing[j];
      if (
        xm.connectorId !== ym.connectorId ||
        xm.toolName !== ym.toolName ||
        xm.description !== ym.description
      ) {
        return false;
      }
    }
  }
  return true;
}
