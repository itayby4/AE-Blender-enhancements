// ── @pipefx/skills-builtin — registerBuiltInSkills ───────────────────────
// Desktop boot calls this with the host's `BundledSkillRegistry` (created
// via `createBundledSkillRegistry()` from `@pipefx/skills/ui`). Each entry
// in `BUILT_IN_SKILLS` is registered under its `entry` key; nothing else
// happens here — the SKILL.md files for these skills are loaded by the
// runtime's `<repo>/SKILL/` walk, which is independent of this seeding.

import type { BundledSkillComponent } from '@pipefx/skills/ui';

import { BUILT_IN_SKILLS } from './skills.js';

/** Minimal shape we need from the host registry. Avoids importing the
 *  concrete `BundledSkillRegistry` type so this module stays free of the
 *  `@pipefx/skills/ui` dependency footprint at the import surface. */
export interface BundledSkillRegistrar {
  register(entry: string, component: BundledSkillComponent): void;
}

/** Seeds the host's bundled-component registry with every built-in
 *  shipped by this package. Idempotent — re-registering an entry simply
 *  overwrites the previous component. */
export function registerBuiltInSkills(registry: BundledSkillRegistrar): void {
  for (const skill of BUILT_IN_SKILLS) {
    registry.register(skill.entry, skill.component);
  }
}
