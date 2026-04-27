// ── @pipefx/command-palette — root barrel ────────────────────────────────
// Re-exports the contracts. The UI lives at the `./ui` subpath so server-
// side consumers (sourcing commands without rendering) avoid the React
// import.

export type {
  CommandIcon,
  CommandItem,
  CommandSource,
} from './contracts/index.js';
