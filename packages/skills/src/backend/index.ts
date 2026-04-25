// ── @pipefx/skills/backend ───────────────────────────────────────────────
// Public surface for backend wiring. Apps consume this via the
// `@pipefx/skills/backend` subpath export — no deep imports allowed.

export { mountSkillRoutes, type SkillMountDeps } from './mount.js';

export {
  createSkillStorage,
  type SkillStorageOptions,
} from './services/skill-storage.js';

export {
  createSkillRunStore,
  type SkillRunStoreOptions,
} from './services/skill-run-store.js';

export {
  registerSkillRoutes,
  type SkillRouteDeps,
} from './routes/skills.js';
export {
  registerRunRoutes,
  type RunRouteDeps,
} from './routes/runs.js';

export type { RouterLike, RouteHandler } from './internal/http.js';

// ── v2 (Phase 12) — SKILL.md loader + storage ───────────────────────────

export {
  loadSkillsFromDir,
  loadSkillFromDir,
  type LoadSkillsResult,
  type LoadSkillError,
  type LoadSkillFromDirOptions,
  type LoadSkillFromDirResult,
} from './services/skill-md-loader.js';

export {
  createSkillMdStorage,
  type SkillMdStore,
  type SkillMdStorageOptions,
  type SkillMdSource,
  type InstalledSkillMd,
  type InstallSkillMdOptions,
} from './services/skill-md-storage.js';
