// ── @pipefx/media-gen/backend ────────────────────────────────────────────
// Public surface for HTTP-side wiring. Apps import `mountMediaGenRoutes`
// to register the two endpoints in one call.

export {
  mountMediaGenRoutes,
  type MediaGenRouter,
  type MountMediaGenRoutesDeps,
} from './mount.js';
