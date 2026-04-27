// ── @pipefx/skills/domain — component-mode handler ───────────────────────
// `component`-mode runs hand off to a bundled React module that the
// desktop runner host mounts. The dispatcher's job is just to build the
// `mountInstruction` carried by the run record — there's no async work
// the dispatcher itself needs to await. The host owns the component's
// lifetime and calls `runStore.finish/.fail` when it's done.
//
// `entry` is forwarded verbatim — the registry key the host uses to look
// the React module up is the frontmatter `bundledUi.entry` string. Mount
// defaults to `'modal'` to match the schema default.

import type {
  InstalledSkill,
  SkillMountInstruction,
  SkillRunId,
  SkillRunRequest,
} from '../../contracts/api.js';

export function buildMountInstruction(
  runId: SkillRunId,
  skill: InstalledSkill,
  req: SkillRunRequest
): SkillMountInstruction {
  const ui = skill.loaded.frontmatter.bundledUi;
  if (!ui) {
    throw new Error(
      `component-mode skill "${skill.loaded.frontmatter.id}" missing bundledUi.entry`
    );
  }
  return {
    runId,
    skillId: skill.loaded.frontmatter.id,
    entry: ui.entry,
    mount: ui.mount ?? 'modal',
    inputs: req.inputs,
  };
}
