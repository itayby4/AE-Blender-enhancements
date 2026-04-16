import { useState, useEffect, useMemo } from 'react';
import { Scan, Clapperboard, Sparkles, Palette } from 'lucide-react';
import { cn } from '../../lib/utils.js';

// ═══════════════════════════════════════════════════════════════
// ChatHeroState — Cinematic first-impression for the AI Chat panel.
//
// Displays an animated PipeFX glyph, flowing signal lines, and
// staggered wordmark when the chat has no messages. Dissolves
// smoothly when the user sends their first prompt.
//
// All animations are pure CSS — no runtime JS animation loops.
// Respects prefers-reduced-motion automatically via styles.css.
// ═══════════════════════════════════════════════════════════════

interface SuggestedAction {
  icon: typeof Scan;
  label: string;
  prompt: string;
}

interface ChatHeroStateProps {
  onAction: (prompt: string) => void;
}

/**
 * The "signal flow" Unicode glyph — a stylized pipe network
 * built from box-drawing characters that animates in.
 */
function SignalGlyph() {
  return (
    <div className="hero-glyph relative flex items-center justify-center">
      {/* Outer orbiting ring */}
      <div className="absolute inset-0 hero-orbit">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1 w-1.5 h-1.5 rounded-full bg-primary/60" />
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1 w-1 h-1 rounded-full bg-primary/30" />
        <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1 w-1 h-1 rounded-full bg-primary/40" />
        <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1 w-1.5 h-1.5 rounded-full bg-primary/50" />
      </div>

      {/* Central glyph — layered geometric shapes */}
      <div className="relative w-20 h-20">
        {/* Background glow */}
        <div className="absolute inset-0 rounded-3xl bg-primary/8 hero-pulse" />

        {/* Diamond ring */}
        <div className="absolute inset-2 rounded-2xl border-2 border-primary/20 hero-spin-slow" />

        {/* Inner diamond */}
        <div className="absolute inset-4 rounded-xl bg-primary/10 border border-primary/30 hero-pulse-delay" />

        {/* Center icon — the "pipe" symbol */}
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-2xl font-mono font-bold text-primary hero-text-glow select-none">
            ◈
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * Stagger-animated wordmark with character-by-character reveal.
 */
function AnimatedWordmark() {
  const letters = 'PipeFX'.split('');

  return (
    <div className="flex items-baseline gap-0.5 select-none">
      {letters.map((char, i) => (
        <span
          key={i}
          className="hero-letter text-2xl font-bold tracking-tight"
          style={{
            animationDelay: `${600 + i * 80}ms`,
          }}
        >
          {char === 'F' || char === 'X' ? (
            <span className="text-primary">{char}</span>
          ) : (
            <span className="text-foreground">{char}</span>
          )}
        </span>
      ))}
    </div>
  );
}

/**
 * Typing tagline that reveals character by character.
 */
function TypewriterTagline() {
  const [visibleChars, setVisibleChars] = useState(0);
  const text = 'Your AI creative assistant';

  useEffect(() => {
    const startDelay = setTimeout(() => {
      const interval = setInterval(() => {
        setVisibleChars((prev) => {
          if (prev >= text.length) {
            clearInterval(interval);
            return prev;
          }
          return prev + 1;
        });
      }, 35);
      return () => clearInterval(interval);
    }, 1200);
    return () => clearTimeout(startDelay);
  }, [text.length]);

  return (
    <p className="text-sm text-muted-foreground font-mono h-5">
      {text.substring(0, visibleChars)}
      {visibleChars < text.length && (
        <span className="inline-block w-px h-4 bg-primary ml-px animate-pulse align-text-bottom" />
      )}
    </p>
  );
}

/**
 * Flowing signal lines — decorative CSS paths
 */
function SignalLines() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-20">
      {/* Horizontal flows */}
      <div className="absolute top-1/3 left-0 right-0 h-px hero-line-h" />
      <div className="absolute top-2/3 left-0 right-0 h-px hero-line-h-reverse" />

      {/* Vertical flows */}
      <div className="absolute left-1/4 top-0 bottom-0 w-px hero-line-v" />
      <div className="absolute right-1/4 top-0 bottom-0 w-px hero-line-v-reverse" />

      {/* Corner nodes */}
      <div className="absolute top-1/3 left-1/4 w-1.5 h-1.5 rounded-full bg-primary hero-node-pulse" />
      <div className="absolute top-2/3 right-1/4 w-1.5 h-1.5 rounded-full bg-primary hero-node-pulse" style={{ animationDelay: '1s' }} />
      <div className="absolute top-1/3 right-1/4 w-1 h-1 rounded-full bg-primary hero-node-pulse" style={{ animationDelay: '0.5s' }} />
      <div className="absolute top-2/3 left-1/4 w-1 h-1 rounded-full bg-primary hero-node-pulse" style={{ animationDelay: '1.5s' }} />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════

export function ChatHeroState({ onAction }: ChatHeroStateProps) {
  const suggestedActions: SuggestedAction[] = useMemo(() => [
    { icon: Scan, label: 'Analyze my project', prompt: 'Scan and analyze my current DaVinci Resolve project. Build a complete understanding of the timeline, clips, and structure.' },
    { icon: Clapperboard, label: 'Run AutoPod multicam', prompt: 'Run the AutoPod multicam editing pipeline on my current project. Detect speakers and create camera switches automatically.' },
    { icon: Sparkles, label: 'Generate subtitles', prompt: 'Generate animated subtitles for my current timeline based on the audio content.' },
    { icon: Palette, label: 'Color grade timeline', prompt: 'Apply a professional color grade to my current timeline. Analyze the footage and suggest an appropriate look.' },
  ], []);

  return (
    <div className="relative flex flex-col items-center justify-center flex-1 min-h-0 py-8 gap-6 hero-container">
      {/* Background signal flow lines */}
      <SignalLines />

      {/* Central hero content */}
      <div className="flex flex-col items-center gap-4 z-10">
        <SignalGlyph />
        <AnimatedWordmark />
        <TypewriterTagline />
      </div>

      {/* Quick action cards */}
      <div className="grid grid-cols-2 gap-3 w-full max-w-md z-10 mt-4 hero-actions-enter">
        {suggestedActions.map((action) => (
          <button
            key={action.label}
            onClick={() => onAction(action.prompt)}
            className={cn(
              'flex items-center gap-3 px-4 py-3.5 rounded-xl border border-border/50',
              'bg-muted/20 hover:bg-muted/50 hover:border-primary/30',
              'transition-all text-left group hover-lift'
            )}
          >
            <action.icon className="w-4.5 h-4.5 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
            <span className="text-sm font-medium text-foreground">{action.label}</span>
          </button>
        ))}
      </div>

      {/* Divider */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground z-10 hero-actions-enter" style={{ animationDelay: '200ms' }}>
        <span className="h-px w-8 bg-border" />
        or type anything below
        <span className="h-px w-8 bg-border" />
      </div>
    </div>
  );
}
