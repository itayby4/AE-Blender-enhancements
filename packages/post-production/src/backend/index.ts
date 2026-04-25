// ── @pipefx/post-production/backend ──────────────────────────────────────
// Public surface for HTTP-side wiring. Apps import `mountWorkflowRoutes`
// to register the four endpoints in one call; the handler factories +
// context builder are also re-exported for hosts that need finer control.

export {
  mountWorkflowRoutes,
  createAudioSyncHandler,
  createSubtitleHandler,
  createLocalToolContext,
  type WorkflowsRouter,
  type MountWorkflowRoutesDeps,
  type LocalToolContext,
} from './mount.js';
