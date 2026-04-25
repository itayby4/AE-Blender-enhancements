// ── @pipefx/post-production ──────────────────────────────────────────────
// Feature package wrapping the local post-production workflow surface:
// autopod, audio-sync, subtitles, understanding. Each workflow has a
// Python engine (under `python/` at the package root) and a TS
// orchestrator + dashboard inside `src/`.
//
// Phase 9.1 ships only the contracts. Subsequent sub-phases add:
//   • 9.2 — Python engines under `packages/post-production/python/`
//   • 9.3 — TS orchestrators + backend mount
//   • 9.4 — Desktop dashboards
//
// Until then, importing `@pipefx/post-production` gives you the contract
// types only; concrete workflow implementations live in their own
// per-workflow folders and aren't barreled here yet.

export type {
  // Identity
  WorkflowId,
  WorkflowRunId,
  // Media
  MediaClip,
  Timeline,
  TimelineTrack,
  TimelineItem,
  // Workflow descriptor + lifecycle
  WorkflowDescriptor,
  WorkflowContext,
  WorkflowStatus,
  WorkflowProgressEvent,
  WorkflowResult,
  WorkflowArtifact,
  WorkflowError,
  // Quota seam
  QuotaCheckRequest,
  QuotaDecision,
  QuotaChecker,
  // Events
  WorkflowStartedEvent,
  WorkflowProgressedEvent,
  WorkflowFinishedEvent,
  WorkflowEventMap,
} from './contracts/index.js';

export {
  WorkflowQuotaError,
  WorkflowEngineError,
} from './contracts/index.js';
