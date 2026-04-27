// ── @pipefx/skills/ui — SkillRunOutput ───────────────────────────────────
// Renders the final state of a SkillRunRecord. The current backend route
// (`POST /api/skills/:id/run`) is blocking — the response IS the final
// record. A future SSE seam will swap this for a streaming view; the
// component shape (status header + body) stays the same.

import type { SkillRunRecord } from '../../contracts/api.js';
import { cn } from '../lib/cn.js';

export interface SkillRunOutputProps {
  record: SkillRunRecord | null;
  /** Set when the dialog has fired the request but the record hasn't
   *  resolved yet. */
  pending?: boolean;
  /** Top-level error from the dispatcher (network, 4xx body, etc.) — runs
   *  that produced a `failed` record carry their error on the record
   *  itself, not here. */
  error?: string | null;
}

export function SkillRunOutput({ record, pending, error }: SkillRunOutputProps) {
  if (pending) {
    return (
      <div className="rounded border border-border/60 bg-muted/30 p-3 text-[12px] text-muted-foreground flex items-center gap-2">
        <Spinner /> Running…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded border border-destructive/40 bg-destructive/10 p-3 text-[12px] text-destructive">
        {error}
      </div>
    );
  }

  if (!record) return null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 flex-wrap">
        <StatusPill status={record.status} />
        <span className="text-[10px] font-mono text-muted-foreground">
          {record.id}
        </span>
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground/80">
          mode: {record.mode}
        </span>
        {record.sessionId && (
          <span className="text-[10px] font-mono text-muted-foreground">
            session: {record.sessionId}
          </span>
        )}
        <span className="ml-auto text-[10px] text-muted-foreground/70">
          {formatDuration(record.startedAt, record.finishedAt)}
        </span>
      </div>

      {record.error && (
        <pre className="rounded border border-destructive/40 bg-destructive/10 p-3 text-[11px] text-destructive whitespace-pre-wrap break-words">
          {record.error}
        </pre>
      )}

      {record.mountInstruction && (
        <div className="rounded border border-border/60 bg-muted/20 p-3 text-[11px] text-muted-foreground">
          Component-mode skill mounted via{' '}
          <code className="font-mono text-foreground">
            {record.mountInstruction.entry}
          </code>{' '}
          ({record.mountInstruction.mount}).
        </div>
      )}

      {record.status === 'succeeded' && !record.mountInstruction && !record.error && (
        <div className="rounded border border-emerald-500/30 bg-emerald-500/5 p-3 text-[12px] text-emerald-500/90">
          Run completed successfully.
        </div>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: SkillRunRecord['status'] }) {
  const styles: Record<SkillRunRecord['status'], string> = {
    pending: 'bg-muted/50 text-muted-foreground border-border/40',
    running: 'bg-primary/10 text-primary border-primary/30',
    succeeded: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30',
    failed: 'bg-destructive/10 text-destructive border-destructive/30',
  };
  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium uppercase tracking-wide border',
        styles[status]
      )}
    >
      {status}
    </span>
  );
}

function Spinner() {
  return (
    <span
      aria-hidden
      className="inline-block w-3 h-3 rounded-full border-2 border-muted-foreground/30 border-t-foreground/80 animate-spin"
    />
  );
}

function formatDuration(start: number, end?: number): string {
  if (!end) return '';
  const ms = Math.max(0, end - start);
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  const rs = Math.round(s - m * 60);
  return `${m}m ${rs}s`;
}
