// ── @pipefx/skills/domain — runner ───────────────────────────────────────
// Orchestrates one skill execution end-to-end:
//
//   1. Look up the manifest in the SkillStore.
//   2. Confirm the skill is runnable against the live tool surface (the
//      capability-matcher snapshot). Skills the UI grayed out can still
//      reach this code path via direct API calls; the runner is the last
//      line of defense.
//   3. Optional quota / credit check (Phase 8 Billing wires in here).
//   4. Render the prompt template against the user's inputs.
//   5. Start the run record + publish `skills.run.started`.
//   6. Hand the rendered prompt + scoped allowedTools to BrainLoopApi.chat.
//   7. On success → finish record + `skills.run.finished`.
//      On failure → fail record + `skills.run.failed`.
//
// What the runner does NOT do:
//
//   • Persist the brain's output transcript. That is brain-tasks territory
//     and is keyed off the sessionId the runner forwards. The skill run
//     record only carries lifecycle status; the actual conversation lives
//     in the chat session.
//   • Sanitize prompt injection from input values. That is brain-loop's
//     job (input sanitization at the model-call boundary). The runner is
//     deliberately a thin composer.
//   • Verify signatures. Signatures are checked at install time by the
//     storage layer (Phase 7.6); once a skill is installed the runner
//     trusts the persisted manifest.

import type { BrainLoopApi } from '@pipefx/brain-contracts';
import type { EventBus } from '@pipefx/event-bus';

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
  SkillManifest,
  SkillRunRecord,
  SkillRunRequest,
} from '../contracts/types.js';

import {
  renderManifestPrompt,
  type SkillInputValues,
} from './template-engine.js';

// ── Public types ─────────────────────────────────────────────────────────

/**
 * Hook the billing layer (Phase 8) plugs into. Called once per run BEFORE
 * the run record is created, so a denial leaves the run history clean.
 *
 * Implementations may either return a denial decision or throw. Throwing
 * is convenient for "user is offline / credit service unreachable" — the
 * runner converts the thrown error into a `SkillRunQuotaError` so callers
 * can branch on it.
 */
export type QuotaChecker = (
  manifest: SkillManifest,
  request: SkillRunRequest
) => void | Promise<void> | QuotaDecision | Promise<QuotaDecision>;

export interface QuotaDecision {
  allowed: boolean;
  /** Surfaced to the user when allowed === false. */
  reason?: string;
}

export interface SkillRunnerConfig {
  store: SkillStore;
  runs: SkillRunStore;
  matcher: CapabilityMatcher;
  brain: BrainLoopApi;
  bus: EventBus<SkillEventMap>;
  /** Optional credit / quota gate. If omitted, every request proceeds. */
  quota?: QuotaChecker;
  /**
   * Wall-clock source — pluggable so tests can pin timestamps. Defaults to
   * `Date.now`. Used only for event payload timestamps; the run record's
   * own timestamps come from the SkillRunStore.
   */
  now?: () => number;
}

export interface SkillRunner {
  run(request: SkillRunRequest): Promise<SkillRunRecord>;
}

// ── Errors ───────────────────────────────────────────────────────────────
// Typed so callers (HTTP routes, UI hooks) can branch on the failure mode
// without scraping the message. Pre-execution failures throw; in-flight
// failures resolve with a `failed` record.

export class SkillNotFoundError extends Error {
  readonly code = 'SKILL_NOT_FOUND' as const;
  constructor(public readonly skillId: string) {
    super(`skill "${skillId}" is not installed`);
    this.name = 'SkillNotFoundError';
  }
}

export class SkillUnavailableError extends Error {
  readonly code = 'SKILL_UNAVAILABLE' as const;
  constructor(
    public readonly skillId: string,
    public readonly missing: ReadonlyArray<CapabilityRequirement>
  ) {
    super(
      `skill "${skillId}" is not runnable: ${missing.length} unmet capability requirement(s)`
    );
    this.name = 'SkillUnavailableError';
  }
}

export class SkillRunQuotaError extends Error {
  readonly code = 'SKILL_RUN_QUOTA' as const;
  constructor(
    public readonly skillId: string,
    public override readonly cause?: unknown,
    reason?: string
  ) {
    super(reason ?? `skill "${skillId}" denied by quota check`);
    this.name = 'SkillRunQuotaError';
  }
}

// ── Public factory ───────────────────────────────────────────────────────

export function createSkillRunner(config: SkillRunnerConfig): SkillRunner {
  const { store, runs, matcher, brain, bus, quota } = config;
  const now = config.now ?? Date.now;

  return {
    async run(request) {
      const installed = store.get(request.skillId);
      if (!installed) throw new SkillNotFoundError(request.skillId);
      const manifest = installed.manifest;

      // Availability is recomputed on every mcp.tools.changed event by the
      // matcher; reading the snapshot here is O(installed-skills) and
      // doesn't trigger a live MCP probe.
      const availability = matcher
        .snapshot()
        .find((entry) => entry.skillId === request.skillId);
      if (availability && !availability.runnable) {
        throw new SkillUnavailableError(request.skillId, availability.missing);
      }

      if (quota) {
        try {
          const decision = await quota(manifest, request);
          if (decision && decision.allowed === false) {
            throw new SkillRunQuotaError(
              request.skillId,
              undefined,
              decision.reason
            );
          }
        } catch (error) {
          if (error instanceof SkillRunQuotaError) throw error;
          throw new SkillRunQuotaError(request.skillId, error);
        }
      }

      const prompt = renderManifestPrompt(
        manifest,
        request.inputs as SkillInputValues
      ).text;

      const sessionId = request.sessionId ?? null;
      const started = runs.start(request, sessionId);

      const startedEvent: SkillRunStartedEvent = {
        runId: started.id,
        skillId: started.skillId,
        sessionId: started.sessionId,
        startedAt: now(),
      };
      void bus.publish('skills.run.started', startedEvent);

      const allowedTools = deriveAllowedTools(manifest);

      try {
        await brain.chat(prompt, {
          sessionId: sessionId ?? undefined,
          allowedTools,
        });
        const finished = runs.finish(started.id);
        const finishedEvent: SkillRunFinishedEvent = {
          runId: finished.id,
          skillId: finished.skillId,
          sessionId: finished.sessionId,
          finishedAt: now(),
        };
        void bus.publish('skills.run.finished', finishedEvent);
        return finished;
      } catch (error) {
        const message = errorMessage(error);
        const failed = runs.fail(started.id, message);
        const failedEvent: SkillRunFailedEvent = {
          runId: failed.id,
          skillId: failed.skillId,
          sessionId: failed.sessionId,
          finishedAt: now(),
          error: message,
        };
        void bus.publish('skills.run.failed', failedEvent);
        return failed;
      }
    },
  };
}

// ── Helpers (exported for tests + tooling) ───────────────────────────────

/**
 * Reduce the manifest's capability requirements to a concrete `allowedTools`
 * list to hand to the brain loop.
 *
 *   • Every requirement that names a `toolName` contributes that name.
 *   • A requirement that names only `connectorId` (no specific tool) widens
 *     the surface — we can't enumerate that connector's tools from the
 *     domain layer without reaching into the registry, so we fall back to
 *     `undefined` (= "all tools") and rely on the connector-id constraint
 *     being implicit in the manifest's capability list. Tightening this is
 *     a Phase 7.6 concern when the runner is wired with a registry-aware
 *     adapter.
 *   • A skill with zero capabilities (LLM-only) gets `[]` — the brain may
 *     not call any tool at all, only the model.
 */
export function deriveAllowedTools(
  manifest: SkillManifest
): string[] | undefined {
  const tools = new Set<string>();
  let connectorOnly = false;
  for (const requirement of manifest.requires.capabilities) {
    if (requirement.toolName) {
      tools.add(requirement.toolName);
    } else if (requirement.connectorId) {
      connectorOnly = true;
    }
  }
  if (connectorOnly) return undefined;
  if (tools.size === 0) return [];
  return [...tools];
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}
