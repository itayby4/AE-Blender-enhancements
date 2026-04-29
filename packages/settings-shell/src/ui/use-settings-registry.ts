// ── @pipefx/settings-shell/ui — registry hook ────────────────────────────
// Subscribes a component to the settings registry. Returns the current
// snapshot of registered panels; re-renders whenever a feature
// registers/replaces/unregisters one.

import { useSyncExternalStore } from 'react';

import type { SettingsRegistryApi, SettingsPanel } from '../contracts/types.js';

export function useSettingsRegistry(
  registry: SettingsRegistryApi
): readonly SettingsPanel[] {
  return useSyncExternalStore(
    registry.subscribe,
    registry.getRegisteredPanels,
    registry.getRegisteredPanels
  );
}
