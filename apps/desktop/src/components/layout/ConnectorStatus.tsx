import { cn } from '../../lib/utils.js';

interface ConnectorStatusProps {
  activeApp: string;
  isConnected: boolean;
  className?: string;
}

const APP_LABELS: Record<string, string> = {
  resolve: 'DaVinci Resolve',
  premiere: 'Premiere Pro',
  aftereffects: 'After Effects',
  blender: 'Blender',
  ableton: 'Ableton Live',
};

/**
 * ConnectorStatus — Compact strip showing active MCP connection health.
 * Sits at the bottom of the right panel in the Bento layout.
 */
export function ConnectorStatus({ activeApp, isConnected, className }: ConnectorStatusProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 px-4 py-3 bg-card rounded-xl border hover-lift',
        className
      )}
    >
      {/* Connection indicator — steady dot, no distracting ping */}
      <div className="relative">
        <div
          className={cn(
            'w-2.5 h-2.5 rounded-full transition-colors',
            isConnected ? 'bg-success' : 'bg-destructive'
          )}
        />
      </div>

      {/* Label */}
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium text-foreground truncate">
          {APP_LABELS[activeApp] || activeApp}
        </div>
        <div className="text-[10px] text-muted-foreground">
          {isConnected ? 'Connected via MCP' : 'Disconnected'}
        </div>
      </div>

      {/* Status badge */}
      <div
        className={cn(
          'px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider',
          isConnected
            ? 'bg-success/10 text-success'
            : 'bg-destructive/10 text-destructive'
        )}
      >
        {isConnected ? 'Live' : 'Offline'}
      </div>
    </div>
  );
}
