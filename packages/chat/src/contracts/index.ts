// ── @pipefx/chat/contracts — frozen types, events, ports ─────────────────
// Populated in sub-phase 6.2:
//   - types.ts      ChatMessage, Role, StreamEvent, SessionId
//   - events.ts     chat.session.created|deleted, chat.message.sent, ...
//   - api.ts        ChatSessionStore + TranscriptStore ports (dep-injected
//                   into chat-service so @pipefx/chat depends only on
//                   @pipefx/brain-contracts, not brain-memory internals)
export {};
