import { useEffect, useState } from 'react';
import { cn } from '../../lib/utils.js';

// ════════════════════════════════════════════════════════════════
// TerminalSpinner — Classic CLI loader "../" + rotating line
//
//   "../|"  →  "../\"  →  "../-"  →  "../\/"  →  ...
//
// Uses plain text characters so it inherits the chat's monospace
// vibe and scales with text size.
// ════════════════════════════════════════════════════════════════

const FRAMES = ['|', '/', '-', '\\'];

interface TerminalSpinnerProps {
  className?: string;
  /** When true, only shows the rotating char without the "../" prefix */
  bare?: boolean;
  /** Milliseconds between frames (default 110) */
  intervalMs?: number;
}

export function TerminalSpinner({ className, bare, intervalMs = 110 }: TerminalSpinnerProps) {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => {
      setFrame((f) => (f + 1) % FRAMES.length);
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);

  return (
    <span
      className={cn(
        'font-mono inline-flex items-center tabular-nums select-none',
        className
      )}
      aria-label="Loading"
      role="status"
    >
      {!bare && <span className="opacity-80">../</span>}
      <span className="w-[0.6em] text-center">{FRAMES[frame]}</span>
    </span>
  );
}
