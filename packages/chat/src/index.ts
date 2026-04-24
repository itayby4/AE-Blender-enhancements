// ── @pipefx/chat — root barrel ────────────────────────────────────────────
// The public surface is the four subpath entries (`./contracts`, `./ui`,
// `./backend`, plus `./package.json`). The root re-exports contracts so a
// consumer that only needs types doesn't have to reach for a subpath.
export * from './contracts/index.js';
