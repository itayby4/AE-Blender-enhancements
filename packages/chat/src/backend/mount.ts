import { registerChatRoutes, type ChatRouteDeps } from './routes/chat.js';
import { registerSessionRoutes } from './routes/sessions.js';
import type { RouterLike } from './internal/http.js';

/**
 * Public mount surface for `@pipefx/chat/backend`. Wires the chat turn
 * routes (`POST /chat`, `POST /chat/stream`) and the session-history
 * REST routes onto the provided router.
 *
 * Both surfaces share the `ChatSessionStore` + `TranscriptStore` ports
 * already on `ChatRouteDeps`, so callers pass a single deps object.
 */
export type ChatMountDeps = ChatRouteDeps;

export function mountChatRoutes(router: RouterLike, deps: ChatMountDeps) {
  registerChatRoutes(router, deps);
  registerSessionRoutes(router, {
    sessions: deps.sessions,
    transcript: deps.transcript,
  });
}
