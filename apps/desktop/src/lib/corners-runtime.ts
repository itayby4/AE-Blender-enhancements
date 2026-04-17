/**
 * corners-runtime.ts — Toggle for corner shape mode.
 *
 * Supports two values:
 *   - "rounded" (default): uses the design system's --radius-* tokens
 *   - "sharp": overrides every border-radius to 0 via [data-corners="sharp"]
 *             CSS rules in styles.css
 *
 * Persisted in localStorage under "pipefx-corners".
 */

export type CornerMode = 'rounded' | 'sharp';

export const CORNER_MODES: readonly CornerMode[] = ['rounded', 'sharp'] as const;

const STORAGE_KEY = 'pipefx-corners';

export function isCornerMode(value: string): value is CornerMode {
  return (CORNER_MODES as readonly string[]).includes(value);
}

/** Read the persisted mode from localStorage, defaulting to "rounded". */
export function loadCornerMode(): CornerMode {
  if (typeof window === 'undefined') return 'rounded';
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored && isCornerMode(stored) ? stored : 'rounded';
}

/** Apply the mode to the document and persist it. */
export function applyCornerMode(mode: CornerMode): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (mode === 'sharp') {
    root.setAttribute('data-corners', 'sharp');
  } else {
    root.removeAttribute('data-corners');
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // localStorage may be unavailable (private mode, etc) — mode still applies visually
  }
}
