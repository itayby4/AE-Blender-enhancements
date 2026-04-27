// ── @pipefx/skills-builtin — public surface ──────────────────────────────
// Built-in component-mode skills shipped with the desktop. Phase 12.9
// lands the skeleton; 12.10/12.11 migrate Subtitles / Audio Sync /
// Autopod into `src/<skillId>/ui/index.tsx` and add them to the registry
// table.

export {
  registerBuiltInSkills,
  type BundledSkillRegistrar,
} from './registry.js';

export {
  BUILT_IN_SKILLS,
  type BuiltInSkill,
} from './skills.js';
