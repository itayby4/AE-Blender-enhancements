// ── Backend subpath export ─────────────────────────────────────────────────
// Mount helper for wiring connectors/tools HTTP routes into a host server.
// Kept on a dedicated entry so apps that only consume the registry as a
// library (tests, CLI tools) don't pull node:http transitively.
export { mountConnectorRoutes } from './lib/backend/mount.js';
export type {
  ConnectorsRouter,
  ConnectorsRegistryLike,
  MountConnectorRoutesDeps,
} from './lib/backend/mount.js';
