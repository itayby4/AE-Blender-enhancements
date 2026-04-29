// ── @pipefx/settings-shell — main barrel ─────────────────────────────────
// `@pipefx/settings-shell` owns the settings *chrome*: the window, the
// sidebar, the section host, and the panel registry. Each feature package
// owns its own panel content and registers it at bootstrap. See the
// phase-10-platform-surfaces.md spec for the architecture.

export type {
  SettingsCategory,
  SettingsPanel,
  SettingsRegistryApi,
} from './contracts/types.js';

export {
  createSettingsRegistry,
  globalSettingsRegistry,
} from './domain/registry.js';

export {
  SettingsWindow,
  useSettingsRegistry,
} from './ui/index.js';
export type { SettingsWindowProps } from './ui/index.js';
