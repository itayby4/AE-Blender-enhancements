// ── @pipefx/settings-shell/domain — panel registry ───────────────────────
// Tiny in-memory registry with a subscribe/notify pattern. Designed for the
// React `useSyncExternalStore` hook so the sidebar re-renders when feature
// packages register their panels at bootstrap.
//
// No persistence, no transport — purely the in-process source of truth.
// Hosts may construct multiple registries (e.g. for tests) but in practice
// the singleton exported as `globalSettingsRegistry` is what features use.

import type {
  SettingsPanel,
  SettingsRegistryApi,
} from '../contracts/types.js';

interface InternalRegistry extends SettingsRegistryApi {
  reset(): void;
}

const DEFAULT_ORDER = 100;

function sortPanels(panels: ReadonlyArray<SettingsPanel>): SettingsPanel[] {
  return [...panels].sort((a, b) => {
    const ao = a.order ?? DEFAULT_ORDER;
    const bo = b.order ?? DEFAULT_ORDER;
    if (ao !== bo) return ao - bo;
    return a.title.localeCompare(b.title);
  });
}

export function createSettingsRegistry(): InternalRegistry {
  const panels = new Map<string, SettingsPanel>();
  const listeners = new Set<() => void>();

  let cachedSnapshot: readonly SettingsPanel[] = [];
  let cachedVersion = -1;
  let version = 0;

  function notify(): void {
    version++;
    for (const fn of listeners) fn();
  }

  function snapshot(): readonly SettingsPanel[] {
    if (cachedVersion !== version) {
      cachedSnapshot = Object.freeze(sortPanels([...panels.values()]));
      cachedVersion = version;
    }
    return cachedSnapshot;
  }

  return {
    registerSettingsPanel(panel) {
      if (panels.has(panel.id)) {
        // eslint-disable-next-line no-console
        console.warn(
          `[settings-shell] duplicate registerSettingsPanel for "${panel.id}" — second registration ignored. Use replaceSettingsPanel to swap.`
        );
        return () => {
          /* no-op for duplicate registration */
        };
      }
      panels.set(panel.id, panel);
      notify();
      return () => {
        if (panels.get(panel.id) === panel) {
          panels.delete(panel.id);
          notify();
        }
      };
    },
    replaceSettingsPanel(panel) {
      panels.set(panel.id, panel);
      notify();
    },
    getRegisteredPanels() {
      return snapshot();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    reset() {
      panels.clear();
      notify();
    },
  };
}

/**
 * Process-wide singleton registry. Hosts that need an isolated registry
 * (tests, multi-instance shells) should call `createSettingsRegistry()`
 * directly and pass it through React context.
 */
export const globalSettingsRegistry = createSettingsRegistry();
