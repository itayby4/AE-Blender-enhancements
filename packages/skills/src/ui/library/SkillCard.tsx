// ── @pipefx/skills/ui — SkillCard ────────────────────────────────────────
// Compact card surface for one installed skill. Drives badge state from
// the matcher snapshot and the install record's `source` axis.

import { useMemo } from 'react';

import type {
  InstalledSkill,
  SkillAvailability,
} from '../../contracts/api.js';
import type { RequiredTool } from '../../contracts/skill-md.js';
import { cn } from '../lib/cn.js';

export interface SkillCardProps {
  skill: InstalledSkill;
  availability: SkillAvailability | null;
  /** Set when a user-root skill has the same id as a built-in. */
  shadowsBuiltin?: boolean;
  /** True when this skill is currently pinned to the host's nav-rail. */
  pinned?: boolean;
  /** Toggle-pin handler. The card only renders the pin button when this
   *  prop is set AND the skill is `component`-mode (`ui: bundled`) —
   *  inline skills don't have a permanent surface to pin to. */
  onTogglePin?: (id: string) => void;
  onRun?: (skill: InstalledSkill) => void;
  onUninstall?: (skill: InstalledSkill) => void;
}

export function SkillCard({
  skill,
  availability,
  shadowsBuiltin = false,
  pinned = false,
  onTogglePin,
  onRun,
  onUninstall,
}: SkillCardProps) {
  const fm = skill.loaded.frontmatter;
  const mode = useMemo(() => resolveMode(skill), [skill]);
  const runnable = availability?.runnable ?? true;
  const missing = availability?.missing ?? [];
  const optionalPresent = availability?.optionalPresent ?? [];
  const isUserSkill = skill.source !== 'builtin';

  return (
    <div
      className={cn(
        'flex flex-col rounded-lg border border-border/60 bg-card/80 backdrop-blur-sm p-3 gap-2 min-h-[140px]',
        !runnable && 'opacity-70'
      )}
      data-skill-id={fm.id}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <h3 className="text-[13px] font-semibold truncate text-foreground">
              {fm.name}
            </h3>
            <ModeBadge mode={mode} />
          </div>
          <p className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5">
            {fm.description}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-1">
        <SourceBadge source={skill.source} shadowsBuiltin={shadowsBuiltin} />
        {skill.signed && <SignedBadge fingerprint={skill.fingerprint} />}
        <AvailabilityBadge runnable={runnable} missing={missing} />
        {optionalPresent.length > 0 && (
          <Badge tone="muted" title="Enhanced — optional tools available">
            +{optionalPresent.length} optional
          </Badge>
        )}
      </div>

      <div className="flex-1" />

      <div className="flex items-center justify-between gap-2 pt-1">
        <span className="text-[10px] text-muted-foreground/70 font-mono truncate">
          {fm.id}
          {fm.version ? ` · ${fm.version}` : ''}
        </span>
        <div className="flex items-center gap-1 shrink-0">
          {mode === 'component' && onTogglePin && (
            <button
              type="button"
              onClick={() => onTogglePin(fm.id)}
              className={cn(
                'text-[11px] px-2 h-6 rounded border transition-colors',
                pinned
                  ? 'border-primary/40 bg-primary/10 text-primary hover:bg-primary/15'
                  : 'border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted/40'
              )}
              title={pinned ? 'Remove from sidebar' : 'Pin to sidebar'}
            >
              {pinned ? 'Unpin' : 'Pin'}
            </button>
          )}
          {isUserSkill && onUninstall && (
            <button
              type="button"
              onClick={() => onUninstall(skill)}
              className="text-[11px] px-2 h-6 rounded border border-border/60 hover:bg-destructive/10 hover:text-destructive hover:border-destructive/40 transition-colors"
            >
              Uninstall
            </button>
          )}
          <button
            type="button"
            disabled={!runnable}
            onClick={() => onRun?.(skill)}
            className={cn(
              'text-[11px] px-2.5 h-6 rounded font-medium transition-colors',
              'bg-primary text-primary-foreground hover:bg-primary/90',
              'disabled:bg-muted disabled:text-muted-foreground disabled:cursor-not-allowed'
            )}
            title={
              runnable
                ? 'Run this skill'
                : `Missing: ${missing.map(toolLabel).join(', ')}`
            }
          >
            Run
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────

function ModeBadge({ mode }: { mode: 'prompt' | 'script' | 'component' }) {
  const tone = mode === 'component' ? 'primary' : mode === 'script' ? 'warn' : 'muted';
  return <Badge tone={tone}>{mode}</Badge>;
}

function SourceBadge({
  source,
  shadowsBuiltin,
}: {
  source: InstalledSkill['source'];
  shadowsBuiltin: boolean;
}) {
  if (shadowsBuiltin) return <Badge tone="info">Shadowed built-in</Badge>;
  switch (source) {
    case 'builtin':
      return <Badge tone="info">Built-in</Badge>;
    case 'bundle':
      return <Badge tone="muted">Installed</Badge>;
    case 'local':
      return <Badge tone="muted">Local</Badge>;
    case 'remote':
      return <Badge tone="muted">Remote</Badge>;
  }
}

function SignedBadge({ fingerprint }: { fingerprint?: string }) {
  // Shield icon inlined as SVG so `@pipefx/skills` doesn't pick up
  // `lucide-react` as a peer dependency. The fingerprint (Phase 12.13
  // canonical-payload public key) goes into the tooltip so users can
  // confirm a bundle came from the project key without trusting the
  // SKILL.md body's claims.
  const title = fingerprint
    ? `Signed · ${fingerprint.slice(0, 16)}…`
    : 'Signed by a trusted key';
  return (
    <span
      className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wide bg-emerald-500/10 text-emerald-500 border border-emerald-500/30"
      title={title}
    >
      <svg
        viewBox="0 0 24 24"
        width="10"
        height="10"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
      Signed
    </span>
  );
}

function AvailabilityBadge({
  runnable,
  missing,
}: {
  runnable: boolean;
  missing: ReadonlyArray<RequiredTool>;
}) {
  if (runnable) return <Badge tone="success">Available</Badge>;
  return (
    <Badge tone="warn" title={missing.map(toolLabel).join('\n')}>
      Missing {missing.length} tool{missing.length === 1 ? '' : 's'}
    </Badge>
  );
}

function Badge({
  tone,
  children,
  title,
}: {
  tone: 'success' | 'warn' | 'info' | 'muted' | 'primary';
  children: React.ReactNode;
  title?: string;
}) {
  const styles: Record<typeof tone, string> = {
    success:
      'bg-emerald-500/10 text-emerald-500 border border-emerald-500/30',
    warn: 'bg-amber-500/10 text-amber-500 border border-amber-500/30',
    info: 'bg-sky-500/10 text-sky-500 border border-sky-500/30',
    muted:
      'bg-muted/50 text-muted-foreground border border-border/40',
    primary:
      'bg-primary/10 text-primary border border-primary/30',
  };
  return (
    <span
      className={cn(
        'inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wide',
        styles[tone]
      )}
      title={title}
    >
      {children}
    </span>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────

function resolveMode(skill: InstalledSkill): 'prompt' | 'script' | 'component' {
  const fm = skill.loaded.frontmatter;
  if (fm.ui === 'bundled') return 'component';
  if (fm.scripts?.entry) return 'script';
  return 'prompt';
}

function toolLabel(t: RequiredTool): string {
  if (typeof t === 'string') return t;
  if (t.connector?.length) return `${t.name} (${t.connector.join('|')})`;
  return t.name;
}
