// ── @pipefx/settings-shell/ui — SettingsWindow ───────────────────────────
// The chrome: full-screen overlay with a category-grouped sidebar on the
// left and a section host on the right. The shell knows nothing about
// what each panel does — features own that.
//
// Hosts mount one `<SettingsWindow>` somewhere in their root tree (typically
// behind a route or a modal trigger) and pass:
//   • `registry` — usually `globalSettingsRegistry` from `@pipefx/settings-shell`,
//     or a custom one for tests/multi-instance setups.
//   • `onClose` — callback the shell calls when the user dismisses settings.
//
// Each feature registers its panel at bootstrap; the shell re-renders
// when the registry changes (via `useSettingsRegistry`).

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Settings as SettingsIcon, X } from 'lucide-react';

import { Button, ScrollArea, cn } from '@pipefx/ui-kit';

import type {
  SettingsCategory,
  SettingsPanel,
  SettingsRegistryApi,
} from '../contracts/types.js';

import { useSettingsRegistry } from './use-settings-registry.js';

export interface SettingsWindowProps {
  registry: SettingsRegistryApi;
  /** Called when the user dismisses the window (close button / Esc). */
  onClose: () => void;
  /** Optional id of the panel to show on first paint. Defaults to the
   *  first panel in sorted order. */
  initialPanelId?: string;
  /** Header slot — typically a brand mark. Renders above the sidebar. */
  brand?: ReactNode;
  /** Optional category labels. Defaults to the category id title-cased. */
  categoryLabels?: Partial<Record<SettingsCategory, string>>;
}

const DEFAULT_CATEGORY_LABELS: Record<string, string> = {
  account: 'Account',
  appearance: 'Appearance',
  integrations: 'Integrations',
  'api-keys': 'API Keys',
  about: 'About',
};

function categoryLabel(
  category: SettingsCategory,
  overrides: Partial<Record<SettingsCategory, string>> = {}
): string {
  const overridden = overrides[category];
  if (overridden) return overridden;
  const fromMap = DEFAULT_CATEGORY_LABELS[category];
  if (fromMap) return fromMap;
  // Fallback: title-case unknown ids (e.g. "billing" → "Billing")
  return category.charAt(0).toUpperCase() + category.slice(1);
}

interface CategoryGroup {
  category: SettingsCategory;
  label: string;
  panels: readonly SettingsPanel[];
}

function groupByCategory(
  panels: readonly SettingsPanel[],
  overrides: Partial<Record<SettingsCategory, string>>
): CategoryGroup[] {
  const map = new Map<SettingsCategory, SettingsPanel[]>();
  for (const panel of panels) {
    const list = map.get(panel.category) ?? [];
    list.push(panel);
    map.set(panel.category, list);
  }
  return Array.from(map.entries()).map(([category, ps]) => ({
    category,
    label: categoryLabel(category, overrides),
    panels: ps,
  }));
}

export function SettingsWindow({
  registry,
  onClose,
  initialPanelId,
  brand,
  categoryLabels,
}: SettingsWindowProps) {
  const panels = useSettingsRegistry(registry);
  const groups = useMemo(
    () => groupByCategory(panels, categoryLabels ?? {}),
    [panels, categoryLabels]
  );

  const [activeId, setActiveId] = useState<string | null>(
    initialPanelId ?? panels[0]?.id ?? null
  );

  // If the active panel is unregistered (HMR, feature unmount, etc.),
  // fall back to the first available panel.
  useEffect(() => {
    if (activeId && panels.some((p) => p.id === activeId)) return;
    setActiveId(panels[0]?.id ?? null);
  }, [activeId, panels]);

  const activePanel = useMemo(
    () => panels.find((p) => p.id === activeId) ?? null,
    [panels, activeId]
  );

  const ActiveBody = activePanel?.component ?? null;

  return (
    <div className="fixed inset-0 z-50 flex bg-background text-foreground">
      {/* Sidebar */}
      <aside className="flex flex-col w-64 shrink-0 border-r border-border/40 bg-card/40">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border/40">
          {brand ?? <SettingsIcon className="h-4 w-4 text-primary" />}
          <span className="text-sm font-semibold tracking-tight">Settings</span>
        </div>

        <ScrollArea className="flex-1 min-h-0">
          {panels.length === 0 ? (
            <div className="px-4 py-6 text-xs text-muted-foreground">
              No settings panels registered.
            </div>
          ) : (
            <nav className="py-2">
              {groups.map((group) => (
                <div key={group.category} className="px-2 pb-3">
                  <p className="px-2 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                    {group.label}
                  </p>
                  <ul>
                    {group.panels.map((panel) => {
                      const Icon = panel.icon;
                      const isActive = panel.id === activeId;
                      return (
                        <li key={panel.id}>
                          <button
                            type="button"
                            onClick={() => setActiveId(panel.id)}
                            className={cn(
                              'w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-[13px] text-left transition-colors',
                              isActive
                                ? 'bg-primary/10 text-foreground'
                                : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground'
                            )}
                          >
                            {Icon ? (
                              <Icon className="h-3.5 w-3.5 shrink-0" />
                            ) : (
                              <span className="h-3.5 w-3.5 shrink-0" />
                            )}
                            <span className="flex-1 truncate">{panel.title}</span>
                            {panel.badge ? (
                              <span className="text-[10px] font-medium text-primary">
                                {panel.badge}
                              </span>
                            ) : null}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </nav>
          )}
        </ScrollArea>
      </aside>

      {/* Section host */}
      <main className="flex flex-col flex-1 min-w-0">
        <header className="flex items-center justify-between px-6 py-3 border-b border-border/40">
          <h1 className="text-sm font-semibold tracking-tight">
            {activePanel?.title ?? 'Settings'}
          </h1>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            title="Close settings"
          >
            <X className="h-3.5 w-3.5" />
            <span className="sr-only">Close</span>
          </Button>
        </header>
        <ScrollArea className="flex-1 min-h-0">
          <div className="px-6 py-6 max-w-3xl">
            {ActiveBody ? (
              <ActiveBody />
            ) : (
              <div className="text-sm text-muted-foreground">
                Select a settings panel from the sidebar.
              </div>
            )}
          </div>
        </ScrollArea>
      </main>
    </div>
  );
}
