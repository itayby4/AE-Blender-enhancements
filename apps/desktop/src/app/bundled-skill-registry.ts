// ── Desktop bundled-skill registry singleton ─────────────────────────────
// `BundledSkillHost` (from `@pipefx/skills/ui`) resolves component-mode
// skills by looking up their `bundledUi.entry` string in this registry.
// `@pipefx/skills-builtin` seeds it at module load via
// `registerBuiltInSkills`; user-installed bundled skills are out of scope
// for Phase 12.

import { createBundledSkillRegistry } from '@pipefx/skills/ui';
import { registerBuiltInSkills } from '@pipefx/skills-builtin';

export const bundledSkillRegistry = createBundledSkillRegistry();

registerBuiltInSkills(bundledSkillRegistry);
