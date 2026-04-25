// ── @pipefx/skills/ui — public surface ───────────────────────────────────
// React hooks + headless components for embedding the skills experience.
// Re-exports a small set of contract types so consumers don't also need
// to import from `@pipefx/skills/contracts` for everyday use.

export { useSkills } from './hooks/use-skills.js';
export type { UseSkillsDeps, UseSkillsResult } from './hooks/use-skills.js';

export { useAvailableSkills } from './hooks/use-available-skills.js';
export type {
  UseAvailableSkillsDeps,
  UseAvailableSkillsResult,
} from './hooks/use-available-skills.js';

export { useSkillRun } from './hooks/use-skill-run.js';
export type {
  UseSkillRunDeps,
  UseSkillRunResult,
  SkillRunError,
  SkillRunErrorCode,
} from './hooks/use-skill-run.js';

export { SkillCard } from './components/SkillCard.js';
export type { SkillCardProps } from './components/SkillCard.js';

export { SkillLibrary } from './components/SkillLibrary.js';
export type { SkillLibraryProps } from './components/SkillLibrary.js';

export { SkillRunner } from './components/SkillRunner.js';
export type { SkillRunnerProps } from './components/SkillRunner.js';

export type {
  CapabilityRequirement,
  InstalledSkill,
  SkillAvailability,
  SkillId,
  SkillInput,
  SkillInputType,
  SkillManifest,
  SkillRunRecord,
  SkillRunRequest,
  SkillRunStatus,
} from '../contracts/types.js';
