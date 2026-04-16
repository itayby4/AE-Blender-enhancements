import { ImageIcon, Wand2, Copy, Download, Layers, Settings2 } from 'lucide-react';
import { Button } from '../../components/ui/button.js';

const STYLES = [
  { id: 'cinematic', label: 'Cinematic', preview: 'oklch(0.20 0.03 220)' },
  { id: 'documentary', label: 'Documentary', preview: 'oklch(0.22 0.02 30)' },
  { id: 'abstract', label: 'Abstract', preview: 'oklch(0.18 0.04 285)' },
  { id: 'minimalist', label: 'Minimalist', preview: 'oklch(0.25 0.005 240)' },
];

/**
 * ImageGenDashboard — Image Studio placeholder with style selector.
 */
export function ImageGenDashboard() {
  return (
    <div className="flex flex-col h-full p-6 overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <ImageIcon className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Image Studio</h1>
            <p className="text-sm text-muted-foreground">AI image generation for your projects</p>
          </div>
        </div>
        <Button variant="outline" size="sm" className="gap-2">
          <Settings2 className="h-4 w-4" />
          Configure
        </Button>
      </div>

      <div className="flex gap-6 flex-1 min-h-0">
        {/* Left: prompt area */}
        <div className="flex flex-col gap-4 flex-1 min-w-0">
          <div className="rounded-xl border bg-muted/20 p-4">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 block">
              Prompt
            </label>
            <textarea
              className="w-full h-24 bg-transparent text-sm text-foreground placeholder:text-muted-foreground resize-none outline-none font-sans leading-relaxed select-text"
              placeholder="Describe the image you want to generate…"
            />
          </div>

          {/* Style selector */}
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Style</div>
            <div className="grid grid-cols-4 gap-2">
              {STYLES.map((style) => (
                <button
                  key={style.id}
                  className="group rounded-lg border border-border/50 overflow-hidden hover:border-primary/50 transition-colors"
                >
                  <div className="h-12 w-full" style={{ background: style.preview }} />
                  <div className="px-2 py-1.5 text-xs font-medium text-center group-hover:text-primary transition-colors">
                    {style.label}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <Button className="gap-2 mt-auto">
            <Wand2 className="h-4 w-4" />
            Generate Image
          </Button>
        </div>

        {/* Right: output area */}
        <div className="w-64 flex flex-col gap-3 shrink-0">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Output</div>
          <div className="flex-1 rounded-xl border-2 border-dashed border-border/40 flex flex-col items-center justify-center p-4 text-center min-h-[180px]">
            <Layers className="h-8 w-8 text-muted-foreground/40 mb-2" />
            <div className="text-xs text-muted-foreground">Generated image will appear here</div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="flex-1 gap-1.5 text-xs">
              <Copy className="h-3.5 w-3.5" /> Copy
            </Button>
            <Button variant="outline" size="sm" className="flex-1 gap-1.5 text-xs">
              <Download className="h-3.5 w-3.5" /> Export
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
