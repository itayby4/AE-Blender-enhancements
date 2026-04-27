// ── @pipefx/skills/contracts ─────────────────────────────────────────────
// Frozen types, event-bus events, and port interfaces for the MD-based
// skill system. Semver-locked: adding fields is additive, removing or
// tightening is a bump. The previous v1 (JSON-manifest) contracts were
// removed in Phase 12.1 — there is one skill format from this point on.

export * from './skill-md.js';
export * from './api.js';
export * from './events.js';
