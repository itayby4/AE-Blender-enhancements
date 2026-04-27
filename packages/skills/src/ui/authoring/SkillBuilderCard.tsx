// ── @pipefx/skills/ui/authoring — SkillBuilderCard ───────────────────────
// Inline chat surface that turns a SKILL.md fenced block in the assistant's
// reply into a one-click "Save Skill" experience. The chat panel runs the
// reply text through `parseMessageContent` (in `@pipefx/chat`); when a
// `{ type: 'skill', content }` part comes out, this card renders it.
//
// Card flow:
//   1. Parse the SKILL.md preview-side via the same parser the loader
//      uses (so we surface schema errors before the network round-trip).
//   2. Show id / name / mode / category badges + the body excerpt.
//   3. "Save Skill" → `POST /api/skills/install-text` with the raw text.
//      Backend re-parses + persists; we get back an `InstalledSkill`.
//   4. After save, expose "Open in editor" — opens `<SkillEditor>` so the
//      user can iterate without leaving the chat surface.
//
// The card stays inert if the SKILL.md fails to parse — the chat thread
// still shows the raw block (the host can fall back to a `<pre>`). We
// surface the parse error inline so the user knows what to ask the brain
// to fix.
//
// Phase 12.14 — restores the chat-driven author path that was deliberately
// stubbed in 12.2.

import { useMemo, useState } from 'react';

import type { InstalledSkill } from '../../contracts/api.js';
import { parseSkillMd } from '../../domain/skill-md-parser.js';

export interface SkillBuilderCardProps {
  /** Raw SKILL.md text (frontmatter + body) extracted from the chat
   *  reply. The component is read-only with respect to this prop —
   *  edits happen post-save via `<SkillEditor>`. */
  content: string;
  baseUrl?: string;
  getToken?: () => Promise<string | null>;
  /** Fired with the freshly-installed record. The chat host typically
   *  refreshes its skill list and may pop the editor. */
  onSaved?: (record: InstalledSkill) => void;
  /** Fired when the user clicks "Open in editor". Host wires this to
   *  whatever opens `<SkillEditor>` (in pipefx the desktop owns that
   *  state — same handler the `Create skill` palette action uses). */
  onOpenEditor?: (record: InstalledSkill) => void;
}

type SaveStatus =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'saved'; record: InstalledSkill }
  | { kind: 'error'; message: string };

export function SkillBuilderCard({
  content,
  baseUrl = 'http://localhost:3001',
  getToken,
  onSaved,
  onOpenEditor,
}: SkillBuilderCardProps) {
  // Parse once per content change. The result is a discriminated union;
  // we render a friendly error state instead of throwing when the brain
  // emits a bad SKILL.md.
  const parseResult = useMemo(() => parseSkillMd(content), [content]);
  const [status, setStatus] = useState<SaveStatus>({ kind: 'idle' });

  const handleSave = async () => {
    if (!parseResult.ok) return;
    setStatus({ kind: 'saving' });
    try {
      const token = getToken ? await getToken() : null;
      const res = await fetch(`${baseUrl}/api/skills/install-text`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ skillMd: content }),
      });
      const body = (await res.json().catch(() => null)) as
        | InstalledSkill
        | { error?: string }
        | null;
      if (!res.ok) {
        const message =
          (body && 'error' in body && typeof body.error === 'string'
            ? body.error
            : null) ?? `install failed (${res.status})`;
        setStatus({ kind: 'error', message });
        return;
      }
      const record = body as InstalledSkill;
      setStatus({ kind: 'saved', record });
      onSaved?.(record);
    } catch (err) {
      setStatus({
        kind: 'error',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  };

  // ── Parse failure ──────────────────────────────────────────────────────
  if (!parseResult.ok) {
    return (
      <div className="my-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
        <div className="flex items-center gap-2">
          <ShieldExclamationIcon />
          <span className="text-[12px] font-medium text-amber-500">
            Skill draft is missing required fields
          </span>
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">
          {parseResult.error.message}
        </p>
        <details className="mt-2">
          <summary className="cursor-pointer text-[10px] text-muted-foreground hover:text-foreground">
            Show draft
          </summary>
          <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded border bg-muted/40 p-2 text-[10px] text-muted-foreground">
            {content}
          </pre>
        </details>
      </div>
    );
  }

  const fm = parseResult.loaded.frontmatter;
  const mode = resolveMode(parseResult.loaded);
  const previewBody = parseResult.loaded.body
    .trim()
    .split(/\r?\n/)
    .slice(0, 3)
    .join('\n');

  // ── Saved state ────────────────────────────────────────────────────────
  if (status.kind === 'saved') {
    return (
      <div className="my-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <CheckIcon />
            <span className="text-[12px] font-medium text-emerald-500 truncate">
              Saved “{fm.name}”
            </span>
          </div>
          {onOpenEditor && (
            <button
              type="button"
              onClick={() => onOpenEditor(status.record)}
              className="shrink-0 rounded border border-border/60 px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-muted/40 hover:text-foreground"
            >
              Open in editor
            </button>
          )}
        </div>
        <p className="mt-1 truncate font-mono text-[10px] text-muted-foreground">
          {status.record.installPath}
        </p>
      </div>
    );
  }

  // ── Idle / saving / error ─────────────────────────────────────────────
  return (
    <div className="my-2 rounded-lg border border-primary/20 bg-primary/5 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Skill draft
            </span>
            <ModePill mode={mode} />
            {fm.category && <CategoryPill category={fm.category} />}
          </div>
          <h3 className="mt-1 text-[13px] font-semibold text-foreground truncate">
            {fm.name}
          </h3>
          <p className="text-[11px] text-muted-foreground line-clamp-2">
            {fm.description}
          </p>
          <p className="mt-1 font-mono text-[10px] text-muted-foreground/80">
            {fm.id}
            {fm.version ? ` · ${fm.version}` : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={status.kind === 'saving'}
          className="shrink-0 rounded bg-primary px-2.5 py-1 text-[11px] font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
        >
          {status.kind === 'saving' ? 'Saving…' : 'Save Skill'}
        </button>
      </div>

      {previewBody && (
        <pre className="mt-2 max-h-24 overflow-auto whitespace-pre-wrap rounded border border-border/40 bg-background/50 p-2 text-[10px] text-muted-foreground">
          {previewBody}
        </pre>
      )}

      {status.kind === 'error' && (
        <p className="mt-2 text-[11px] text-destructive">
          Save failed: {status.message}
        </p>
      )}
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────

function ModePill({ mode }: { mode: 'prompt' | 'script' | 'component' }) {
  const tone =
    mode === 'component' ? 'primary' : mode === 'script' ? 'warn' : 'muted';
  return <Pill tone={tone}>{mode}</Pill>;
}

function CategoryPill({ category }: { category: string }) {
  return <Pill tone="muted">{category}</Pill>;
}

function Pill({
  tone,
  children,
}: {
  tone: 'primary' | 'warn' | 'muted';
  children: React.ReactNode;
}) {
  const styles: Record<typeof tone, string> = {
    primary: 'bg-primary/10 text-primary border border-primary/30',
    warn: 'bg-amber-500/10 text-amber-500 border border-amber-500/30',
    muted: 'bg-muted/50 text-muted-foreground border border-border/40',
  };
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wide ${styles[tone]}`}
    >
      {children}
    </span>
  );
}

// Inline SVG icons keep the package free of `lucide-react` as a dep —
// matches the SignedBadge approach in `SkillCard.tsx`.

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-emerald-500"
      aria-hidden="true"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function ShieldExclamationIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-amber-500"
      aria-hidden="true"
    >
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <line x1="12" y1="8" x2="12" y2="13" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────

function resolveMode(loaded: {
  frontmatter: { ui?: string; scripts?: { entry?: string } };
}): 'prompt' | 'script' | 'component' {
  if (loaded.frontmatter.ui === 'bundled') return 'component';
  if (loaded.frontmatter.scripts?.entry) return 'script';
  return 'prompt';
}
