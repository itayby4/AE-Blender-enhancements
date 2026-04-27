// ── @pipefx/skills/ui/authoring — SkillEditor ────────────────────────────
// Monaco-backed editor for SKILL.md text. Loaded lazily so consumers that
// don't wire up the authoring surface don't pull Monaco into their bundle.
// `@monaco-editor/react` and `monaco-editor` are declared as optional
// peer dependencies; the host app installs them.
//
// This is a host-mounted full-screen overlay — the desktop opens it from
// the palette's "Create skill" → ScaffoldDialog → editor flow, and from
// the library card's "Edit source" action. State (current skill id) is
// owned by the host so the editor can be unmounted/remounted without
// losing the user's draft (they save to disk and the hook reloads).

import { lazy, Suspense, useCallback, useEffect } from 'react';

import type { InstalledSkill } from '../../contracts/api.js';
import type { SkillId } from '../../contracts/skill-md.js';
import { cn } from '../lib/cn.js';
import { useSkillSource } from './useSkillSource.js';

// Lazy import keeps Monaco out of the initial bundle. The dynamic
// `import()` resolves against whatever the host app installed; the
// types come from `@monaco-editor/react` directly when available.
//
// The `@ts-ignore` covers consumers that have not installed the optional
// peer dep. They still get a typecheck-pass on `@pipefx/skills` because
// the dynamic import is opaque from TS's perspective until the module
// graph resolves at consumer build time.
const MonacoEditor = lazy(async () => {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore optional peer dependency — see package.json
  const mod = (await import('@monaco-editor/react')) as {
    default: React.ComponentType<MonacoEditorProps>;
  };
  return { default: mod.default };
});

interface MonacoEditorProps {
  height?: string | number;
  defaultLanguage?: string;
  language?: string;
  value?: string;
  defaultValue?: string;
  theme?: string;
  options?: Record<string, unknown>;
  onChange?: (value: string | undefined) => void;
  onMount?: (editor: unknown) => void;
}

export interface SkillEditorProps {
  isOpen: boolean;
  onClose: () => void;
  /** Skill currently being edited. The hook reloads when this changes. */
  skill: InstalledSkill | null;
  baseUrl?: string;
  getToken?: () => Promise<string | null>;
  /** Called after a successful save. Hosts use this to refresh the
   *  library / availability snapshot. */
  onSaved?: (skillId: SkillId) => void;
}

export function SkillEditor({
  isOpen,
  onClose,
  skill,
  baseUrl,
  getToken,
  onSaved,
}: SkillEditorProps) {
  const skillId = skill?.loaded.frontmatter.id ?? null;
  const { loading, saving, error, draft, setDraft, dirty, save, reload } =
    useSkillSource(skillId, { baseUrl, getToken });
  const isBuiltIn = skill?.source === 'builtin';

  const handleSave = useCallback(async () => {
    const ok = await save();
    if (ok && skillId) onSaved?.(skillId);
  }, [save, skillId, onSaved]);

  // ⌘S / Ctrl+S — save without leaving the editor.
  useEffect(() => {
    if (!isOpen) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (!isBuiltIn && dirty && !saving) {
          void handleSave();
        }
      } else if (e.key === 'Escape') {
        // Escape closes ONLY when there are no unsaved changes — avoids
        // a single keypress wiping out a long edit.
        if (!dirty) onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, dirty, saving, isBuiltIn, handleSave, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <header className="flex items-center justify-between gap-3 px-4 py-2 border-b border-border/60 bg-card/80 shrink-0">
        <div className="min-w-0 flex-1">
          <h2 className="text-[13px] font-semibold text-foreground truncate">
            {skill ? skill.loaded.frontmatter.name : 'Skill editor'}
            {dirty && (
              <span className="ml-2 text-[11px] text-amber-500">• unsaved</span>
            )}
            {isBuiltIn && (
              <span className="ml-2 text-[11px] text-muted-foreground">
                (built-in — read only)
              </span>
            )}
          </h2>
          {skill && (
            <p className="text-[11px] text-muted-foreground truncate">
              {skill.installPath}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => reload()}
            disabled={loading}
            className="h-7 px-2.5 text-[11px] rounded border border-border/60 bg-background hover:bg-muted/40 disabled:opacity-50"
          >
            Reload
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!dirty || saving || loading || isBuiltIn}
            className="h-7 px-2.5 text-[11px] rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="h-7 px-2.5 text-[11px] rounded border border-border/60 bg-background hover:bg-muted/40"
          >
            Close
          </button>
        </div>
      </header>

      {error && (
        <div className="px-4 py-2 text-[11px] text-destructive bg-destructive/10 border-b border-destructive/30 shrink-0">
          {error}
        </div>
      )}

      <div className={cn('flex-1 min-h-0', loading && 'opacity-60')}>
        {draft === null ? (
          <div className="h-full flex items-center justify-center text-[12px] text-muted-foreground">
            {loading ? 'Loading…' : 'Select a skill to edit.'}
          </div>
        ) : (
          <Suspense
            fallback={
              <div className="h-full flex items-center justify-center text-[12px] text-muted-foreground">
                Loading editor…
              </div>
            }
          >
            <MonacoEditor
              height="100%"
              defaultLanguage="markdown"
              language="markdown"
              value={draft}
              theme="vs-dark"
              options={{
                readOnly: isBuiltIn,
                minimap: { enabled: false },
                fontSize: 13,
                wordWrap: 'on',
                tabSize: 2,
                automaticLayout: true,
                scrollBeyondLastLine: false,
              }}
              onChange={(next: string | undefined) => setDraft(next ?? '')}
            />
          </Suspense>
        )}
      </div>
    </div>
  );
}
