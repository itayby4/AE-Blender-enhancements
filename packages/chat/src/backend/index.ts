// ── @pipefx/chat/backend — HTTP mount ────────────────────────────────────
// Public surface: `mountChatRoutes(router, deps)` wires the chat turn +
// session-history routes onto any router satisfying `RouterLike`.
//
// Phase 6.4 performs a near-verbatim move of the previous
// `apps/backend/src/routes/{chat,sessions}.ts` into this package. A few
// dependencies (prompt composer, usage cost helpers) are injected through
// `deps` so the package stays scope:feature-clean. Phase 6.5 introduces a
// proper chat-service that depends on `@pipefx/brain-contracts` only.

export { mountChatRoutes } from './mount.js';
export type { ChatMountDeps } from './mount.js';
export type {
  ChatRouteDeps,
  CostShape,
  UsageStoreLike,
} from './routes/chat.js';
export type {
  ChatServiceDeps,
  ChatTurnRequest,
  ChatTurnResult,
  ChatStreamRequest,
  StreamEmit,
} from './services/chat-service.js';
export { runChatTurn, runChatStream } from './services/chat-service.js';
export type { RouterLike, RouteHandler } from './internal/http.js';
