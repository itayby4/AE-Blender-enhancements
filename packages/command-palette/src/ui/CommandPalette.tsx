// ── @pipefx/command-palette/ui — CommandPalette ──────────────────────────
// Source-pluggable command palette. The desktop registers a built-in
// source for navigation/actions/settings; feature packages contribute
// their own (e.g. `@pipefx/skills/ui/palette/createSkillsSource`). The
// component aggregates items, applies a search query, groups by section,
// and runs the selected command.
//
// Two open modes:
//   • Unfiltered (Ctrl+K) — `pinnedSourceId` absent.
//   • Pre-filtered to one source (`/` in chat composer) — pass the
//     skills source id via `pinnedSourceId`.
//
// The palette is presentation only. Open/close state lives in the host.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type {
  CommandItem,
  CommandSource,
} from '../contracts/command-source.js';
import { cn } from './lib/cn.js';
import { scoreCommand } from './lib/fuzzy.js';

export interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  /** Sources contributing items. Order is preserved — items from earlier
   *  sources outrank later sources at equal score. */
  sources: ReadonlyArray<CommandSource>;
  /** When set, only items from the source with this id appear and the
   *  search input shows the source's label as a placeholder hint. */
  pinnedSourceId?: string;
  /** Initial query to populate the search input. Useful for the slash-key
   *  flow where `/` itself becomes the first character. */
  initialQuery?: string;
  /** Override for the search-input placeholder. */
  placeholder?: string;
}

export function CommandPalette({
  isOpen,
  onClose,
  sources,
  pinnedSourceId,
  initialQuery = '',
  placeholder,
}: CommandPaletteProps) {
  const [query, setQuery] = useState(initialQuery);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Re-render whenever any source notifies a change.
  const subscribe = useCallback(
    (notify: () => void) => {
      const unsubs = sources
        .map((src) => src.subscribe?.(notify))
        .filter((fn): fn is () => void => typeof fn === 'function');
      return () => {
        for (const u of unsubs) u();
      };
    },
    [sources]
  );
  // Bump on every source notification so the memos below recompute. The
  // actual items come from `list()`; `version` only forces a re-read.
  const [version, setVersion] = useState(0);
  useEffect(() => {
    return subscribe(() => setVersion((v) => v + 1));
  }, [subscribe]);

  const activeSources = useMemo(
    () =>
      pinnedSourceId
        ? sources.filter((s) => s.id === pinnedSourceId)
        : sources,
    [sources, pinnedSourceId]
  );

  const allItems = useMemo(() => {
    void version;
    const out: Array<CommandItem & { sourceId: string; sourceRank: number }> =
      [];
    activeSources.forEach((src, rank) => {
      for (const item of src.list()) {
        out.push({
          ...item,
          group: item.group ?? src.group ?? src.label,
          sourceId: src.id,
          sourceRank: rank,
        });
      }
    });
    return out;
  }, [activeSources, version]);

  const filtered = useMemo(() => {
    const q = query.trim();
    if (!q) {
      return allItems.map((item) => ({ ...item, score: 0 }));
    }
    const scored: Array<typeof allItems[number] & { score: number }> = [];
    for (const item of allItems) {
      const score = scoreCommand(item, q);
      if (score === null) continue;
      scored.push({ ...item, score });
    }
    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (a.sourceRank !== b.sourceRank) return a.sourceRank - b.sourceRank;
      return a.label.localeCompare(b.label);
    });
    return scored;
  }, [allItems, query]);

  const grouped = useMemo(() => {
    const map = new Map<string, typeof filtered>();
    for (const item of filtered) {
      const g = item.group ?? 'Other';
      const arr = map.get(g);
      if (arr) arr.push(item);
      else map.set(g, [item]);
    }
    return Array.from(map.entries());
  }, [filtered]);

  // Reset on open. Honor `initialQuery` so the slash-key flow works.
  useEffect(() => {
    if (isOpen) {
      setQuery(initialQuery);
      setSelectedIndex(0);
      const t = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [isOpen, initialQuery]);

  const runItem = useCallback(
    (item: CommandItem) => {
      if (item.disabled) return;
      onClose();
      // Defer the action by a microtask so the close-state ripple doesn't
      // race with anything the action wants to focus.
      Promise.resolve().then(() => {
        try {
          const r = item.run();
          if (r instanceof Promise) r.catch(() => undefined);
        } catch {
          // swallow — item-run errors are the host's concern.
        }
      });
    },
    [onClose]
  );

  const executeSelected = useCallback(() => {
    const item = filtered[selectedIndex];
    if (item) runItem(item);
  }, [filtered, selectedIndex, runItem]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      executeSelected();
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  if (!isOpen) return null;

  const resolvedPlaceholder =
    placeholder ??
    (pinnedSourceId
      ? `Search ${
          activeSources[0]?.label.toLowerCase() ?? 'commands'
        }…`
      : 'Search or run a command...');

  let flatIndex = 0;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh]">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      <div
        className="relative w-full max-w-lg bg-popover border border-border/60 rounded-xl shadow-2xl overflow-hidden animate-in fade-in-0 zoom-in-95 duration-150"
        onKeyDown={handleKeyDown}
      >
        <div className="flex items-center gap-3 px-4 py-3 border-b">
          <SearchGlyph className="w-4 h-4 text-muted-foreground shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            placeholder={resolvedPlaceholder}
            className="flex-1 bg-transparent text-[15px] text-foreground placeholder:text-muted-foreground outline-none"
          />
          <kbd className="px-2 py-0.5 rounded-md bg-muted border text-[10px] font-mono text-muted-foreground">
            Esc
          </kbd>
        </div>

        <div className="max-h-[360px] overflow-y-auto p-1.5">
          {grouped.map(([section, items]) => (
            <div key={section}>
              <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {section}
              </div>
              {items.map((item) => {
                const itemIndex = flatIndex++;
                const Icon = item.icon;
                const isSelected = itemIndex === selectedIndex;
                return (
                  <button
                    key={item.id}
                    onClick={() => runItem(item)}
                    onMouseEnter={() => setSelectedIndex(itemIndex)}
                    disabled={item.disabled}
                    title={item.disabled ? item.disabledReason : undefined}
                    className={cn(
                      'flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm transition-colors text-left',
                      item.disabled && 'opacity-50 cursor-not-allowed',
                      !item.disabled && isSelected
                        ? 'bg-primary/10 text-foreground'
                        : 'text-muted-foreground hover:bg-muted'
                    )}
                  >
                    {Icon && <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />}
                    <span className="flex-1 min-w-0">
                      <span className="block font-medium truncate">
                        {item.label}
                      </span>
                      {item.description && (
                        <span className="block text-[11px] text-muted-foreground/80 truncate">
                          {item.description}
                        </span>
                      )}
                    </span>
                    {item.shortcut && (
                      <kbd className="px-1.5 py-0.5 rounded-md bg-muted border text-[10px] font-mono text-muted-foreground shrink-0">
                        {item.shortcut}
                      </kbd>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="px-3 py-8 text-center text-sm text-muted-foreground">
              No commands found
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Inline search glyph ──────────────────────────────────────────────────
// Avoid adding a lucide-react runtime dep to this package — render a tiny
// SVG so the palette ships standalone. Hosts that want a different glyph
// can wrap CommandPalette and overlay their own.

function SearchGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}
