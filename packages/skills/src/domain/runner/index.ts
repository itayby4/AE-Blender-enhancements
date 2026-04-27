// ── @pipefx/skills/domain — three-mode runner dispatcher ─────────────────
// Phase 12.5. Resolves the execution mode via `resolveExecutionMode`,
// mints a run id, opens a record on the run store (carrying a
// `mountInstruction` for `component`-mode runs), publishes
// `skills.run.started`, dispatches to the matching handler, and finishes
// or fails the record on the way out.
//
// Component-mode is the special case: the dispatcher emits the mount
// instruction and returns the still-running record without awaiting any
// work. The desktop runner host owns the component's lifetime and calls
// `runStore.finish` / `runStore.fail` once the component unmounts.
//
// Optional-tool hints for prompt mode are pulled from the (optional)
// capability matcher snapshot at run-start, so authors can branch on the
// presence of nice-to-haves without re-querying the bus.

import type { BrainLoopApi } from '@pipefx/brain-contracts';
import type { EventBus } from '@pipefx/event-bus';

import type {
  CapabilityMatcher,
  SkillRunner,
  SkillRunRecord,
  SkillRunRequest,
  SkillRunStore,
  SkillStore,
} from '../../contracts/api.js';
import type { SkillEventMap } from '../../contracts/events.js';
import {
  resolveExecutionMode,
  type SkillId,
} from '../../contracts/skill-md.js';
import { buildMountInstruction } from './component-mode.js';
import { runPromptMode } from './prompt-mode.js';
import { runScriptMode } from './script-mode.js';
import type { ScriptRunner } from './script-runner.js';

export interface SkillRunnerDeps {
  readonly store: SkillStore;
  readonly runStore: SkillRunStore;
  readonly bus: EventBus<SkillEventMap>;
  readonly brain: BrainLoopApi;
  /** Required for `script`-mode runs. The dispatcher rejects script-mode
   *  invocations when this is missing instead of silently no-op'ing. */
  readonly scriptRunner?: ScriptRunner;
  /** Optional matcher used to enrich prompt-mode messages with the
   *  optional-tool list. When absent the hint is omitted. */
  readonly matcher?: CapabilityMatcher;
  /** Run-id minter. Defaults to a counter+timestamp combo good enough for
   *  in-process use; tests pin this for deterministic ids. */
  readonly generateRunId?: () => string;
}

function defaultRunIdGenerator(): () => string {
  let counter = 0;
  return () => {
    counter += 1;
    const stamp = Date.now().toString(36);
    const rand = Math.random().toString(36).slice(2, 8);
    return `run-${stamp}-${counter.toString(36)}-${rand}`;
  };
}

function lookupOptionalPresent(
  matcher: CapabilityMatcher | undefined,
  skillId: SkillId
) {
  if (!matcher) return undefined;
  const entry = matcher.snapshot().find((a) => a.skillId === skillId);
  return entry?.optionalPresent;
}

export function createSkillRunner(deps: SkillRunnerDeps): SkillRunner {
  const generateRunId = deps.generateRunId ?? defaultRunIdGenerator();

  return {
    async run(req: SkillRunRequest): Promise<SkillRunRecord> {
      const skill = deps.store.get(req.skillId);
      if (!skill) {
        throw new Error(`skill "${req.skillId}" not installed`);
      }
      const mode = resolveExecutionMode(skill.loaded.frontmatter);
      const sessionId = req.sessionId ?? null;
      const runId = generateRunId();

      const mountInstruction =
        mode === 'component'
          ? buildMountInstruction(runId, skill, req)
          : undefined;

      const record = deps.runStore.start(
        req,
        sessionId,
        mode,
        mountInstruction,
        runId
      );

      void deps.bus.publish('skills.run.started', {
        runId: record.id,
        skillId: record.skillId,
        mode: record.mode,
        sessionId: record.sessionId,
        startedAt: record.startedAt,
      });

      // Component mode: hand off to the desktop host. The record stays
      // `running` until the host closes it via runStore.finish/.fail.
      if (mode === 'component') {
        return record;
      }

      try {
        if (mode === 'prompt') {
          await runPromptMode({
            skill,
            req,
            brain: deps.brain,
            optionalPresent: lookupOptionalPresent(deps.matcher, req.skillId),
          });
        } else {
          if (!deps.scriptRunner) {
            throw new Error('script-mode runner is not configured');
          }
          await runScriptMode({
            runId: record.id,
            skill,
            req,
            scriptRunner: deps.scriptRunner,
          });
        }
        const finished = deps.runStore.finish(record.id);
        void deps.bus.publish('skills.run.finished', {
          runId: finished.id,
          skillId: finished.skillId,
          mode: finished.mode,
          sessionId: finished.sessionId,
          finishedAt: finished.finishedAt ?? Date.now(),
        });
        return finished;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const failed = deps.runStore.fail(record.id, message);
        void deps.bus.publish('skills.run.failed', {
          runId: failed.id,
          skillId: failed.skillId,
          mode: failed.mode,
          sessionId: failed.sessionId,
          finishedAt: failed.finishedAt ?? Date.now(),
          error: message,
        });
        return failed;
      }
    },
  };
}

export { buildMountInstruction } from './component-mode.js';
export { deriveAllowedTools, runPromptMode } from './prompt-mode.js';
export { runScriptMode } from './script-mode.js';
export { renderTemplate } from './template.js';
export type {
  ScriptRunInput,
  ScriptRunResult,
  ScriptRunner,
} from './script-runner.js';
export type { PromptModeRunInput, PromptModeRunResult } from './prompt-mode.js';
export type { ScriptModeRunInput } from './script-mode.js';
export type { TemplateValues } from './template.js';
