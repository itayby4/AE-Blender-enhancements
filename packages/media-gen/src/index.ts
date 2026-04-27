// ── @pipefx/media-gen ────────────────────────────────────────────────────
// Feature package wrapping image / video / sound generation. Sits one
// layer above `@pipefx/media-providers` (the SDK adapters) and owns the
// workflow tier: the HTTP route the desktop calls (`POST /api/ai-models`),
// the save-to-disk job (`POST /api/save-render`), and the request /
// response contracts shared with the dashboards.
//
// Layout mirrors `@pipefx/post-production`:
//   • `/contracts` — wire types, no runtime
//   • `/backend`   — `mountMediaGenRoutes` for `apps/backend`
//   • `/jobs`      — dispatch + save-render helpers
//
// The desktop dashboards (apps/desktop/src/features/image-gen,
// apps/desktop/src/features/video-gen, apps/desktop/src/features/node-system)
// stay where they are — this package owns the *what*, the dashboards own
// the *how it's drawn*.

export type {
  MediaGenRequest,
  MediaGenResponse,
  SaveRenderRequest,
  SaveRenderResponse,
} from './contracts/index.js';
