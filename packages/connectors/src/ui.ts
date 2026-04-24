// ── UI subpath export ──────────────────────────────────────────────────────
// React components for the connectors feature. Kept on a dedicated entry so
// Node-only consumers (backend, tests, CLI) don't transitively pull React,
// lucide-react, or DOM typings through the main entry.
export { ConnectorStatus } from './lib/ui/ConnectorStatus.js';
export type { ConnectorStatusProps } from './lib/ui/ConnectorStatus.js';
