// ── @pipefx/skills/domain — script-mode handler ──────────────────────────
// Thin pass-through to the injected `ScriptRunner` port. The dispatcher
// (runner/index.ts) is responsible for guarding `mode === 'script'`; this
// handler additionally validates that the frontmatter actually carries a
// `scripts.entry`, since `resolveExecutionMode` could be called against a
// hand-built frontmatter that violates the schema.

import type {
  InstalledSkill,
  SkillRunId,
  SkillRunRequest,
} from '../../contracts/api.js';
import type { ScriptRunner, ScriptRunResult } from './script-runner.js';

export interface ScriptModeRunInput {
  readonly runId: SkillRunId;
  readonly skill: InstalledSkill;
  readonly req: SkillRunRequest;
  readonly scriptRunner: ScriptRunner;
  readonly signal?: AbortSignal;
}

export async function runScriptMode(
  input: ScriptModeRunInput
): Promise<ScriptRunResult> {
  const entry = input.skill.loaded.frontmatter.scripts?.entry;
  if (!entry) {
    throw new Error(
      `script-mode skill "${input.skill.loaded.frontmatter.id}" missing scripts.entry`
    );
  }
  return input.scriptRunner.run({
    runId: input.runId,
    skill: input.skill,
    inputs: input.req.inputs,
    signal: input.signal,
  });
}
