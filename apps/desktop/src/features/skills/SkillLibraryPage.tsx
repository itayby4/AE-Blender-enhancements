// ── SkillLibraryPage ────────────────────────────────────────────────────
// Desktop consumer of the new manifest-installed skills system. Wraps the
// headless `SkillLibrary` + `SkillRunner` from `@pipefx/skills/ui` with
// shadcn chrome (cards, scroll areas) + the desktop's typography + icons.
//
// Sits ALONGSIDE the legacy `SkillsPage` (which still serves the markdown
// + Python script authoring flow). Once the new system reaches feature
// parity — authoring UI in 7.10, marketplace in 7.11 — the legacy page
// can be retired and this becomes the canonical Skills view.
//
// The headless components from `@pipefx/skills/ui` emit semantic markup
// + className hooks but no chrome. We map their data-state hooks to the
// desktop's loading / empty / error styles.

import { useState } from 'react';
import {
  Sparkles,
  Library,
  AlertTriangle,
  Lock,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import {
  SkillLibrary,
  SkillRunner,
  type InstalledSkill,
  type SkillRunRecord,
} from '@pipefx/skills/ui';
import { Card } from '../../components/ui/card.js';
import { ScrollArea } from '../../components/ui/scroll-area.js';
import { Badge } from '../../components/ui/badge.js';
import { Button } from '../../components/ui/button.js';
import { cn } from '../../lib/utils.js';

const API_BASE = 'http://localhost:3001';

// Map manifest categories to lucide icons. Skills declare `category` in
// the manifest; we keep the registry small + fall back to a generic icon
// when the category is unknown so a new category type doesn't break the
// page.
function iconForCategory(category: string | undefined): LucideIcon {
  switch (category) {
    case 'editing':
    case 'video':
      return Zap;
    case 'authoring':
      return Sparkles;
    default:
      return Library;
  }
}

export interface SkillLibraryPageProps {
  /** Optional session id for run association. Forwarded to SkillRunner so
   *  the brain conversation appears under the same chat session. */
  sessionId?: string;
  className?: string;
}

export function SkillLibraryPage(props: SkillLibraryPageProps) {
  const { sessionId, className } = props;
  const [selected, setSelected] = useState<InstalledSkill | null>(null);
  const [lastRun, setLastRun] = useState<SkillRunRecord | null>(null);

  return (
    <div
      className={cn(
        'flex flex-1 min-h-0 gap-3 p-3 bg-background',
        className
      )}
    >
      {/* ── Left: library grid ─────────────────────────────────── */}
      <Card className="flex-1 min-w-0 flex flex-col overflow-hidden">
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold">Skill Library</h2>
            <p className="text-xs text-muted-foreground">
              Installed manifest-based skills · powered by{' '}
              <code className="text-[11px]">@pipefx/skills</code>
            </p>
          </div>
          <Badge variant="outline" className="text-[10px]">
            v2
          </Badge>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-4">
            <SkillLibrary
              apiBase={API_BASE}
              onSelect={(skill) => {
                setSelected(skill);
                setLastRun(null);
              }}
              renderIcon={(skill) => {
                const Icon = iconForCategory(skill.manifest.category);
                return <Icon className="h-4 w-4 text-primary" />;
              }}
              emptyState={<EmptyLibraryState />}
              className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3"
            />
          </div>
        </ScrollArea>
      </Card>

      {/* ── Right: runner detail ───────────────────────────────── */}
      <Card className="w-[420px] shrink-0 flex flex-col overflow-hidden">
        {selected ? (
          <>
            <div className="px-4 py-3 border-b flex items-center justify-between">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold truncate">
                  {selected.manifest.name}
                </h3>
                <p className="text-xs text-muted-foreground truncate">
                  {selected.manifest.id} · v{selected.manifest.version}
                </p>
              </div>
              {selected.signed ? (
                <Badge
                  variant="secondary"
                  className="text-[10px] gap-1"
                  title={selected.fingerprint ?? 'signed'}
                >
                  <Lock className="h-3 w-3" />
                  signed
                </Badge>
              ) : (
                <Badge variant="outline" className="text-[10px]">
                  unsigned
                </Badge>
              )}
            </div>
            <ScrollArea className="flex-1">
              <div className="p-4">
                <SkillRunner
                  skill={selected}
                  apiBase={API_BASE}
                  sessionId={sessionId}
                  onComplete={(record) => setLastRun(record)}
                  className="space-y-3"
                />
                {lastRun && lastRun.status === 'succeeded' && (
                  <div className="mt-4 p-3 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-xs">
                    <div className="font-medium text-emerald-700 dark:text-emerald-400">
                      Run completed
                    </div>
                    <div className="text-muted-foreground mt-1">
                      Run ID: <code>{lastRun.id}</code>
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>
          </>
        ) : (
          <EmptyRunnerState />
        )}
      </Card>
    </div>
  );
}

// ── Empty / informational sub-views ─────────────────────────────────────
// Kept inline because they're page-specific chrome and don't belong in
// the headless package.

function EmptyLibraryState() {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
      <Library className="h-10 w-10 mb-3 opacity-40" />
      <h3 className="text-sm font-semibold text-foreground">
        No skills installed yet
      </h3>
      <p className="text-xs mt-1 max-w-sm">
        Install a <code>.pfxskill</code> bundle or run the authoring UI to
        publish a manifest. Both ship in upcoming sub-phases.
      </p>
      <div className="flex gap-2 mt-4">
        <Button size="sm" variant="outline" disabled>
          Import .pfxskill (soon)
        </Button>
        <Button size="sm" variant="outline" disabled>
          Author new skill (soon)
        </Button>
      </div>
    </div>
  );
}

function EmptyRunnerState() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center p-6 text-muted-foreground">
      <AlertTriangle className="h-8 w-8 mb-2 opacity-40" />
      <p className="text-xs max-w-[260px]">
        Select a skill from the library to view its inputs and run it.
      </p>
    </div>
  );
}
