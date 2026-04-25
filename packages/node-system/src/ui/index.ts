// ── UI subpath export ──────────────────────────────────────────────────────
// React components for the node-system feature. Kept on a dedicated entry
// so Node-only consumers (backend, tests, CLI) don't transitively pull
// React, ReactFlow, lucide-react, or Tauri APIs through the main entry.
export { NodeSystemDashboard } from './NodeSystemDashboard.js';
