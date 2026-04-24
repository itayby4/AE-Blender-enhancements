import { useState, useEffect, useRef } from 'react';
import {
  Bot,
  Subtitles,
  Scissors,
  Smartphone,
  Network,
  Wand2,
  Zap,
  Clapperboard,
} from 'lucide-react';
import type { ComponentType } from 'react';
import type { Skill } from '../../lib/load-skills';

const ICON_MAP: Record<string, ComponentType<{ className?: string }>> = {
  bot: Bot,
  subtitles: Subtitles,
  scissors: Scissors,
  smartphone: Smartphone,
  network: Network,
  wand2: Wand2,
  zap: Zap,
  clapperboard: Clapperboard,
};

interface SkillAutocompleteProps {
  skills: Skill[];
  query: string;
  onSelect: (skill: Skill) => void;
  onDismiss: () => void;
}

export function SkillAutocomplete({
  skills,
  query,
  onSelect,
  onDismiss,
}: SkillAutocompleteProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  // Filter skills by query (matching name, triggerCommand, or description)
  const searchText = query.toLowerCase();
  const filtered = skills.filter((s) => {
    if (s.id === 'default') return false;
    if (!searchText) return true;
    return (
      s.name.toLowerCase().includes(searchText) ||
      (s.triggerCommand &&
        s.triggerCommand.toLowerCase().includes(searchText)) ||
      (s.description && s.description.toLowerCase().includes(searchText))
    );
  });

  // Reset selection when filter changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Scroll selected item into view
  useEffect(() => {
    if (listRef.current) {
      const items = listRef.current.querySelectorAll('[data-skill-item]');
      items[selectedIndex]?.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  // Keyboard handler — called from parent via ref or event propagation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, filtered.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (filtered[selectedIndex]) {
          onSelect(filtered[selectedIndex]);
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onDismiss();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [filtered, selectedIndex, onSelect, onDismiss]);

  if (filtered.length === 0) {
    return (
      <div className="absolute bottom-full left-0 right-0 mb-2 z-50">
        <div className="bg-card/95 backdrop-blur-xl border border-border/60 rounded-xl shadow-xl p-4 text-center">
          <p className="text-xs text-muted-foreground">
            No skills match "{query}"
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="absolute bottom-full left-0 right-0 mb-2 z-50">
      <div
        ref={listRef}
        className="bg-card/95 backdrop-blur-xl border border-border/60 rounded-xl shadow-xl overflow-hidden max-h-[280px] overflow-y-auto"
      >
        {/* Header */}
        <div className="px-3 py-2 border-b border-border/40 flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
            Skills
          </span>
          <span className="text-[10px] text-muted-foreground/60">
            ↑↓ navigate · Enter select · Esc close
          </span>
        </div>

        {/* Skill list */}
        {filtered.map((skill, index) => {
          const IconComp = ICON_MAP[skill.icon || 'bot'] || Bot;
          const isActive = index === selectedIndex;

          return (
            <div
              key={skill.id}
              data-skill-item
              onClick={() => onSelect(skill)}
              onMouseEnter={() => setSelectedIndex(index)}
              className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors ${
                isActive
                  ? 'bg-primary/10 text-foreground'
                  : 'text-muted-foreground hover:bg-muted/50'
              }`}
            >
              <div
                className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                  isActive ? 'bg-primary text-primary-foreground' : 'bg-muted'
                }`}
              >
                <IconComp className="h-4 w-4" />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm truncate">
                    {skill.name}
                  </span>
                  {skill.hasUI && (
                    <span className="text-[9px] px-1 py-0 rounded bg-primary/10 text-primary font-medium shrink-0">
                      UI
                    </span>
                  )}
                </div>
                {skill.description && (
                  <p className="text-[11px] text-muted-foreground/70 truncate">
                    {skill.description}
                  </p>
                )}
              </div>

              {skill.triggerCommand && (
                <span className="text-[10px] font-mono text-muted-foreground/50 shrink-0">
                  /{skill.triggerCommand}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
