// ── @pipefx/command-palette/contracts — CommandSource ────────────────────
// The palette is source-pluggable: each `CommandSource` advertises a list
// of runnable commands. The desktop wires a built-in source (navigation,
// chat actions, settings) and feature packages contribute their own (e.g.
// `@pipefx/skills/ui/palette/createSkillsSource`).
//
// Sources are intentionally pull-based. Palettes call `list()` on demand
// and re-render when the source notifies via `subscribe`. Avoiding a
// shared bus keeps the package free of dependencies on @pipefx/event-bus.

import type { ComponentType } from 'react';

/** Icon component contract. Compatible with `lucide-react`'s `LucideIcon`
 *  but not bound to it — the package stays icon-library agnostic. */
export type CommandIcon = ComponentType<{
  className?: string;
  'aria-hidden'?: boolean | 'true' | 'false';
}>;

export interface CommandItem {
  /** Stable id, unique across the entire palette. Sources should namespace
   *  their items (e.g. `'nav-chat'`, `'skill:subtitles'`). */
  id: string;
  label: string;
  /** One-line subtitle rendered under `label`. Optional. */
  description?: string;
  /** Section header. Defaults to the source's `group` when absent. */
  group?: string;
  icon?: CommandIcon;
  /** Right-aligned shortcut hint (e.g. `'Ctrl+1'`). Display-only — the
   *  palette does not bind these. */
  shortcut?: string;
  /** Extra fuzzy-match terms beyond `label` / `description` / `group`.
   *  Used for slash-form aliases (`'/subtitles'`) and synonyms. */
  keywords?: ReadonlyArray<string>;
  /** Marks the item as currently unrunnable (greyed out, but still in the
   *  list so the user understands why). When true, the palette shows the
   *  item but ignores activation. */
  disabled?: boolean;
  /** Tooltip / inline reason shown when `disabled === true`. */
  disabledReason?: string;
  run: () => void | Promise<void>;
}

export interface CommandSource {
  /** Stable source id (e.g. `'desktop'`, `'skills'`). The palette uses
   *  this for `pinnedSourceId` filtering. */
  id: string;
  /** Human label for source-filter chips (when surfaced). */
  label: string;
  /** Default `group` for items that don't set one explicitly. Used as the
   *  section header. */
  group?: string;
  /** Returns the current item list. Called on every palette open and
   *  whenever `subscribe`'s listener fires. */
  list(): ReadonlyArray<CommandItem>;
  /** Optional reactive seam. When the source's items change, call the
   *  listener; the palette will re-read `list()`. Returns an unsubscribe
   *  fn. */
  subscribe?(listener: () => void): () => void;
}
