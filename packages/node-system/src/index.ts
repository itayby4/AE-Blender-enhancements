// ── Main barrel ────────────────────────────────────────────────────────────
// Re-exports the contracts (chat → editor command bridge). The React
// surface lives at the dedicated `/ui` subpath so Node-only consumers
// (backend, tests, CLI) don't transitively pull React, ReactFlow, or Tauri.
export * from './contracts/index.js';
