// ── @pipefx/skills/contracts — event-bus events ──────────────────────────
// Broadcast on the shared @pipefx/event-bus. These are observability +
// reactive-state events; the wire format for chat streaming lives in
// @pipefx/chat/contracts (StreamEvent), not here.

import type {
  SkillAvailability,
  SkillId,
  SkillRunId,
  SkillSource,
} from './types.js';

export interface SkillInstalledEvent {
  skillId: SkillId;
  version: string;
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
 * changed its tool surface.
 */
export interface SkillsAvailabilityChangedEvent {
  /** Snapshot of all known skills with their current runnable state. */
  availability: ReadonlyArray<SkillAvailability>;
  changedAt: number;
}

export interface SkillRunStartedEvent {
  runId: SkillRunId;
  skillId: SkillId;
  sessionId: string | null;
  startedAt: number;
}

export interface SkillRunFinishedEvent {
  runId: SkillRunId;
  skillId: SkillId;
  sessionId: string | null;
  finishedAt: number;
}

export interface SkillRunFailedEvent {
  runId: SkillRunId;
  skillId: SkillId;
  sessionId: string | null;
  finishedAt: number;
  error: string;
}

export interface SkillEventMap {
  'skills.installed': SkillInstalledEvent;
  'skills.uninstalled': SkillUninstalledEvent;
  'skills.available-changed': SkillsAvailabilityChangedEvent;
  'skills.run.started': SkillRunStartedEvent;
  'skills.run.finished': SkillRunFinishedEvent;
  'skills.run.failed': SkillRunFailedEvent;
}

export type SkillEvent =
  | SkillInstalledEvent
  | SkillUninstalledEvent
  | SkillsAvailabilityChangedEvent
  | SkillRunStartedEvent
  | SkillRunFinishedEvent
  | SkillRunFailedEvent;
