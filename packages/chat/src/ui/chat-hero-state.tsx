import { useMemo, type ReactNode } from 'react';
import { Scan, Clapperboard, Sparkles, Palette } from 'lucide-react';
import { cn } from '@pipefx/ui-kit';

// ═══════════════════════════════════════════════════════════════
// ChatHeroState — Calm, static first-impression for AI Chat.
// Designed to look good from ~260px up to full-width.
// ═══════════════════════════════════════════════════════════════

interface SuggestedAction {
  icon: typeof Scan;
  label: string;
  shortLabel: string;
  prompt: string;
}

interface ChatHeroStateProps {
  onAction: (prompt: string) => void;
  /** Optional brand-mark slot. Sized via Tailwind classes from this
   *  package, so hosts can pass any logo component sized
   *  `h-* w-*` and it renders identically to the previous PipeFx mark. */
  logo?: ReactNode;
}

export function ChatHeroState({ onAction, logo }: ChatHeroStateProps) {
  const suggestedActions: SuggestedAction[] = useMemo(
    () => [
      {
        icon: Scan,
        label: 'Analyze my project',
        shortLabel: 'Analyze project',
        prompt:
          'Scan and analyze my current DaVinci Resolve project. Build a complete understanding of the timeline, clips, and structure.',
      },
      {
        icon: Clapperboard,
        label: 'Run AutoPod multicam',
        shortLabel: 'AutoPod multicam',
        prompt:
          'Run the AutoPod multicam editing pipeline on my current project. Detect speakers and create camera switches automatically.',
      },
      {
        icon: Sparkles,
        label: 'Generate subtitles',
        shortLabel: 'Subtitles',
        prompt:
          'Generate animated subtitles for my current timeline based on the audio content.',
      },
      {
        icon: Palette,
        label: 'Color grade timeline',
        shortLabel: 'Color grade',
        prompt:
          'Apply a professional color grade to my current timeline. Analyze the footage and suggest an appropriate look.',
      },
    ],
    []
  );

  return (
    <div className="@container relative flex flex-col items-center justify-start flex-1 min-h-0 px-3 pt-10 @[300px]:pt-14 pb-4 gap-4 overflow-hidden">
      {/* Central hero content — logo is bare, no frame */}
      <div className="flex flex-col items-center gap-2.5 @[300px]:gap-3 z-10">
        {/* Logo slot — host-provided. Sized via host classes. */}
        {logo}

        {/* Wordmark */}
        <div className="flex items-baseline gap-0.5 select-none">
          <span className="text-xl @[300px]:text-2xl font-bold tracking-tight text-foreground">Pipe</span>
          <span className="text-xl @[300px]:text-2xl font-bold tracking-tight text-primary">FX</span>
        </div>

        {/* Tagline */}
        <p className="text-[12px] @[300px]:text-sm text-muted-foreground text-center">
          Your AI creative assistant
        </p>
      </div>

      {/* Quick action cards — single column until ~340px, then grid */}
      <div className="grid grid-cols-1 @[340px]:grid-cols-2 gap-2 w-full max-w-md z-10 mt-1">
        {suggestedActions.map((action) => (
          <button
            key={action.label}
            onClick={() => onAction(action.prompt)}
            className={cn(
              'flex items-center gap-2 px-2.5 @[300px]:px-3 py-2.5 rounded-lg border border-border/50',
              'bg-muted/10 hover:bg-muted/40 hover:border-primary/40',
              'transition-colors text-left group min-w-0'
            )}
            title={action.label}
          >
            <action.icon className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
            {/* Short label at narrow widths, full label otherwise */}
            <span className="text-[12px] @[300px]:text-[13px] font-medium text-foreground truncate @[340px]:hidden">
              {action.shortLabel}
            </span>
            <span className="hidden @[340px]:inline text-[13px] font-medium text-foreground truncate">
              {action.label}
            </span>
          </button>
        ))}
      </div>

      {/* Divider — hidden on very narrow panels to save vertical room */}
      <div className="hidden @[300px]:flex items-center gap-2 text-[11px] text-muted-foreground z-10">
        <span className="h-px w-6 bg-border" />
        or type anything below
        <span className="h-px w-6 bg-border" />
      </div>
    </div>
  );
}
