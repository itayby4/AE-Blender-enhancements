// ── @pipefx/skills/ui — StoreComingSoon ──────────────────────────────────
// Empty-state placeholder for the Store tab. The marketplace ships in a
// later phase; today the panel exists so the tab nav has somewhere to
// dock and so users see it on the roadmap.

export function StoreComingSoon() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8">
      <div className="flex flex-col items-center gap-3 px-6 py-8 rounded-xl bg-card/80 border border-border/60 max-w-sm text-center">
        <div className="w-10 h-10 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-primary"
          >
            <path d="M3 7h18l-2 12H5L3 7z" />
            <path d="M8 7V5a4 4 0 0 1 8 0v2" />
          </svg>
        </div>
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-foreground">
            Skill Store — Coming Soon
          </h3>
          <p className="text-[12px] text-muted-foreground leading-relaxed">
            Browse, install, and update community skills directly from the
            app. Drop a <code className="font-mono text-[11px]">.pfxskill</code>{' '}
            bundle into the library today, or wait for the Store launch in a
            future release.
          </p>
        </div>
      </div>
    </div>
  );
}
