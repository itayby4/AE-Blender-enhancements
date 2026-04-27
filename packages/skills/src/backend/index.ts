// ── @pipefx/skills/backend ───────────────────────────────────────────────
// Public surface for backend wiring. Apps consume this via the
// `@pipefx/skills/backend` subpath export — no deep imports allowed.
//
// Phase 12.6 surface:
//   • Storage:    `createSkillMdStorage` (two-root SkillStore over disk)
//   • Loader:     `loadSkillsFromDir`, `loadSkillFromDir`
//   • Run store:  `createSkillRunStore` (in-memory ring buffer)
//   • Spawner:    `createScriptRunner` (child-process host for script-mode)
//   • Routes:     `mountSkillRoutes` + the per-namespace registrars

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
  type SkillMdStorageOptions,
} from './services/skill-md-storage.js';

export {
  createSkillRunStore,
  type SkillRunStoreOptions,
} from './services/skill-run-store.js';

export {
  createScriptRunner,
  resolveScriptInterpreter,
  type CreateScriptRunnerOptions,
  type ScriptRunnerLineKind,
} from './services/script-runner.js';

export {
  registerSkillBrainTools,
  CREATE_SKILL_TOOL_NAME,
  type RegisterSkillBrainToolsDeps,
  type SkillBrainToolRegistry,
} from './services/skill-brain-tools.js';

export {
  mountSkillRoutes,
  type MountSkillRoutesDeps,
} from './mount.js';

export {
  registerSkillRoutes,
  type RegisterSkillRoutesDeps,
} from './routes/skills.js';

export {
  registerRunRoutes,
  type RegisterRunRoutesDeps,
} from './routes/runs.js';

export type { RouterLike, RouteHandler } from './internal/http.js';
