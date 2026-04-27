// ── @pipefx/skills-builtin — built-in skill registry table ───────────────
// Each entry maps a `BundledSkillRegistry` key to the React module the
// host should mount. The key is the frontmatter `bundledUi.entry` string
// the runner forwards verbatim through `SkillMountInstruction.entry`.
//
// **Collision rule.** The registry is keyed globally, but `entry` is a
// path *inside the skill directory*. Built-in skills disambiguate by
// prefixing their entry with `<skillId>/` (e.g. `subtitles/ui/index.tsx`).
// User-installed bundled skills are out of scope for Phase 12 — once they
// land we'll switch the registry to `(skillId, entry)` composite keys.
//
// Side note: the SKILL.md sources for built-ins live under
// `<repo>/SKILL/<skillId>/` and are picked up by the loader's repo-root
// walk. This package only seeds the *component registry*; it does not
// register the skills themselves.

import type { BundledSkillComponent } from '@pipefx/skills/ui';

import SubtitlesSkill from './subtitles/ui/index.js';
import AudioSyncSkill from './audio-sync/ui/index.js';
import AutopodSkill from './autopod/ui/index.js';

export interface BuiltInSkill {
  /** Stable skill id; matches `<repo>/SKILL/<id>/SKILL.md` frontmatter. */
  id: string;
  /** Registry key — must equal `bundledUi.entry` in the SKILL.md (which
   *  uses the `<id>/...` prefix to stay globally unique). */
  entry: string;
  /** Component module the host mounts when the runner emits a
   *  `SkillMountInstruction` matching `entry`. */
  component: BundledSkillComponent;
}

/** Subtitles landed in 12.10. Audio Sync + Autopod migrated in 12.11. */
export const BUILT_IN_SKILLS: ReadonlyArray<BuiltInSkill> = [
  {
    id: 'subtitles',
    entry: 'subtitles/ui/index.tsx',
    component: SubtitlesSkill,
  },
  {
    id: 'audio-sync',
    entry: 'audio-sync/ui/index.tsx',
    component: AudioSyncSkill,
  },
  {
    id: 'autopod',
    entry: 'autopod/ui/index.tsx',
    component: AutopodSkill,
  },
];
