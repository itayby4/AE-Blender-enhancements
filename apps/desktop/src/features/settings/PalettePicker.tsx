import { cn } from '../../lib/utils.js';
import type { CustomPalette } from '../../lib/palette-runtime.js';
import { Pencil, Trash2 } from 'lucide-react';

// ────────────────────────────────────────────────────────
// Built-in palette metadata (display info only — CSS handles the vars)
// ────────────────────────────────────────────────────────

export type PaletteId = string; // no longer a union — extensible

interface BuiltinMeta {
  id: string;
  name: string;
  description: string;
  mode: 'light' | 'dark';
  /** Representative colors for the mini preview: [bg, card, primary] */
  preview: { bg: string; card: string; primary: string; fg: string; muted: string; border: string };
}

const BUILTIN_PALETTES: BuiltinMeta[] = [
  {
    id: 'cool-teal',
    name: 'Cool Teal',
    description: 'Electric blue-teal. The default dark theme.',
    mode: 'dark',
    preview: {
      bg: 'oklch(0.145 0.005 240)',
      card: 'oklch(0.185 0.007 240)',
      primary: 'oklch(0.75 0.15 190)',
      fg: 'oklch(0.93 0.003 240)',
      muted: 'oklch(0.55 0.005 240)',
      border: 'oklch(0.28 0.006 240)',
    },
  },
  {
    id: 'warm-amber',
    name: 'Warm Amber',
    description: 'Golden hour warmth. Light mode.',
    mode: 'light',
    preview: {
      bg: 'oklch(0.96 0.008 75)',
      card: 'oklch(0.99 0.004 75)',
      primary: 'oklch(0.58 0.18 55)',
      fg: 'oklch(0.18 0.015 55)',
      muted: 'oklch(0.45 0.015 55)',
      border: 'oklch(0.87 0.010 75)',
    },
  },
  {
    id: 'violet-dusk',
    name: 'Violet Dusk',
    description: 'Deep purple. Cyberpunk drama.',
    mode: 'dark',
    preview: {
      bg: 'oklch(0.135 0.010 260)',
      card: 'oklch(0.175 0.012 260)',
      primary: 'oklch(0.72 0.20 285)',
      fg: 'oklch(0.94 0.005 260)',
      muted: 'oklch(0.54 0.008 260)',
      border: 'oklch(0.28 0.012 260)',
    },
  },
  {
    id: 'neutral',
    name: 'Neutral',
    description: 'Pure gray. Zero distraction.',
    mode: 'dark',
    preview: {
      bg: 'oklch(0.14 0 0)',
      card: 'oklch(0.18 0 0)',
      primary: 'oklch(0.75 0 0)',
      fg: 'oklch(0.93 0 0)',
      muted: 'oklch(0.55 0 0)',
      border: 'oklch(0.28 0 0)',
    },
  },
];

// ────────────────────────────────────────────────────────
// Mini Preview — renders a tiny UI mockup in the palette's colors
// ────────────────────────────────────────────────────────

function MiniPreview({ colors }: {
  colors: { bg: string; card: string; primary: string; fg: string; muted: string; border: string };
}) {
  return (
    <div
      className="w-28 h-16 rounded-md overflow-hidden flex shrink-0"
      style={{ background: colors.bg, border: `1px solid ${colors.border}` }}
    >
      {/* Sidebar */}
      <div className="w-5 h-full flex flex-col items-center gap-1 py-1.5" style={{ background: colors.card, borderRight: `1px solid ${colors.border}` }}>
        <div className="w-2.5 h-2.5 rounded-sm" style={{ background: colors.primary }} />
        <div className="w-2.5 h-2.5 rounded-sm" style={{ background: colors.muted }} />
        <div className="w-2.5 h-2.5 rounded-sm" style={{ background: colors.muted }} />
      </div>
      {/* Main area */}
      <div className="flex-1 p-1.5 flex flex-col gap-1">
        {/* Header bar */}
        <div className="h-2 rounded-sm" style={{ background: colors.card, border: `1px solid ${colors.border}` }} />
        {/* Card */}
        <div className="flex-1 rounded-sm p-1" style={{ background: colors.card, border: `1px solid ${colors.border}` }}>
          <div className="w-full h-1.5 rounded-full mb-1" style={{ background: colors.fg, opacity: 0.7 }} />
          <div className="w-3/4 h-1.5 rounded-full" style={{ background: colors.muted }} />
        </div>
        {/* Button */}
        <div className="h-2.5 w-10 rounded-sm self-end" style={{ background: colors.primary }} />
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────
// PalettePicker — vertical list with live previews
// ────────────────────────────────────────────────────────

interface PalettePickerProps {
  activePalette: string;
  customPalettes: CustomPalette[];
  onChange: (id: string) => void;
  onEditCustom?: (palette: CustomPalette) => void;
  onDeleteCustom?: (id: string) => void;
  onCreateNew?: () => void;
}

export function PalettePicker({
  activePalette,
  customPalettes,
  onChange,
  onEditCustom,
  onDeleteCustom,
  onCreateNew,
}: PalettePickerProps) {
  return (
    <div className="flex flex-col gap-1">
      {/* Section: Built-in */}
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1 px-1">
        Built-in
      </div>
      {BUILTIN_PALETTES.map((p) => (
        <PaletteRow
          key={p.id}
          id={p.id}
          name={p.name}
          description={p.description}
          mode={p.mode}
          preview={<MiniPreview colors={p.preview} />}
          isActive={activePalette === p.id}
          onClick={() => onChange(p.id)}
        />
      ))}

      {/* Section: Custom */}
      {(customPalettes.length > 0 || onCreateNew) && (
        <>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mt-4 mb-1 px-1">
            Custom
          </div>

          {customPalettes.map((p) => {
            const previewColors = generatePreviewColors(p);
            return (
              <PaletteRow
                key={p.id}
                id={p.id}
                name={p.name}
                description={`${p.mode === 'light' ? 'Light' : 'Dark'} · hue ${p.accentHue}`}
                mode={p.mode}
                preview={<MiniPreview colors={previewColors} />}
                isActive={activePalette === p.id}
                onClick={() => onChange(p.id)}
                onEdit={() => onEditCustom?.(p)}
                onDelete={() => onDeleteCustom?.(p.id)}
              />
            );
          })}

          {onCreateNew && (
            <button
              onClick={onCreateNew}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-dashed border-border/60 text-muted-foreground hover:text-foreground hover:border-primary/40 hover:bg-primary/5 transition-colors"
            >
              <div className="w-28 h-16 rounded-md border border-dashed border-current flex items-center justify-center shrink-0">
                <span className="text-lg leading-none">+</span>
              </div>
              <div className="text-sm font-medium">Create palette</div>
            </button>
          )}
        </>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────
// PaletteRow — single row in the list
// ────────────────────────────────────────────────────────

function PaletteRow({
  id,
  name,
  description,
  mode,
  preview,
  isActive,
  onClick,
  onEdit,
  onDelete,
}: {
  id: string;
  name: string;
  description: string;
  mode: 'light' | 'dark';
  preview: React.ReactNode;
  isActive: boolean;
  onClick: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'group flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-left transition-colors',
        isActive
          ? 'bg-primary/8 border border-primary/30'
          : 'border border-transparent hover:bg-muted/40'
      )}
    >
      {/* Radio indicator */}
      <div className="shrink-0">
        <div className={cn(
          'w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors',
          isActive ? 'border-primary' : 'border-muted-foreground/30'
        )}>
          {isActive && <div className="w-2 h-2 rounded-full bg-primary" />}
        </div>
      </div>

      {/* Preview */}
      {preview}

      {/* Label */}
      <div className="flex-1 min-w-0">
        <div className={cn(
          'text-sm font-medium leading-tight',
          isActive ? 'text-primary' : 'text-foreground'
        )}>
          {name}
        </div>
        <div className="text-xs text-muted-foreground mt-0.5">
          {description}
        </div>
      </div>

      {/* Mode badge */}
      <span className={cn(
        'text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0',
        mode === 'light'
          ? 'bg-warning/10 text-warning'
          : 'bg-muted text-muted-foreground'
      )}>
        {mode}
      </span>

      {/* Edit/Delete (custom only) */}
      {(onEdit || onDelete) && (
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          {onEdit && (
            <button
              onClick={(e) => { e.stopPropagation(); onEdit(); }}
              className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
              title="Edit"
            >
              <Pencil className="w-3 h-3" />
            </button>
          )}
          {onDelete && (
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
              title="Delete"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          )}
        </div>
      )}
    </button>
  );
}

// ────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────

function generatePreviewColors(p: CustomPalette) {
  const h = p.accentHue;
  if (p.mode === 'dark') {
    return {
      bg: `oklch(0.145 0.015 ${h})`,
      card: `oklch(0.185 0.015 ${h})`,
      primary: `oklch(0.75 0.16 ${h})`,
      fg: `oklch(0.93 0.003 ${h})`,
      muted: `oklch(0.55 0.005 ${h})`,
      border: `oklch(0.28 0.008 ${h})`,
    };
  }
  return {
    bg: `oklch(0.96 0.008 ${h})`,
    card: `oklch(0.99 0.004 ${h})`,
    primary: `oklch(0.58 0.18 ${h})`,
    fg: `oklch(0.18 0.015 ${h})`,
    muted: `oklch(0.45 0.015 ${h})`,
    border: `oklch(0.87 0.010 ${h})`,
  };
}
