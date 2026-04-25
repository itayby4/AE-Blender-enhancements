// ── @pipefx/skills/backend — public mount surface ────────────────────────
// Wires the skills + runs routes onto the host router. The host (apps/
// backend) owns the SkillStore, SkillRunStore, CapabilityMatcher, and
// SkillRunner instances and passes them through here so the package
// stays free of concrete adapters.

import { registerRunRoutes, type RunRouteDeps } from './routes/runs.js';
import { registerSkillRoutes, type SkillRouteDeps } from './routes/skills.js';
import type { RouterLike } from './internal/http.js';

export type SkillMountDeps = SkillRouteDeps & RunRouteDeps;

export function mountSkillRoutes(router: RouterLike, deps: SkillMountDeps) {
  registerSkillRoutes(router, { store: deps.store, matcher: deps.matcher });
  registerRunRoutes(router, { runner: deps.runner, runs: deps.runs });
}
