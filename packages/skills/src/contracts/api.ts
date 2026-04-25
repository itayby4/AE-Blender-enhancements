// ── @pipefx/skills/contracts — ports + facade ────────────────────────────
// Dependency-inversion seams. Domain code (capability-matcher, runner) and
// the backend mount adapter wire concrete implementations behind these
// interfaces so consumers never reach into internal modules.

import type {
  InstalledSkill,
  SkillAvailability,
  SkillId,
  SkillManifest,
  SkillRunId,
  SkillRunRecord,
  SkillRunRequest,
} from './types.js';

// ── Storage port ─────────────────────────────────────────────────────────
// Implemented in Phase 7.6 by services/skill-storage.ts (filesystem-backed).
// Returning the manifest separately from the row metadata lets the runner
// skip a JSON parse on hot paths.

export interface SkillStore {
  list(): InstalledSkill[];
  get(id: SkillId): InstalledSkill | null;
  /** Returns the persisted record. Caller is responsible for signature
   *  verification BEFORE calling install. */
  install(manifest: SkillManifest, opts: InstallOptions): InstalledSkill;
  /** Returns true iff a row was removed. */
  uninstall(id: SkillId): boolean;
}

export interface InstallOptions {
  source: InstalledSkill['source'];
  signed: boolean;
  fingerprint?: string;
  installPath?: string;
}

// ── Run history port ─────────────────────────────────────────────────────

export interface SkillRunStore {
  start(req: SkillRunRequest, sessionId: string | null): SkillRunRecord;
  finish(runId: SkillRunId): SkillRunRecord;
  fail(runId: SkillRunId, error: string): SkillRunRecord;
  list(skillId?: SkillId, limit?: number): SkillRunRecord[];
}

// ── Capability matcher port ──────────────────────────────────────────────
// The matcher subscribes to mcp.tools.changed (Phase 5 event) and computes
// runnable / unavailable per skill. Consumers just observe the snapshot.

export interface CapabilityMatcher {
  snapshot(): ReadonlyArray<SkillAvailability>;
  /** Subscribe; returns an unsubscribe fn. */
  subscribe(
    listener: (availability: ReadonlyArray<SkillAvailability>) => void
  ): () => void;
}

// ── Public facade ────────────────────────────────────────────────────────
// Backend HTTP routes + desktop hooks call into this. Concrete wiring
// happens in apps/backend (mounts the routes) and in @pipefx/skills/ui
// (the React hook calls the routes via fetch); the interface here is the
// contract those layers agree on.

export interface SkillsApi {
  listSkills(): InstalledSkill[];
  getSkill(id: SkillId): InstalledSkill | null;
  /** Reactive view filtered by current connector state. */
  listAvailability(): ReadonlyArray<SkillAvailability>;
  subscribeAvailability(
    listener: (availability: ReadonlyArray<SkillAvailability>) => void
  ): () => void;
  installSkill(manifest: SkillManifest, opts: InstallOptions): InstalledSkill;
  uninstallSkill(id: SkillId): boolean;
  runSkill(req: SkillRunRequest): Promise<SkillRunRecord>;
}
