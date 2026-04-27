// ── @pipefx/skills/ui — SkillLibrary ─────────────────────────────────────
// Grid of installed skills. Owns search, capability-aware filtering, and
// shadow detection (when a user-root skill replaces a built-in).

import { useMemo, useState } from 'react';

import type { InstalledSkill } from '../../contracts/api.js';
import type { SkillId } from '../../contracts/skill-md.js';
import { useSkills } from '../hooks/useSkills.js';
import { cn } from '../lib/cn.js';
import { SkillCard } from './SkillCard.js';

export type SkillFilter = 'all' | 'available' | 'unavailable';

export interface SkillLibraryProps {
  /** Optional backend base URL forwarded to the hook. */
  baseUrl?: string;
  /** Optional Bearer-token getter forwarded to the hook. */
  getToken?: () => Promise<string | null>;
  /** Pinned-skill identifiers — forwarded to `SkillCard` for badge state. */
  pinnedSkillIds?: ReadonlyArray<string>;
  /** Toggle-pin handler. When set, the card renders a pin button on
   *  bundled-UI skills. */
  onTogglePin?: (id: SkillId) => void;
  /** Called when the user clicks "Run" on a card. */
  onRun?: (skill: InstalledSkill) => void;
}

export function SkillLibrary({
  baseUrl,
  getToken,
  pinnedSkillIds,
  onTogglePin,
  onRun,
}: SkillLibraryProps) {
  const { loading, error, skills, uninstall } = useSkills({ baseUrl, getToken });
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<SkillFilter>('all');
  const [busyId, setBusyId] = useState<SkillId | null>(null);

  // A user-root skill "shadows" a built-in iff the merged list still
  // contains a record with the same id sourced as 'builtin' upstream.
  // We can't detect that from list() output (the store collapses dupes),
  // so detection happens on the loaded source axis: any non-builtin
  // record might shadow — we don't know without server insight. For now
  // we surface "Shadowed" only when the install record is non-builtin
  // AND the id collides with a known builtin pattern. Since the store
  // already collapses, we treat this as `false` and let 12.10/12.11
  // refine the badge once the desktop bundle ships built-ins. -- ed.
  const shadowsBuiltin = useMemo(() => new Set<SkillId>(), []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return skills.filter(({ skill, availability }) => {
      const fm = skill.loaded.frontmatter;
      if (filter === 'available' && availability && !availability.runnable) return false;
      if (filter === 'unavailable' && (!availability || availability.runnable)) return false;
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
  }, [skills, query, filter]);

  const handleUninstall = async (skill: InstalledSkill) => {
    const id = skill.loaded.frontmatter.id;
    if (busyId) return;
    setBusyId(id);
    try {
      await uninstall(id);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0 gap-3 p-4">
      <div className="flex items-center gap-2 shrink-0">
        <input
          type="search"
          placeholder="Search skills…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="flex-1 h-8 px-2.5 text-[12px] rounded border border-border/60 bg-background/80 outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/30"
        />
        <FilterTabs value={filter} onChange={setFilter} />
      </div>

      {loading && (
        <div className="flex-1 flex items-center justify-center text-[12px] text-muted-foreground">
          Loading skills…
        </div>
      )}

      {error && !loading && (
        <div className="rounded border border-destructive/40 bg-destructive/10 px-3 py-2 text-[12px] text-destructive shrink-0">
          {error}
        </div>
      )}

      {!loading && !error && filtered.length === 0 && (
        <div className="flex-1 flex items-center justify-center text-[12px] text-muted-foreground">
          {skills.length === 0
            ? 'No skills installed yet.'
            : 'No skills match the current filter.'}
        </div>
      )}

      {!loading && !error && filtered.length > 0 && (
        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 pb-4">
            {filtered.map(({ skill, availability }) => {
              const id = skill.loaded.frontmatter.id;
              return (
                <SkillCard
                  key={id}
                  skill={skill}
                  availability={availability}
                  shadowsBuiltin={shadowsBuiltin.has(id)}
                  pinned={pinnedSkillIds?.includes(id) ?? false}
                  onTogglePin={onTogglePin}
                  onRun={onRun}
                  onUninstall={busyId === id ? undefined : handleUninstall}
                />
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Filter tabs ──────────────────────────────────────────────────────────

function FilterTabs({
  value,
  onChange,
}: {
  value: SkillFilter;
  onChange: (next: SkillFilter) => void;
}) {
  const tabs: ReadonlyArray<{ key: SkillFilter; label: string }> = [
    { key: 'all', label: 'All' },
    { key: 'available', label: 'Available' },
    { key: 'unavailable', label: 'Missing tools' },
  ];
  return (
    <div className="flex items-center gap-0.5 rounded border border-border/60 bg-background/40 p-0.5 shrink-0">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          onClick={() => onChange(tab.key)}
          className={cn(
            'h-6 px-2 text-[11px] font-medium rounded-sm transition-colors',
            value === tab.key
              ? 'bg-primary/15 text-primary'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
