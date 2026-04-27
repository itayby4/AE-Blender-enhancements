// ── @pipefx/media-gen/contracts ──────────────────────────────────────────
// Pure type surface — no runtime imports. Both the desktop dashboards
// (image-gen, video-gen, node-system) and the backend route mount type
// against this barrel so their wire shapes can never silently drift.

export type {
  MediaGenRequest,
  MediaGenResponse,
  SaveRenderRequest,
  SaveRenderResponse,
} from './types.js';
