import { useState, useId } from 'react';
import { Button } from '../../components/ui/button.js';
import { Input } from '../../components/ui/input.js';
import { Label } from '../../components/ui/label.js';
import { cn } from '../../lib/utils.js';
import type { CustomPalette } from '../../lib/palette-runtime.js';
import { generateVariables } from '../../lib/palette-runtime.js';

// ────────────────────────────────────────────────────────
// PaletteEditor — create or edit a custom palette
// ────────────────────────────────────────────────────────

interface PaletteEditorProps {
  /** Null = creating new, non-null = editing existing */
  initial?: CustomPalette | null;
  existingIds: string[];
  onSave: (palette: CustomPalette) => void;
  onCancel: () => void;
}

export function PaletteEditor({ initial, existingIds, onSave, onCancel }: PaletteEditorProps) {
  const nameId = useId();
  const [name, setName] = useState(initial?.name || '');
  const [mode, setMode] = useState<'light' | 'dark'>(initial?.mode || 'dark');
  const [hue, setHue] = useState(initial?.accentHue ?? 200);
  const [error, setError] = useState('');

  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'untitled';
  const id = initial?.id || slug;
  const isDuplicate = !initial && existingIds.includes(id);

  const handleSave = () => {
    if (!name.trim()) {
      setError('Name is required');
      return;
    }
    if (isDuplicate) {
      setError('A palette with this name already exists');
      return;
    }
    onSave({
      id,
      name: name.trim(),
      mode,
      accentHue: hue,
      overrides: initial?.overrides,
    });
  };

  // Generate preview colors
  const vars = generateVariables(mode, hue);

  return (
    <div className="border rounded-xl bg-card overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b">
        <h3 className="text-sm font-semibold">
          {initial ? 'Edit Palette' : 'New Palette'}
        </h3>
      </div>

      <div className="p-4 space-y-4">
        {/* Name */}
        <div className="space-y-1.5">
          <Label htmlFor={nameId} className="text-xs font-medium">Name</Label>
          <Input
            id={nameId}
            value={name}
            onChange={(e) => { setName(e.target.value); setError(''); }}
            placeholder="My Custom Theme"
            className="h-8 text-sm"
          />
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>

        {/* Mode toggle */}
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Mode</Label>
          <div className="flex gap-2">
            <button
              onClick={() => setMode('dark')}
              className={cn(
                'flex-1 py-2 rounded-lg text-xs font-medium border transition-colors',
                mode === 'dark'
                  ? 'bg-foreground text-background border-foreground'
                  : 'bg-muted/40 text-muted-foreground border-border/50 hover:border-border'
              )}
            >
              Dark
            </button>
            <button
              onClick={() => setMode('light')}
              className={cn(
                'flex-1 py-2 rounded-lg text-xs font-medium border transition-colors',
                mode === 'light'
                  ? 'bg-foreground text-background border-foreground'
                  : 'bg-muted/40 text-muted-foreground border-border/50 hover:border-border'
              )}
            >
              Light
            </button>
          </div>
        </div>

        {/* Hue slider */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-medium">Accent Hue</Label>
            <span className="text-xs font-mono text-muted-foreground">{hue}°</span>
          </div>
          <div className="relative">
            <input
              type="range"
              min="0"
              max="360"
              value={hue}
              onChange={(e) => setHue(Number(e.target.value))}
              className="w-full h-3 rounded-full appearance-none cursor-pointer"
              style={{
                background: `linear-gradient(to right, 
                  oklch(0.7 0.18 0), oklch(0.7 0.18 30), oklch(0.7 0.18 60), 
                  oklch(0.7 0.18 90), oklch(0.7 0.18 120), oklch(0.7 0.18 150), 
                  oklch(0.7 0.18 180), oklch(0.7 0.18 210), oklch(0.7 0.18 240), 
                  oklch(0.7 0.18 270), oklch(0.7 0.18 300), oklch(0.7 0.18 330), 
                  oklch(0.7 0.18 360))`,
              }}
            />
          </div>
        </div>

        {/* Live preview */}
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Preview</Label>
          <div
            className="rounded-lg overflow-hidden flex h-24"
            style={{
              background: vars['background'],
              border: `1px solid ${vars['border']}`,
            }}
          >
            {/* Mini sidebar */}
            <div
              className="w-8 h-full flex flex-col items-center gap-1.5 py-2"
              style={{
                background: vars['sidebar'],
                borderRight: `1px solid ${vars['sidebar-border']}`,
              }}
            >
              <div className="w-3.5 h-3.5 rounded" style={{ background: vars['primary'] }} />
              <div className="w-3.5 h-3.5 rounded" style={{ background: vars['muted-foreground'], opacity: 0.4 }} />
              <div className="w-3.5 h-3.5 rounded" style={{ background: vars['muted-foreground'], opacity: 0.4 }} />
            </div>
            {/* Main content */}
            <div className="flex-1 p-2 flex flex-col gap-1.5">
              {/* Top bar */}
              <div
                className="h-3.5 rounded"
                style={{ background: vars['card'], border: `1px solid ${vars['border']}` }}
              />
              {/* Card with text lines */}
              <div
                className="flex-1 rounded p-2 flex flex-col gap-1"
                style={{ background: vars['card'], border: `1px solid ${vars['border']}` }}
              >
                <div
                  className="h-2 w-3/4 rounded-full"
                  style={{ background: vars['foreground'], opacity: 0.8 }}
                />
                <div
                  className="h-2 w-1/2 rounded-full"
                  style={{ background: vars['muted-foreground'] }}
                />
              </div>
              {/* Action bar */}
              <div className="flex justify-end gap-1.5">
                <div
                  className="h-4 w-12 rounded"
                  style={{ background: vars['muted'] }}
                />
                <div
                  className="h-4 w-12 rounded"
                  style={{ background: vars['primary'] }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-1">
          <Button variant="outline" size="sm" onClick={onCancel} className="flex-1">
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave} className="flex-1" disabled={isDuplicate}>
            {initial ? 'Update' : 'Create'}
          </Button>
        </div>
      </div>
    </div>
  );
}
