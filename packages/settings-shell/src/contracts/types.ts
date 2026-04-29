// ── @pipefx/settings-shell — public contracts ─────────────────────────────
// Frozen shapes for panels that features register into the settings shell.
//
// The shell owns navigation, layout and section hosting. Each feature owns
// its panel content (form, schema, persistence) and registers it at app
// bootstrap. See `phase-10-platform-surfaces.md` for the rationale.

import type { ComponentType, ReactNode } from 'react';

/** A category in the settings sidebar. Categories group related panels. */
export type SettingsCategory =
  | 'account'
  | 'appearance'
  | 'integrations'
  | 'api-keys'
  | 'about'
  | (string & {}); // open-ended: features may register custom categories

/**
 * A registered settings panel. Features describe their own panel and the
 * shell renders it inside the section host when the user navigates to it.
 *
 * `id` is the URL/route fragment for the panel and must be stable across
 * builds — feature packages own their own id namespace.
 */
export interface SettingsPanel {
  /** Stable identifier (kebab-case, feature-scoped). */
  id: string;
  /** Human-readable label rendered in the sidebar. */
  title: string;
  /** Sidebar icon (typically a lucide-react icon component). */
  icon?: ComponentType<{ className?: string }>;
  /** Sidebar grouping. */
  category: SettingsCategory;
  /** Sort order within the category (ascending). Default 100. */
  order?: number;
  /** Panel body. Receives no props — feature owns its own state/persistence. */
  component: ComponentType;
  /** Optional badge text rendered next to the title (e.g. "New", "Beta"). */
  badge?: ReactNode;
}

/** Public registry API exposed by the shell. */
export interface SettingsRegistryApi {
  /** Add a panel. Returns an unregister callback. */
  registerSettingsPanel: (panel: SettingsPanel) => () => void;
  /** Replace a previously registered panel by id. */
  replaceSettingsPanel: (panel: SettingsPanel) => void;
  /** Snapshot of all currently registered panels, sorted. */
  getRegisteredPanels: () => readonly SettingsPanel[];
  /** Subscribe to registry changes. Returns an unsubscribe callback. */
  subscribe: (listener: () => void) => () => void;
}
