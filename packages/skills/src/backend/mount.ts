// ── @pipefx/skills/backend — public mount surface ────────────────────────
// Wires the skills + runs routes onto the host router. The host (apps/
// backend) owns the SkillStore, SkillRunStore, CapabilityMatcher, and
// SkillRunner instances and passes them through here so the package
// stays free of concrete adapters.

import type { EventBus } from '@pipefx/event-bus';

import type {
  CapabilityMatcher,
  SkillRunner,
  SkillRunStore,
  SkillStore,
} from '../contracts/api.js';
import type { SkillEventMap } from '../contracts/events.js';
import { registerRunRoutes } from './routes/runs.js';
import { registerSkillRoutes } from './routes/skills.js';
import type { RouterLike } from './internal/http.js';

export interface MountSkillRoutesDeps {
  readonly store: SkillStore;
  readonly runs: SkillRunStore;
  readonly matcher: CapabilityMatcher;
  readonly runner: SkillRunner;
  readonly bus: EventBus<SkillEventMap>;
  readonly now?: () => number;
  /** Forwarded to the install route — see
   *  `RegisterSkillRoutesDeps.trustedPublicKeys`. */
  readonly trustedPublicKeys?: ReadonlyArray<string>;
}

export function mountSkillRoutes(
  router: RouterLike,
  deps: MountSkillRoutesDeps
): void {
  registerSkillRoutes(router, {
    store: deps.store,
    matcher: deps.matcher,
    bus: deps.bus,
    now: deps.now,
    trustedPublicKeys: deps.trustedPublicKeys,
  });
  registerRunRoutes(router, {
    store: deps.store,
    runner: deps.runner,
    runs: deps.runs,
    matcher: deps.matcher,
  });
}
