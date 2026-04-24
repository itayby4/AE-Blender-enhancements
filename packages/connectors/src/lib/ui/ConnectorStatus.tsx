import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Local `cn` helper — inlined so this package does not need to depend on a
 * desktop-app shared utils module. Matches the shadcn/ui convention used by
 * `apps/desktop/src/lib/utils.ts`.
 */
function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export interface ConnectorStatusProps {
  activeApp: string;
  isConnected: boolean;
  onChangeApp: (app: string) => void;
  className?: string;
}

const APPS: { id: string; label: string; shortLabel: string }[] = [
  { id: 'resolve',      label: 'DaVinci Resolve',    shortLabel: 'Resolve' },
  { id: 'premiere',     label: 'Premiere Pro',        shortLabel: 'Premiere' },
  { id: 'aftereffects', label: 'After Effects',       shortLabel: 'AE' },
  { id: 'blender',      label: 'Blender',             shortLabel: 'Blender' },
  { id: 'ableton',      label: 'Ableton Live',        shortLabel: 'Ableton' },
];

/**
 * ConnectorStatus — Compact NLE connection widget for the bottom of the
 * right panel. Shows connection health and allows switching the active NLE.
 */
export function ConnectorStatus({
  activeApp,
  isConnected,
  onChangeApp,
  className,
}: ConnectorStatusProps) {
  const [isOpen, setIsOpen] = useState(false);
  const current = APPS.find((a) => a.id === activeApp) ?? APPS[0];

  return (
    <div className={cn('relative', className)}>
      {/* Dropdown menu */}
      {isOpen && (
        <>
          {/* Click-away backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute bottom-full left-0 right-0 mb-1.5 z-50 bg-popover border border-border rounded-xl shadow-xl overflow-hidden animate-in fade-in-0 zoom-in-95">
            <div className="px-3 py-2 border-b">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Switch NLE</p>
            </div>
            {APPS.map((app) => (
              <button
                key={app.id}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2.5 text-left text-sm hover:bg-muted/60 transition-colors',
                  app.id === activeApp && 'bg-primary/8 text-primary font-medium'
                )}
                onClick={() => {
                  onChangeApp(app.id);
                  setIsOpen(false);
                }}
              >
                {/* Mini status dot */}
                <div className={cn(
                  'w-2 h-2 rounded-full shrink-0',
                  app.id === activeApp
                    ? (isConnected ? 'bg-success' : 'bg-destructive')
                    : 'bg-muted-foreground/30'
                )} />
                <span>{app.label}</span>
                {app.id === activeApp && (
                  <span className={cn(
                    'ml-auto text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-full',
                    isConnected
                      ? 'bg-success/10 text-success'
                      : 'bg-destructive/10 text-destructive'
                  )}>
                    {isConnected ? 'Live' : 'Offline'}
                  </span>
                )}
              </button>
            ))}
          </div>
        </>
      )}

      {/* Main trigger chip */}
      <button
        onClick={() => setIsOpen((v) => !v)}
        className={cn(
          'w-full flex items-center gap-3 px-4 py-3 bg-card rounded-xl border hover:bg-muted/30 transition-colors group',
        )}
      >
        {/* Live dot */}
        <div className="relative shrink-0">
          <div className={cn(
            'w-2.5 h-2.5 rounded-full transition-colors',
            isConnected ? 'bg-success' : 'bg-destructive'
          )} />
          {isConnected && (
            <div className="absolute inset-0 rounded-full bg-success animate-ping opacity-40" />
          )}
        </div>

        {/* Label */}
        <div className="flex-1 min-w-0 text-left">
          <div className="text-xs font-semibold text-foreground truncate">{current.label}</div>
          <div className="text-[10px] text-muted-foreground">
            {isConnected ? 'Connected via MCP' : 'Disconnected'}
          </div>
        </div>

        {/* Status badge + chevron */}
        <div className="flex items-center gap-1.5 shrink-0">
          <div className={cn(
            'px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider',
            isConnected
              ? 'bg-success/10 text-success'
              : 'bg-destructive/10 text-destructive'
          )}>
            {isConnected ? 'Live' : 'Offline'}
          </div>
          <ChevronDown className={cn(
            'h-3.5 w-3.5 text-muted-foreground transition-transform duration-200',
            isOpen && 'rotate-180'
          )} />
        </div>
      </button>
    </div>
  );
}
