import { useState } from 'react';
import {
  Play,
  Sparkles,
  Wand2,
  Baseline,
  Palette,
  Settings2,
  Loader2,
  CheckCircle2,
} from 'lucide-react';
import { Card, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Switch } from '../../components/ui/switch';
import { Label } from '../../components/ui/label';
import { Slider } from '../../components/ui/slider';
import { Badge } from '../../components/ui/badge';
import { ScrollArea } from '../../components/ui/scroll-area';

export function AnimatedSubtitlesUI() {
  const [activeTemplate, setActiveTemplate] = useState('dynamic-pop');
  const [activePalette, setActivePalette] = useState('cyberpunk');
  const [randomizeColors, setRandomizeColors] = useState(false);
  const [maxWords, setMaxWords] = useState([3]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isDone, setIsDone] = useState(false);

  const templates = [
    {
      id: 'dynamic-pop',
      name: 'Dynamic Pop',
      description: 'Energetic word-by-word pop in',
      icon: Wand2,
    },
    {
      id: 'karaoke',
      name: 'Karaoke Tracking',
      description: 'Smooth highlight tracking audio',
      icon: Play,
    },
    {
      id: 'cinematic',
      name: 'Cinematic Fade',
      description: 'Elegant fades for dramatic scenes',
      icon: Sparkles,
    },
  ];

  const palettes = [
    {
      id: 'cyberpunk',
      name: 'Cyberpunk',
      colors: ['#f87171', '#34d399', '#60a5fa', '#c084fc'],
    },
    {
      id: 'sunset',
      name: 'Sunset Vibe',
      colors: ['#fbbf24', '#f97316', '#ef4444', '#db2777'],
    },
    {
      id: 'monochrome',
      name: 'Studio Minimal',
      colors: ['#ffffff', '#d4d4d8', '#71717a', '#27272a'],
    },
  ];

  const handleGenerate = () => {
    setIsGenerating(true);
    setIsDone(false);
    setTimeout(() => {
      setIsGenerating(false);
      setIsDone(true);
      setTimeout(() => setIsDone(false), 3000);
    }, 3000);
  };

  return (
    <ScrollArea className="flex-1 p-8 relative h-full">
      <div className="max-w-4xl mx-auto space-y-10 pb-20">
        {/* Header Segment */}
        <div className="flex items-center gap-5 border-b border-white/5 pb-8">
          <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-purple-500/10 border border-indigo-500/20 flex items-center justify-center shadow-[inset_0_1px_4px_rgba(255,255,255,0.1)] backdrop-blur-md">
            <Baseline className="h-8 w-8 text-indigo-400" />
          </div>
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-white to-white/70">
              Animated Subtitles
            </h1>
            <p className="text-sm text-muted-foreground mt-1.5 font-medium">
              Transform your timeline with dynamic, rich-colored Fusion text
              macros.
            </p>
          </div>
        </div>

        {/* Templates */}
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <Wand2 className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Animation Style
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {templates.map((tpl) => {
              const Icon = tpl.icon;
              const isActive = activeTemplate === tpl.id;
              return (
                <Card
                  key={tpl.id}
                  onClick={() => setActiveTemplate(tpl.id)}
                  className={`cursor-pointer transition-all duration-300 overflow-hidden relative group backdrop-blur-sm bg-card/60 ${
                    isActive
                      ? 'border-indigo-500 ring-1 ring-indigo-500/50 shadow-[0_4px_24px_-4px_rgba(99,102,241,0.2)]'
                      : 'border-border/40 hover:border-indigo-500/30 hover:bg-card/80'
                  }`}
                >
                  {isActive && (
                    <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/10 to-transparent"></div>
                  )}
                  <CardContent className="p-6 relative z-10 flex flex-col items-center text-center gap-3">
                    <div
                      className={`p-3 rounded-xl transition-colors duration-300 ${
                        isActive
                          ? 'bg-indigo-500/20 text-indigo-400'
                          : 'bg-muted text-muted-foreground group-hover:text-indigo-400 group-hover:bg-indigo-500/10'
                      }`}
                    >
                      <Icon className="h-6 w-6" />
                    </div>
                    <div>
                      <h3
                        className={`font-semibold ${
                          isActive ? 'text-foreground' : 'text-foreground/80'
                        }`}
                      >
                        {tpl.name}
                      </h3>
                      <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
                        {tpl.description}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>

        {/* Palettes */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Palette className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Color Theme
              </h2>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="randomize"
                checked={randomizeColors}
                onCheckedChange={setRandomizeColors}
              />
              <Label
                htmlFor="randomize"
                className="text-xs cursor-pointer text-muted-foreground"
              >
                Randomize per word
              </Label>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {palettes.map((palette) => {
              const isActive = activePalette === palette.id;
              return (
                <div
                  key={palette.id}
                  onClick={() => setActivePalette(palette.id)}
                  className={`p-4 rounded-xl border cursor-pointer transition-all duration-300 bg-card/40 backdrop-blur-sm ${
                    isActive
                      ? 'border-primary ring-1 ring-primary/30 shadow-md'
                      : 'border-border/40 hover:border-primary/30'
                  }`}
                >
                  <div className="text-sm font-medium mb-3">{palette.name}</div>
                  <div className="flex gap-2 h-8 w-full border border-black/20 rounded-lg overflow-hidden shadow-[inset_0_1px_3px_rgba(0,0,0,0.3)]">
                    {palette.colors.map((color, i) => (
                      <div
                        key={i}
                        className="flex-1 h-full"
                        style={{ backgroundColor: color }}
                      ></div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Configuration */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 mb-6">
            <Settings2 className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Layout Settings
            </h2>
          </div>

          <div className="bg-card/40 backdrop-blur-sm border border-border/40 rounded-xl p-6">
            <div className="flex flex-col gap-6">
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <Label className="text-sm font-medium">
                    Maximum words per line
                  </Label>
                  <Badge variant="secondary" className="font-mono">
                    {maxWords[0]}
                  </Badge>
                </div>
                <Slider
                  value={maxWords}
                  onValueChange={setMaxWords}
                  max={8}
                  min={1}
                  step={1}
                  className="py-2"
                />
                <p className="text-xs text-muted-foreground">
                  Fewer words create punchier animations. Recommended: 2-3.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Action Area */}
        <div className="pt-6">
          <Button
            onClick={handleGenerate}
            disabled={isGenerating || isDone}
            className={`w-full h-14 text-base font-bold tracking-wide transition-all duration-500 overflow-hidden relative shadow-[0_0_40px_-10px_rgba(99,102,241,0.5)] ${
              isDone
                ? 'bg-green-500 hover:bg-green-600 text-white'
                : 'bg-indigo-600 hover:bg-indigo-500 hover:scale-[1.01]'
            }`}
          >
            {/* Glow effect */}
            {!isGenerating && !isDone && (
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full hover:animate-[shimmer_1.5s_infinite]" />
            )}

            <div className="relative z-10 flex items-center justify-center gap-3">
              {isGenerating ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Generating Pipeline...
                </>
              ) : isDone ? (
                <>
                  <CheckCircle2 className="h-5 w-5" />
                  Subtitles Injected!
                </>
              ) : (
                <>
                  <Sparkles className="h-5 w-5" />
                  Generate Animated Subtitles
                </>
              )}
            </div>
          </Button>
        </div>
      </div>
    </ScrollArea>
  );
}
