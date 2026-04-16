/**
 * palette-runtime.ts — Dynamic palette engine for PipeFX.
 *
 * Built-in palettes are defined in CSS via [data-palette] attribute selectors.
 * Custom palettes are generated at runtime from (mode + hue) and injected as
 * inline CSS custom properties on document.documentElement.
 *
 * This module is the single source of truth for palette application logic.
 */

// ────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────

export interface CustomPalette {
  id: string;
  name: string;
  mode: 'light' | 'dark';
  accentHue: number; // 0–360
  overrides?: Record<string, string>;
}

/** All CSS variable names managed by the palette system */
const PALETTE_VARS = [
  'background', 'foreground',
  'card', 'card-foreground',
  'popover', 'popover-foreground',
  'primary', 'primary-foreground',
  'secondary', 'secondary-foreground',
  'muted', 'muted-foreground',
  'accent', 'accent-foreground',
  'destructive', 'destructive-foreground',
  'success', 'success-foreground',
  'warning', 'warning-foreground',
  'border', 'input', 'ring',
  'chart-1', 'chart-2', 'chart-3', 'chart-4', 'chart-5',
  'sidebar', 'sidebar-foreground',
  'sidebar-primary', 'sidebar-primary-foreground',
  'sidebar-accent', 'sidebar-accent-foreground',
  'sidebar-border', 'sidebar-ring',
  'accent-hue', 'accent-chroma',
] as const;

/** IDs of palettes that are defined in CSS (not generated at runtime) */
export const BUILTIN_PALETTE_IDS = ['cool-teal', 'warm-amber', 'violet-dusk', 'neutral'] as const;
export type BuiltinPaletteId = (typeof BUILTIN_PALETTE_IDS)[number];

export function isBuiltinPalette(id: string): id is BuiltinPaletteId {
  return (BUILTIN_PALETTE_IDS as readonly string[]).includes(id);
}

// ────────────────────────────────────────────────────────
// Variable Generation
// ────────────────────────────────────────────────────────

/**
 * Generate a complete set of OKLCH CSS variables from mode + accent hue.
 * Uses the same formula patterns as the built-in palettes.
 */
export function generateVariables(
  mode: 'light' | 'dark',
  hue: number,
  overrides?: Record<string, string>
): Record<string, string> {
  const h = hue;
  const vars: Record<string, string> =
    mode === 'dark' ? generateDarkVars(h) : generateLightVars(h);

  // Apply user overrides
  if (overrides) {
    for (const [key, val] of Object.entries(overrides)) {
      vars[key] = val;
    }
  }
  return vars;
}

function generateDarkVars(h: number): Record<string, string> {
  const c = 0.015; // subtle neutral chroma
  const ac = 0.16;  // accent chroma
  return {
    'background': `oklch(0.145 ${c} ${h})`,
    'foreground': `oklch(0.93 0.003 ${h})`,
    'card': `oklch(0.185 ${c} ${h})`,
    'card-foreground': `oklch(0.93 0.003 ${h})`,
    'popover': `oklch(0.22 ${c} ${h})`,
    'popover-foreground': `oklch(0.93 0.003 ${h})`,
    'primary': `oklch(0.75 ${ac} ${h})`,
    'primary-foreground': `oklch(0.12 0.005 ${h})`,
    'secondary': `oklch(0.22 0.02 ${h})`,
    'secondary-foreground': `oklch(0.90 0.003 ${h})`,
    'muted': `oklch(0.21 0.008 ${h})`,
    'muted-foreground': `oklch(0.55 0.005 ${h})`,
    'accent': `oklch(0.22 0.025 ${h})`,
    'accent-foreground': `oklch(0.93 0.003 ${h})`,
    'destructive': `oklch(0.55 0.2 25)`,
    'destructive-foreground': `oklch(0.97 0 0)`,
    'success': `oklch(0.70 0.17 145)`,
    'success-foreground': `oklch(0.12 0.005 ${h})`,
    'warning': `oklch(0.75 0.15 75)`,
    'warning-foreground': `oklch(0.12 0.005 ${h})`,
    'border': `oklch(0.28 0.008 ${h})`,
    'input': `oklch(0.25 0.008 ${h})`,
    'ring': `oklch(0.75 ${ac} ${h})`,
    'chart-1': `oklch(0.75 ${ac} ${h})`,
    'chart-2': `oklch(0.70 0.12 ${(h + 30) % 360})`,
    'chart-3': `oklch(0.65 0.14 ${(h + 60) % 360})`,
    'chart-4': `oklch(0.60 0.16 ${(h + 90) % 360})`,
    'chart-5': `oklch(0.75 0.14 ${(h + 120) % 360})`,
    'sidebar': `oklch(0.13 0.005 ${h})`,
    'sidebar-foreground': `oklch(0.93 0.003 ${h})`,
    'sidebar-primary': `oklch(0.75 ${ac} ${h})`,
    'sidebar-primary-foreground': `oklch(0.12 0.005 ${h})`,
    'sidebar-accent': `oklch(0.20 0.018 ${h})`,
    'sidebar-accent-foreground': `oklch(0.93 0.003 ${h})`,
    'sidebar-border': `oklch(0.25 0.006 ${h})`,
    'sidebar-ring': `oklch(0.75 ${ac} ${h})`,
    'accent-hue': `${h}`,
    'accent-chroma': `${ac}`,
  };
}

function generateLightVars(h: number): Record<string, string> {
  const ac = 0.18; // accent chroma (darker for contrast on light)
  return {
    'background': `oklch(0.96 0.008 ${h})`,
    'foreground': `oklch(0.18 0.015 ${h})`,
    'card': `oklch(0.99 0.004 ${h})`,
    'card-foreground': `oklch(0.18 0.015 ${h})`,
    'popover': `oklch(0.99 0.004 ${h})`,
    'popover-foreground': `oklch(0.18 0.015 ${h})`,
    'primary': `oklch(0.58 ${ac} ${h})`,
    'primary-foreground': `oklch(0.99 0.004 ${h})`,
    'secondary': `oklch(0.92 0.015 ${h})`,
    'secondary-foreground': `oklch(0.25 0.015 ${h})`,
    'muted': `oklch(0.93 0.010 ${h})`,
    'muted-foreground': `oklch(0.45 0.015 ${h})`,
    'accent': `oklch(0.94 0.012 ${h})`,
    'accent-foreground': `oklch(0.18 0.015 ${h})`,
    'destructive': `oklch(0.50 0.22 25)`,
    'destructive-foreground': `oklch(0.99 0 0)`,
    'success': `oklch(0.55 0.18 145)`,
    'success-foreground': `oklch(0.99 0 0)`,
    'warning': `oklch(0.65 0.18 75)`,
    'warning-foreground': `oklch(0.15 0.01 ${h})`,
    'border': `oklch(0.87 0.010 ${h})`,
    'input': `oklch(0.90 0.008 ${h})`,
    'ring': `oklch(0.58 ${ac} ${h})`,
    'chart-1': `oklch(0.58 ${ac} ${h})`,
    'chart-2': `oklch(0.55 0.16 ${(h + 30) % 360})`,
    'chart-3': `oklch(0.52 0.16 ${(h + 60) % 360})`,
    'chart-4': `oklch(0.60 0.14 ${(h + 90) % 360})`,
    'chart-5': `oklch(0.50 0.14 ${(h + 120) % 360})`,
    'sidebar': `oklch(0.97 0.006 ${h})`,
    'sidebar-foreground': `oklch(0.18 0.015 ${h})`,
    'sidebar-primary': `oklch(0.58 ${ac} ${h})`,
    'sidebar-primary-foreground': `oklch(0.99 0.004 ${h})`,
    'sidebar-accent': `oklch(0.94 0.012 ${h})`,
    'sidebar-accent-foreground': `oklch(0.18 0.015 ${h})`,
    'sidebar-border': `oklch(0.88 0.008 ${h})`,
    'sidebar-ring': `oklch(0.58 ${ac} ${h})`,
    'accent-hue': `${h}`,
    'accent-chroma': `${ac}`,
  };
}

// ────────────────────────────────────────────────────────
// Runtime Application
// ────────────────────────────────────────────────────────

/**
 * Apply a palette to the document. Built-in palettes use the CSS data-palette
 * attribute. Custom palettes inject inline CSS properties.
 */
export function applyPalette(
  paletteId: string,
  customPalettes: CustomPalette[]
): void {
  const root = document.documentElement;

  if (isBuiltinPalette(paletteId)) {
    // Clear any runtime-injected variables
    clearInlineVars(root);
    // Set the CSS selector
    root.setAttribute('data-palette', paletteId);
    return;
  }

  // Custom palette — find it, generate vars, inject
  const custom = customPalettes.find((p) => p.id === paletteId);
  if (!custom) {
    // Fallback to cool-teal
    clearInlineVars(root);
    root.setAttribute('data-palette', 'cool-teal');
    return;
  }

  // Remove data-palette so built-in CSS doesn't fight
  root.removeAttribute('data-palette');

  const vars = generateVariables(custom.mode, custom.accentHue, custom.overrides);
  for (const [key, val] of Object.entries(vars)) {
    root.style.setProperty(`--${key}`, val);
  }
}

function clearInlineVars(root: HTMLElement): void {
  for (const varName of PALETTE_VARS) {
    root.style.removeProperty(`--${varName}`);
  }
}
