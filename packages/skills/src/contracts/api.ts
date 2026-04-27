// ── @pipefx/skills/contracts — ports + facade ────────────────────────────
// Dependency-inversion seams. Domain code (capability-matcher, runner) and
// the backend mount adapter wire concrete implementations behind these
// interfaces so consumers never reach into internal modules.
//
// Phase 12 surface — keyed off `LoadedSkill` (SKILL.md shape), not the v1
// JSON `SkillManifest`. The runner is mode-aware (`prompt` / `script` /
// `component`) and carries a mount instruction in the run record for the
// component path.

import type {
  LoadedSkill,
  RequiredTool,
  SkillBundledUiMount,
  SkillExecutionMode,
  SkillId,
} from './skill-md.js';

// ── Run identity + lifecycle ─────────────────────────────────────────────

/** Run identifier — UUID minted by the runner when a run starts. */
export type SkillRunId = string;

export type SkillRunStatus = 'pending' | 'running' | 'succeeded' | 'failed';

// ── Where a skill came from ──────────────────────────────────────────────
// Two roots — `<repo>/SKILL/` (built-in, read-only at runtime) and
// `<userData>/SKILL/` (user-installed). The `source` axis below captures
// both the root AND the install pathway for user-root skills:
//
//   builtin  ─ ships inside the desktop bundle. Immutable. No fingerprint.
//   local    ─ user dropped a folder into <userData>/SKILL/ by hand.
//   bundle   ─ installed from a `.pfxskill` zip via the import dialog.
//   remote   ─ installed from the future Store. Reserved this phase.

export type SkillSource = 'builtin' | 'local' | 'bundle' | 'remote';

// ── Installed-skill record ───────────────────────────────────────────────

export interface InstalledSkill {
  /** Validated SKILL.md (frontmatter + body + source path). */
  loaded: LoadedSkill;
  source: SkillSource;
  installedAt: number;
  /** True iff the bundle carried a valid Ed25519 signature. Built-in
   *  skills are signed by the project key at build time. */
  signed: boolean;
  /** Author fingerprint at install time. Stored separately from any
   *  body-level claim so a tampered SKILL.md can't lie about it. */
  fingerprint?: string;
  /** Filesystem path of the unpacked skill directory. Always present —
   *  every installed skill lives on disk under one of the two roots. */
  installPath: string;
}

export interface InstallOptions {
  /** How the skill is being added. `'builtin'` is reserved for the
   *  `<repo>/SKILL/` walk and is rejected by the user-root install path. */
  source: SkillSource;
  signed: boolean;
  fingerprint?: string;
  /** Resources to write alongside SKILL.md (scripts/, ui/, assets/). Paths
   *  are POSIX, relative to the skill directory. The store rejects
   *  backslash, absolute, and `..` segments. */
  resources?: ReadonlyArray<{ path: string; content: Uint8Array }>;
}

// ── Storage port ─────────────────────────────────────────────────────────
// Walks both roots and merges by id. `install()` always writes to the user
// root; `uninstall()` only removes from the user root (built-ins are
// immutable). When a user skill shadows a built-in, `list()` returns the
// user copy and the consumer surfaces it via UI badging.

export interface SkillStore {
  list(): InstalledSkill[];
  get(id: SkillId): InstalledSkill | null;
  /** Persist a user-root skill. Caller is responsible for signature
   *  verification BEFORE calling install. */
  install(loaded: LoadedSkill, opts: InstallOptions): InstalledSkill;
  /** Returns true iff a skill was removed from the user root. Always
   *  returns false for built-in ids (no-op). */
  uninstall(id: SkillId): boolean;
}

// ── Run history port ─────────────────────────────────────────────────────

export interface SkillRunRequest {
  skillId: SkillId;
  /** Form values keyed by `SkillFrontmatterInput.id`. Booleans + numbers
   *  pass through; the runner's template engine stringifies for prompt
   *  mode and forwards as JSON for script / component modes. */
  inputs: Readonly<Record<string, string | number | boolean>>;
  /** Optional chat session to attach the run to — when omitted the runner
   *  creates a fresh session for prompt-mode runs. Ignored by script and
   *  component modes (they don't drive a brain turn directly). */
  sessionId?: string;
}

/**
 * Mount instruction emitted by `component`-mode runs. The run record
 * carries this as data — the host (desktop shell) looks `entry` up in
 * the registered components map (populated by `@pipefx/skills-builtin`)
 * and mounts the matching React module per `mount`.
 *
 * The runtime context the component receives (brain handle, tool registry,
 * output sink) is injected by the host at mount time and is intentionally
 * NOT part of this serializable record.
 */
export interface SkillMountInstruction {
  runId: SkillRunId;
  skillId: SkillId;
  /** Registry key — the frontmatter `bundledUi.entry`, normalized. */
  entry: string;
  mount: SkillBundledUiMount;
  /** User-submitted form values, forwarded verbatim to the component. */
  inputs: Readonly<Record<string, string | number | boolean>>;
}

export interface SkillRunRecord {
  id: SkillRunId;
  skillId: SkillId;
  /** Resolved at run-start by `resolveExecutionMode`. Stored on the
   *  record so the UI can pick the right output surface without
   *  re-reading the frontmatter. */
  mode: SkillExecutionMode;
  sessionId: string | null;
  status: SkillRunStatus;
  startedAt: number;
  finishedAt?: number;
  /** Populated when `status === 'failed'`. */
  error?: string;
  /** Present iff `mode === 'component'`. The desktop's runner host reads
   *  this to mount the bundled component. */
  mountInstruction?: SkillMountInstruction;
}

export interface SkillRunStore {
  /** Mints a `running`-status row. The runner is responsible for calling
   *  `finish` / `fail` to close the lifecycle. When `runId` is provided
   *  the store uses it instead of its own generator — the dispatcher mints
   *  the id externally so a `component`-mode `mountInstruction.runId` can
   *  match the record id. */
  start(
    req: SkillRunRequest,
    sessionId: string | null,
    mode: SkillExecutionMode,
    mountInstruction?: SkillMountInstruction,
    runId?: SkillRunId
  ): SkillRunRecord;
  finish(runId: SkillRunId): SkillRunRecord;
  fail(runId: SkillRunId, error: string): SkillRunRecord;
  get(runId: SkillRunId): SkillRunRecord | null;
  list(skillId?: SkillId, limit?: number): SkillRunRecord[];
}

// ── Capability matcher port ──────────────────────────────────────────────
// Subscribes to `mcp.tools.changed` (Phase 5 event) and recomputes per
// skill: which `requires.tools[]` entries are satisfied right now, and
// which `requires.optional[]` entries are currently live.

export interface SkillAvailability {
  skillId: SkillId;
  runnable: boolean;
  /** Required-tool entries that are NOT currently satisfied. Empty when
   *  `runnable === true`. Drives the "Requires …" tooltip on greyed-out
   *  cards in the library. */
  missing: ReadonlyArray<RequiredTool>;
  /** Optional-tool entries the matcher confirmed are live. Forwarded to
   *  prompt-mode skills as a system-prompt hint so the body can branch on
   *  the presence of nice-to-haves. */
  optionalPresent: ReadonlyArray<RequiredTool>;
}

export interface CapabilityMatcher {
  snapshot(): ReadonlyArray<SkillAvailability>;
  /** Subscribe; returns an unsubscribe fn. */
  subscribe(
    listener: (availability: ReadonlyArray<SkillAvailability>) => void
  ): () => void;
}

// ── Runner port ──────────────────────────────────────────────────────────
// Three-mode dispatcher. Picks the mode via `resolveExecutionMode`,
// renders inputs, calls into the right per-mode handler, and publishes
// `skills.run.*` lifecycle events on the shared event-bus.

export interface SkillRunner {
  run(req: SkillRunRequest): Promise<SkillRunRecord>;
}

// ── Public facade ────────────────────────────────────────────────────────
// Backend HTTP routes + desktop hooks call into this. Concrete wiring
// happens in apps/backend (mounts the routes) and in @pipefx/skills/ui
// (the React hooks call the routes via fetch); the interface here is the
// contract those layers agree on.

export interface SkillsApi {
  listSkills(): InstalledSkill[];
  getSkill(id: SkillId): InstalledSkill | null;
  /** Reactive view: each entry pairs a skill with its current
   *  availability snapshot. */
  listAvailability(): ReadonlyArray<SkillAvailability>;
  subscribeAvailability(
    listener: (availability: ReadonlyArray<SkillAvailability>) => void
  ): () => void;
  installSkill(loaded: LoadedSkill, opts: InstallOptions): InstalledSkill;
  uninstallSkill(id: SkillId): boolean;
  runSkill(req: SkillRunRequest): Promise<SkillRunRecord>;
}
