import { registerChatRoutes, type ChatRouteDeps } from './routes/chat.js';
import { registerSessionRoutes } from './routes/sessions.js';
import type { RouterLike } from './internal/http.js';

/**
 * Public mount surface for `@pipefx/chat/backend`. Wires the chat turn
 * routes (`POST /chat`, `POST /chat/stream`) and the session-history
 * REST routes onto the provided router.
 *
 * `ChatMountDeps` currently matches `ChatRouteDeps` one-for-one; 6.5 will
 * narrow this surface further once the brain-contracts-only chat-service
 * lands.
 */
export type ChatMountDeps = ChatRouteDeps;

export function mountChatRoutes(router: RouterLike, deps: ChatMountDeps) {
  registerChatRoutes(router, deps);
  registerSessionRoutes(router);
}
