# ADR — Chat transcripts stay in `@pipefx/brain-memory`; `@pipefx/chat` consumes them via ports

**Status:** accepted · **Date:** 2026-04-25 · **Phase:** 6.1

## Decision

Conversation transcripts (the `chat_sessions` + `chat_messages` SQLite tables
introduced in Phase 4) keep living physically inside `@pipefx/brain-memory`.
The existing schema, file location, and migration are **not changed**.

`@pipefx/chat` consumes those tables through **two port interfaces** defined
in `@pipefx/chat/contracts`:

- `ChatSessionStore` — create / list / get / rename / delete a session.
- `TranscriptStore` — append / read messages for a session.

`@pipefx/brain-memory` implements both ports (adapter lives in brain-memory,
next to the SQL). `apps/backend` wires the concrete adapter into
`mountChatRoutes({ sessions, transcripts, ... })`. `chat-service.ts` accepts
the ports as injected deps, so its compile-time imports stay restricted to
`@pipefx/brain-contracts` — satisfying the Phase 6 deliverable rule.

The `data/` layer in this package is therefore **currently empty** and holds
only this ADR. If chat ever needs its own local storage — e.g. sidebar
ordering, pinning, client-side tags — that metadata can land here without
touching the transcript.

## Why

- **Deliverable rule:** "`chat-service.ts` only depends on
  `@pipefx/brain-contracts` — not brain internals." Dependency inversion
  via ports is the lightweight seam that enforces it.
- **No migration:** moving tables into `@pipefx/chat/data` would require a
  SQLite schema move and a one-time data copy. The risk/benefit doesn't
  pencil out for Phase 6 — the goal is consolidating the chat _surface_,
  not relocating storage.
- **Single source of truth:** the backend already owns the authoritative
  transcript. Phase 6.3 replaces the desktop's parallel `localStorage`
  history with `GET /api/sessions` against this same store, closing the
  current unsynced-copy bug (option **B** from the 6.1 briefing).

## Rejected alternatives

1. **Move `chat_messages` into `@pipefx/chat/data`.** Requires a migration,
   doubles the storage surface, and — because brain-memory's context
   assembly reads transcripts — would force brain-memory to import from
   chat. Inverts the dependency direction we want.
2. **Let `chat-service.ts` import directly from `@pipefx/brain-memory`.**
   Simpler today but violates the deliverable rule and couples chat to
   brain-memory's internal table shape. Makes a future `chat-local`
   storage harder, not easier.

## Revisit if

- Chat grows metadata that has no natural home in the transcript (pinning,
  per-session UI settings, client-only tags). At that point create
  `data/chat-local.ts` here and a separate SQLite table co-located with
  `@pipefx/chat`.
- `@pipefx/brain-memory` splits transcript storage out of the KB. The port
  interface stays; only the adapter moves.
