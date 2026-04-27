// ── @pipefx/skills/contracts — event-bus events ──────────────────────────
// Broadcast on the shared `@pipefx/event-bus`. These are observability +
// reactive-state events; the wire format for chat streaming lives in
// `@pipefx/chat/contracts` (StreamEvent), not here.
//
// Phase 12 surface — payloads keyed off the new `LoadedSkill`-shaped
// store and the three-mode runner.

import type {
  SkillAvailability,
  SkillRunId,
  SkillSource,
} from './api.js';
import type { SkillExecutionMode, SkillId } from './skill-md.js';

export interface SkillInstalledEvent {
  skillId: SkillId;
  /** Loose-semver string from `frontmatter.version`. Absent when the skill
   *  declares no version (the v2 schema makes version optional). */
  version?: string;
  source: SkillSource;
  signed: boolean;
  installedAt: number;
}

export interface SkillUninstalledEvent {
  skillId: SkillId;
  uninstalledAt: number;
}

/**
 * Fired by capability-matcher.ts whenever the runnable / unavailable
 * partition shifts — i.e. an MCP connector connected, disconnected, or
 * changed its tool surface, or a skill was installed / uninstalled.
 */
export interface SkillsAvailabilityChangedEvent {
  /** Snapshot of all known skills with their current availability state. */
  availability: ReadonlyArray<SkillAvailability>;
  changedAt: number;
}

export interface SkillRunStartedEvent {
  runId: SkillRunId;
  skillId: SkillId;
  /** Resolved by the dispatcher at start. Bus subscribers (UI, telemetry)
   *  use this to pick the right output surface without re-reading the
   *  frontmatter. */
  mode: SkillExecutionMode;
  sessionId: string | null;
  startedAt: number;
}

export interface SkillRunFinishedEvent {
  runId: SkillRunId;
  skillId: SkillId;
  mode: SkillExecutionMode;
  sessionId: string | null;
  finishedAt: number;
}

export interface SkillRunFailedEvent {
  runId: SkillRunId;
  skillId: SkillId;
  mode: SkillExecutionMode;
  sessionId: string | null;
  finishedAt: number;
  error: string;
}

/**
 * Event-bus map for the skills namespace. Declared as a type alias (not
 * an interface) so it satisfies `EventMap extends Record<string, unknown>`
 * in `@pipefx/event-bus` — and so it can be intersected with peer maps
 * (`McpEventMap & SkillEventMap`) without losing the index-signature
 * compatibility that the bus's generic constraint requires.
 */
export type SkillEventMap = {
  'skills.installed': SkillInstalledEvent;
  'skills.uninstalled': SkillUninstalledEvent;
  'skills.available-changed': SkillsAvailabilityChangedEvent;
  'skills.run.started': SkillRunStartedEvent;
  'skills.run.finished': SkillRunFinishedEvent;
  'skills.run.failed': SkillRunFailedEvent;
};

export type SkillEvent =
  | SkillInstalledEvent
  | SkillUninstalledEvent
  | SkillsAvailabilityChangedEvent
  | SkillRunStartedEvent
  | SkillRunFinishedEvent
  | SkillRunFailedEvent;
