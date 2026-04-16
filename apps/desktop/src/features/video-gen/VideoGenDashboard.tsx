import { Video, Sparkles, Zap, Film, UploadCloud, Settings2 } from 'lucide-react';
import { Button } from '../../components/ui/button.js';

const QUICK_ACTIONS = [
  { icon: Film, label: 'Generate from script', desc: 'Turn a text script into a video sequence.' },
  { icon: Sparkles, label: 'AI upscale footage', desc: 'Enhance resolution of existing clips.' },
  { icon: Zap, label: 'Auto-color grade', desc: 'Match grade across multiple clips.' },
  { icon: UploadCloud, label: 'Import media', desc: 'Bring in footage from DaVinci Resolve.' },
];

/**
 * VideoGenDashboard — Video Studio placeholder with rich feature cards.
 */
export function VideoGenDashboard() {
  return (
    <div className="flex flex-col h-full p-6 overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <Video className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Video Studio</h1>
            <p className="text-sm text-muted-foreground">AI-powered video generation & enhancement</p>
          </div>
        </div>
        <Button variant="outline" size="sm" className="gap-2">
          <Settings2 className="h-4 w-4" />
          Configure
        </Button>
      </div>

      {/* Quick actions grid */}
      <div className="grid grid-cols-2 gap-4 mb-8">
        {QUICK_ACTIONS.map((action) => {
          const Icon = action.icon;
          return (
            <button
              key={action.label}
              className="group flex items-start gap-4 p-4 rounded-xl border border-border/50 bg-card/60 hover:border-primary/40 hover:bg-primary/5 transition-all duration-200 text-left"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted group-hover:bg-primary/15 group-hover:text-primary transition-colors">
                <Icon className="h-5 w-5" />
              </div>
              <div>
                <div className="text-sm font-semibold group-hover:text-primary transition-colors">{action.label}</div>
                <div className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{action.desc}</div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Drop zone */}
      <div className="flex-1 min-h-[200px] rounded-xl border-2 border-dashed border-border/40 hover:border-primary/40 transition-colors flex flex-col items-center justify-center text-center p-8 cursor-pointer group">
        <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-muted mb-4 group-hover:bg-primary/10 transition-colors">
          <UploadCloud className="h-7 w-7 text-muted-foreground group-hover:text-primary transition-colors" />
        </div>
        <p className="text-sm font-medium mb-1">Drop video files here</p>
        <p className="text-xs text-muted-foreground">MP4, MOV, MXF · or ask the AI to generate from scratch</p>
      </div>
    </div>
  );
}
