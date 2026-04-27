// ── SkillQuickFilter (12.10.5) ───────────────────────────────────────────
// Small floating popover anchored above the chat-input. Driven by the
// chat-input value: when it starts with `/` (no space), the host opens
// the popover; when the user deletes the `/` it closes.
//
// The popover reads its filter query from the chat input directly — no
// separate filter field. ↑↓/Enter/Esc are intercepted in the capture
// phase so the chat textarea doesn't also receive them.

import { useEffect, useMemo, useRef, useState } from 'react';

import type { SkillWithAvailability } from '@pipefx/skills/ui';

export interface SkillQuickFilterProps {
  isOpen: boolean;
  /** Current chat-input value. Leading `/` is stripped before filtering. */
  query: string;
  skills: ReadonlyArray<SkillWithAvailability>;
  /** Resolves the anchor element on every layout pass — typically the
   *  chat-input textarea. */
  getAnchor: () => HTMLElement | null;
  /** Called on Esc. The host should clear the chat-input `/` so the
   *  open-condition effect doesn't re-open the popover. */
  onClose: () => void;
  /** Bundled-UI selection. `name` is forwarded so the host can render
   *  `/Name ` back into the chat composer. */
  onSelectBundled: (skillId: string, name: string) => void;
  /** Inline (prompt/script) selection. `trigger` is the explicit slash
   *  trigger (`/foo`) when defined, otherwise null. */
  onSelectInline: (
    skillId: string,
    name: string,
    trigger: string | null
  ) => void;
}

interface AnchorRect {
  bottom: number;
  left: number;
  width: number;
}

function readAnchor(el: HTMLElement | null): AnchorRect | null {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { bottom: r.top, left: r.left, width: r.width };
}

export function SkillQuickFilter({
  isOpen,
  query,
  skills,
  getAnchor,
  onClose,
  onSelectBundled,
  onSelectInline,
}: SkillQuickFilterProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [anchor, setAnchor] = useState<AnchorRect | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const q = query.replace(/^\//, '').trim().toLowerCase();
    return skills.filter(({ skill }) => {
      const fm = skill.loaded.frontmatter;
      // Hide internal "_*" skills from the quick-filter — they're
      // dev-only (smoke test, author guide).
      if (fm.id.startsWith('_')) return false;
      if (!q) return true;
      const haystack = [
        fm.id,
        fm.name,
        fm.description,
        fm.category ?? '',
        ...(fm.triggers ?? []),
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [skills, query]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const update = () => setAnchor(readAnchor(getAnchor()));
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [isOpen, getAnchor]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        e.stopPropagation();
        setSelectedIndex((p) => Math.min(p + 1, filtered.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        e.stopPropagation();
        setSelectedIndex((p) => Math.max(p - 1, 0));
      } else if (e.key === 'Enter') {
        const target = filtered[selectedIndex];
        if (!target) return;
        e.preventDefault();
        e.stopPropagation();
        commitSelection(target);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    // Capture-phase so we run before React's synthetic event delegation
    // and the chat textarea's own onKeyDown handler — otherwise Enter
    // would also send the chat message.
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [isOpen, filtered, selectedIndex, onClose]);

  useEffect(() => {
    if (!listRef.current) return;
    const items = listRef.current.querySelectorAll('[data-skill-item]');
    items[selectedIndex]?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  function commitSelection(target: SkillWithAvailability) {
    const fm = target.skill.loaded.frontmatter;
    if (fm.ui === 'bundled') {
      onSelectBundled(fm.id, fm.name);
    } else {
      const trigger =
        fm.triggers?.find((t) => t.startsWith('/')) ??
        (fm.triggers?.[0] ? `/${fm.triggers[0]}` : null);
      onSelectInline(fm.id, fm.name, trigger);
    }
  }

  if (!isOpen || !anchor) return null;

  return (
    <div
      className="fixed z-50"
      style={{
        bottom: window.innerHeight - anchor.bottom + 8,
        left: anchor.left,
        width: anchor.width,
      }}
    >
      <div className="bg-card/95 backdrop-blur-xl border border-border/60 rounded-xl shadow-xl overflow-hidden">
        <div
          ref={listRef}
          className="max-h-[280px] overflow-y-auto py-1"
        >
          {filtered.length === 0 ? (
            <div className="px-3 py-3 text-center text-[12px] text-muted-foreground">
              No skills match "{query.replace(/^\//, '')}"
            </div>
          ) : (
            filtered.map((entry, index) => {
              const fm = entry.skill.loaded.frontmatter;
              const isActive = index === selectedIndex;
              const runnable = entry.availability?.runnable ?? true;
              return (
                <div
                  key={fm.id}
                  data-skill-item
                  onClick={() => commitSelection(entry)}
                  onMouseEnter={() => setSelectedIndex(index)}
                  className={`px-3 py-1.5 cursor-pointer transition-colors text-[13px] ${
                    isActive
                      ? 'bg-primary/10 text-foreground'
                      : 'text-muted-foreground hover:bg-muted/50'
                  } ${!runnable ? 'opacity-60' : ''}`}
                >
                  {fm.name}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
