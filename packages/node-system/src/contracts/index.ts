// ── Contracts subpath export ────────────────────────────────────────────────
// Pure types + the chat → editor command bridge. Safe to import from any
// scope (no React, no Tauri).
export {
  onPipelineActions,
  dispatchPipelineActions,
  type PipelineAction,
} from './pipeline-actions.js';
