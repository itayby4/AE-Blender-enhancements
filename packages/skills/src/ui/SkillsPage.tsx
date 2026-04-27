// ── @pipefx/skills/ui — SkillsPage ───────────────────────────────────────
// Top-level shell for the skill library. Owns the Library / Store tab
// switch and the run-dialog state for `inline` ui-tier skills. Component
// (`bundled`) skills are escalated to the host via `onMount` so the
// desktop can route them to its own surface (full-screen / sidebar /
// modal) per `mountInstruction.mount`.

import { useState } from 'react';

import type {
  InstalledSkill,
  SkillMountInstruction,
} from '../contracts/api.js';
import { resolveExecutionMode } from '../contracts/skill-md.js';
import { SkillLibrary } from './library/SkillLibrary.js';
import { StoreComingSoon } from './library/StoreComingSoon.js';
import { cn } from './lib/cn.js';
import { SkillRunDialog } from './runner/SkillRunDialog.js';

export type SkillsTab = 'library' | 'store';

export interface SkillsPageProps {
  baseUrl?: string;
  /** Optional Bearer-token getter forwarded to the hooks. */
  getToken?: () => Promise<string | null>;
  /** Initial tab. Defaults to `library`. */
  defaultTab?: SkillsTab;
  /** Hide the Library/Store tab nav. The host may use this to expose
   *  each tab as a separate top-level surface (12.10.5 split: nav-rail
   *  has one entry for Library and one for Skill Store). */
  hideTabs?: boolean;
  /** Pinned-skill identifiers — passed through to `SkillCard` so it can
   *  show the toggle in its current state. */
  pinnedSkillIds?: ReadonlyArray<string>;
  /** Toggle pin handler. When provided, `SkillCard` renders a pin button
   *  on bundled-UI skills. */
  onTogglePin?: (id: string) => void;
  /** Called when a `component`-mode skill needs to be hosted by the app
   *  shell. The dialog is only used for `prompt` / `script` (inline)
   *  skills. */
  onMountBundled?: (
    skill: InstalledSkill,
    instruction: SkillMountInstruction
  ) => void;
}

export function SkillsPage({
  baseUrl,
  getToken,
  defaultTab = 'library',
  hideTabs = false,
  pinnedSkillIds,
  onTogglePin,
  onMountBundled,
}: SkillsPageProps) {
  const [tab, setTab] = useState<SkillsTab>(defaultTab);
  const [runningSkill, setRunningSkill] = useState<InstalledSkill | null>(null);

  const handleRun = (skill: InstalledSkill) => {
    const mode = resolveExecutionMode(skill.loaded.frontmatter);
    if (mode === 'component') {
      // Component-mode skills don't get the inline dialog — the host
      // handles mount routing. We forward a synthetic mountInstruction
      // here only when the skill takes no inputs; otherwise the host
      // should drive a form first. For now the inline dialog is the
      // common case and we route component skills straight through.
      if (onMountBundled && skill.loaded.frontmatter.bundledUi) {
        onMountBundled(skill, {
          runId: '',
          skillId: skill.loaded.frontmatter.id,
          entry: skill.loaded.frontmatter.bundledUi.entry,
          mount: skill.loaded.frontmatter.bundledUi.mount ?? 'modal',
          inputs: {},
        });
      }
      return;
    }
    setRunningSkill(skill);
  };

  const handleRunComplete = () => {
    // Hook for telemetry / toast surfaces. No-op here — the dialog stays
    // mounted so the user can read the result before dismissing.
  };

  return (
    <div className="flex flex-col h-full min-h-0 bg-background">
      {!hideTabs && <TabNav value={tab} onChange={setTab} />}
      <div className="flex-1 min-h-0 flex flex-col">
        {tab === 'library' ? (
          <SkillLibrary
            baseUrl={baseUrl}
            getToken={getToken}
            pinnedSkillIds={pinnedSkillIds}
            onTogglePin={onTogglePin}
            onRun={handleRun}
          />
        ) : (
          <StoreComingSoon />
        )}
      </div>

      {runningSkill && (
        <SkillRunDialog
          skill={runningSkill}
          baseUrl={baseUrl}
          getToken={getToken}
          onClose={() => setRunningSkill(null)}
          onRunComplete={handleRunComplete}
        />
      )}
    </div>
  );
}

// ── Tab nav ──────────────────────────────────────────────────────────────

function TabNav({
  value,
  onChange,
}: {
  value: SkillsTab;
  onChange: (next: SkillsTab) => void;
}) {
  const tabs: ReadonlyArray<{ key: SkillsTab; label: string; disabled?: boolean }> = [
    { key: 'library', label: 'Library' },
    { key: 'store', label: 'Store (Coming Soon)' },
  ];
  return (
    <div className="flex items-end border-b border-border/40 px-4 pt-3 gap-1 shrink-0">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          onClick={() => onChange(tab.key)}
          className={cn(
            'px-3 h-7 text-[12px] font-medium rounded-t border border-b-0 transition-colors',
            value === tab.key
              ? 'bg-card text-foreground border-border/60'
              : 'bg-transparent text-muted-foreground border-transparent hover:text-foreground'
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
