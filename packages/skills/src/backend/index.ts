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
