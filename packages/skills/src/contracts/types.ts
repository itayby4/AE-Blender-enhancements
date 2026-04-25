// ── @pipefx/skills/contracts — core types ────────────────────────────────
// Frozen public surface for the skills subsystem. Adding a field is
// additive; removing or tightening is a semver bump.
//
// References: Refactore/phase-07-skills.md.

// ── Identity ─────────────────────────────────────────────────────────────

/** Stable, user-visible skill identifier. Reverse-DNS encouraged
 *  ("com.acme.cut-to-beat") but not enforced — the only hard rule is the
 *  charset, validated by the Zod manifest schema in the domain layer. */
export type SkillId = string;

/** Run identifier — UUID minted by the runner when a run starts. */
export type SkillRunId = string;

// ── Inputs ───────────────────────────────────────────────────────────────

export type SkillInputType = 'string' | 'number' | 'boolean' | 'enum';

export interface SkillInput {
  /** Variable name as referenced inside the prompt template (`{{name}}`). */
  name: string;
  type: SkillInputType;
  /** Human-readable form-field label. Falls back to `name`. */
  label?: string;
  description?: string;
  required?: boolean;
  /** Default value if the user submits the form blank. Type must match. */
  default?: string | number | boolean;
  /** Required when `type === 'enum'`. */
  options?: ReadonlyArray<string>;
}

// ── Capability requirements ──────────────────────────────────────────────
// Matched against the live ConnectorRegistry by capability-matcher.ts.
// `connectorId` matches a registered connector; `toolName` matches a tool
// that connector exposes. Either may be omitted to match more loosely.

export interface CapabilityRequirement {
  connectorId?: string;
  toolName?: string;
  /** Human-readable hint shown in the "Requires …" tooltip when the
   *  requirement is unmet. */
  description?: string;
}

// ── Manifest ─────────────────────────────────────────────────────────────

export interface SkillAuthor {
  name?: string;
  /** Hex-encoded Ed25519 public-key fingerprint. Populated when the skill
   *  ships inside a signed `.pfxskill` bundle. */
  publicKeyFingerprint?: string;
}

/**
 * The on-disk skill definition. Persists inside `manifest.json` of every
 * `.pfxskill` bundle and inside the installed-skill row.
 *
 * Signing covers the canonical-JSON serialization of this object plus the
 * prompt and bundled resources. `requires.capabilities` is INCLUDED in the
 * signature — but the install consent prompt explicitly re-displays it so
 * the user sees what the skill will reach for. See signing.ts (Phase 7.4).
 */
export interface SkillManifest {
  /** Bumped when the manifest schema changes. v1 throughout Phase 7. */
  schemaVersion: 1;
  id: SkillId;
  /** Skill semver — distinct from schemaVersion. */
  version: string;
  name: string;
  description: string;
  /** Free-form category for library grouping ("editing", "analysis", …). */
  category?: string;
  /** Lucide icon name; UI falls back to a generic glyph if absent. */
  icon?: string;
  author?: SkillAuthor;
  inputs: ReadonlyArray<SkillInput>;
  /** Mustache-style template body. Variables are resolved against the
   *  user's input form by template-engine.ts (Phase 7.2). */
  prompt: string;
  requires: {
    capabilities: ReadonlyArray<CapabilityRequirement>;
  };
}

// ── Installed-skill record ───────────────────────────────────────────────

export type SkillSource = 'local' | 'bundle' | 'remote';

export interface InstalledSkill {
  manifest: SkillManifest;
  source: SkillSource;
  installedAt: number;
  /** True iff the bundle carried a valid Ed25519 signature. */
  signed: boolean;
  /** Author fingerprint at install time. Stored separately from
   *  manifest.author so a tampered manifest can't lie about it. */
  fingerprint?: string;
  /** Filesystem path of the unpacked bundle (for `local` / `bundle`). */
  installPath?: string;
}

// ── Availability snapshot ────────────────────────────────────────────────
// Computed by capability-matcher.ts from the current ConnectorRegistry +
// the installed-skill set. Drives the SkillLibrary "lit / greyed" state.

export interface SkillAvailability {
  skillId: SkillId;
  runnable: boolean;
  /** Capability requirements that are NOT currently satisfied. Used to
   *  populate the tooltip on greyed-out cards. Empty when runnable. */
  missing: ReadonlyArray<CapabilityRequirement>;
}

// ── Run records ──────────────────────────────────────────────────────────

export type SkillRunStatus = 'pending' | 'running' | 'succeeded' | 'failed';

export interface SkillRunRequest {
  skillId: SkillId;
  /** Form values keyed by SkillInput.name. */
  inputs: Readonly<Record<string, string | number | boolean>>;
  /** Optional chat session to attach the run to — when omitted the runner
   *  creates a fresh session. */
  sessionId?: string;
}

export interface SkillRunRecord {
  id: SkillRunId;
  skillId: SkillId;
  sessionId: string | null;
  status: SkillRunStatus;
  startedAt: number;
  finishedAt?: number;
  /** Populated when status === 'failed'. */
  error?: string;
}
