// ── @pipefx/skills/domain — script-runner port ───────────────────────────
// Phase 12.5 dispatcher seam for `script`-mode runs. The concrete spawner
// lands in 12.6 under `@pipefx/skills/backend` (child-process, stdin JSON,
// line-by-line stdout, hard timeout). The dispatcher only sees this port,
// which keeps the runner unit-testable without a real subprocess.

import type { InstalledSkill, SkillRunId } from '../../contracts/api.js';

export interface ScriptRunInput {
  /** Run id minted by the dispatcher. Forwarded so the spawner can tag
   *  streamed output lines with the right record. */
  readonly runId: SkillRunId;
  /** The installed skill being run. The runner reads `installPath` and
   *  `frontmatter.scripts.entry` to resolve the script's absolute path. */
  readonly skill: InstalledSkill;
  /** Form values from the run request — forwarded as JSON on stdin. */
  readonly inputs: Readonly<Record<string, string | number | boolean>>;
  /** Optional cancellation. The 12.6 spawner kills the child on abort. */
  readonly signal?: AbortSignal;
}

export interface ScriptRunResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

export interface ScriptRunner {
  run(input: ScriptRunInput): Promise<ScriptRunResult>;
}
