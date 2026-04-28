import { useState, useEffect, type ChangeEvent } from 'react';
import type {
  MediaGenRequest,
  MediaGenResponse,
} from '@pipefx/media-gen/contracts';
import { generateMedia } from '../../lib/api';
import { writeFile } from '@tauri-apps/plugin-fs';
import { cn } from '../../lib/utils';
import { Textarea } from '../../components/ui/textarea';
import {
  Sparkles,
  ChevronRight,
  Monitor,
  Diamond,
  Minus,
  Plus,
  Pencil,
  Loader2,
  Upload,
  X,
} from 'lucide-react';

type ModelId = 'seeddream45' | 'gemini2' | 'gpt-image-2';
type AspectRatio = '16:9' | '9:16' | '1:1' | '4:3';
type Quality = 'auto' | 'low' | 'medium' | 'high';

const MODEL_META: Record<
  ModelId,
  { letter: string; name: string; subtitle: string; chipText: string; chipBg: string }
> = {
  seeddream45: {
    letter: 'S',
    name: 'SeedDream 5',
    subtitle: 'ByteDance Vision',
    chipText: 'text-rose-500',
    chipBg: 'bg-rose-500/10',
  },
  gemini2: {
    letter: 'N',
    name: 'Nano Banana',
    subtitle: 'Fast AI model',
    chipText: 'text-[#FFD700]',
    chipBg: 'bg-[#FFD700]/10',
  },
  'gpt-image-2': {
    letter: 'G',
    name: 'GPT Image 2',
    subtitle: 'OpenAI image model',
    chipText: 'text-emerald-400',
    chipBg: 'bg-emerald-500/10',
  },
};

const MODEL_IDS: ModelId[] = ['seeddream45', 'gemini2', 'gpt-image-2'];
const ASPECT_RATIOS: AspectRatio[] = ['16:9', '9:16', '1:1', '4:3'];
const QUALITIES: Quality[] = ['auto', 'low', 'medium', 'high'];

export function ImageGenDashboard({
  active = true,
  projectFolder,
}: {
  active?: boolean;
  projectFolder?: string;
}) {
  const [prompt, setPrompt] = useState(
    'remove him from the shot and his towel'
  );
  const [selectedModel, setSelectedModel] = useState<ModelId>('seeddream45');
  const [showModelMenu, setShowModelMenu] = useState(false);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('16:9');
  const [showAspectMenu, setShowAspectMenu] = useState(false);
  const [quality, setQuality] = useState<Quality>('auto');
  const [showQualityMenu, setShowQualityMenu] = useState(false);
  const [generations, setGenerations] = useState<
    Array<{
      id: string;
      status: 'pending' | 'success' | 'error';
      url?: string;
      aspectRatio: AspectRatio;
      error?: string;
    }>
  >([]);
  const [imageRef, setImageRef] = useState<string | null>(
    'https://picsum.photos/400/300'
  ); // Mock initial image
  const [batchSize, setBatchSize] = useState(1);
  const BATCH_MAX = 4;
  const [isDragging, setIsDragging] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    // Only listen for drops while this view is the active tab — otherwise
    // dragging into a different panel would still toggle the image-gen
    // overlay (the component is kept mounted across tab switches so its
    // state + in-flight requests survive).
    if (!active) return;

    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
      setIsDragging(true);
    };

    const handleDragLeave = (e: DragEvent) => {
      e.preventDefault();
      // Only clear when the drag actually leaves the window — `relatedTarget`
      // is null (or outside <html>) when the cursor exits the viewport.
      const related = e.relatedTarget as Node | null;
      if (!related || !document.documentElement.contains(related)) {
        setIsDragging(false);
      }
    };

    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer?.files?.[0];
      if (file && file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (event) => {
          setImageRef(event.target?.result as string);
        };
        reader.readAsDataURL(file);
      }
    };

    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('dragleave', handleDragLeave);
    window.addEventListener('drop', handleDrop);

    return () => {
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('dragleave', handleDragLeave);
      window.removeEventListener('drop', handleDrop);
    };
  }, [active]);

  const runOne = async (jobAspect: AspectRatio) => {
    const jobId = crypto.randomUUID();
    setGenerations((prev) => [
      { id: jobId, status: 'pending', aspectRatio: jobAspect },
      ...prev,
    ]);

    try {
      const body: MediaGenRequest = {
        model: selectedModel,
        prompt,
        imageRef: imageRef ?? undefined,
        aspectRatio: jobAspect,
        ...(selectedModel === 'gpt-image-2' ? { quality } : {}),
      };
      const data = await generateMedia<MediaGenRequest, MediaGenResponse>(body);
      const finalUrl = data.url;
      if (!finalUrl) throw new Error('No URL returned from the server.');

      await new Promise<void>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve();
        img.onerror = () =>
          reject(new Error('Image generated but failed to load in the browser.'));
        img.src = finalUrl;
      });

      setGenerations((prev) =>
        prev.map((g) =>
          g.id === jobId ? { ...g, status: 'success', url: finalUrl } : g
        )
      );

      if (projectFolder) {
        try {
          const sep = projectFolder.includes('\\') ? '\\' : '/';
          const resp = await fetch(finalUrl);
          const buf = new Uint8Array(await resp.arrayBuffer());
          const ts = new Date().toISOString().replace(/[:.]/g, '-');
          const ext = (() => {
            const u = finalUrl.split('?')[0];
            const m = u.match(/\.(png|jpe?g|webp|gif)$/i);
            return m ? m[1].toLowerCase() : 'png';
          })();
          const filePath = `${projectFolder}${sep}images${sep}img_${ts}_${jobId.slice(0, 6)}.${ext}`;
          await writeFile(filePath, buf);
        } catch (saveErr) {
          console.error('Auto-save image failed:', saveErr);
        }
      }
    } catch (err: unknown) {
      console.error(err);
      const msg = err instanceof Error ? err.message : 'Unknown generation error';
      setErrorMsg(msg);
      setGenerations((prev) =>
        prev.map((g) =>
          g.id === jobId ? { ...g, status: 'error', error: msg } : g
        )
      );
    }
  };

  const handleGenerate = () => {
    if (!prompt.trim()) return;
    setErrorMsg(null);
    const jobAspect = aspectRatio;
    for (let i = 0; i < batchSize; i++) {
      void runOne(jobAspect);
    }
  };

  const pendingCount = generations.filter((g) => g.status === 'pending').length;
  const hasAnyJobs = generations.length > 0;
  const MAX_CONCURRENT = 8;

  const aspectClass = (ar: AspectRatio): string => {
    switch (ar) {
      case '16:9':
        return 'aspect-video';
      case '9:16':
        return 'aspect-[9/16]';
      case '1:1':
        return 'aspect-square';
      case '4:3':
        return 'aspect-[4/3]';
    }
  };

  const handleFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => setImageRef(e.target?.result as string);
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="flex flex-col h-full bg-background relative overflow-hidden select-none w-full border-l">
      {/* Visual Drop Indicator */}
      {isDragging && (
        <div className="absolute inset-0 bg-primary/10 border-4 border-dashed border-primary z-50 flex items-center justify-center pointer-events-none rounded-xl m-2">
          <div className="bg-background/80 backdrop-blur-sm px-6 py-4 rounded-2xl shadow-xl flex items-center gap-3">
            <Upload className="w-6 h-6 text-primary" />
            <span className="text-xl font-bold text-foreground">
              Drop image as reference
            </span>
          </div>
        </div>
      )}

      {/* Canvas — in-place slot grid (Higgsfield-style). Pending jobs occupy
          slots with the same aspect ratio as the final image, so the
          rendered image appears in place. */}
      <div className="absolute inset-0 overflow-y-auto scrollbar-none z-0 bg-muted/30">
        {hasAnyJobs ? (
          <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2 p-3 pb-[260px] w-full">
            {generations.map((g) => (
              <div
                key={g.id}
                className={cn(
                  'relative w-full overflow-hidden rounded-md border border-border/40 bg-muted/40',
                  aspectClass(g.aspectRatio)
                )}
              >
                {g.status === 'pending' && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                    <div className="absolute inset-0 bg-gradient-to-br from-muted/60 via-muted/30 to-muted/60 animate-pulse" />
                    <div className="relative flex items-center gap-1.5 text-[11px] font-medium text-foreground/80 z-10">
                      <Sparkles className="h-3 w-3 text-primary animate-pulse" />
                      Generating
                    </div>
                  </div>
                )}
                {g.status === 'success' && g.url && (
                  <img
                    src={g.url}
                    alt="Generated output"
                    onClick={() => g.url && setSelectedImage(g.url)}
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                    className="w-full h-full object-cover cursor-zoom-in hover:scale-[1.02] transition-transform duration-300"
                  />
                )}
                {g.status === 'error' && (
                  <div className="absolute inset-0 flex items-center justify-center p-2 text-center">
                    <p className="text-[10px] text-destructive">{g.error || 'Failed'}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full w-full pointer-events-none opacity-20">
            <h1 className="text-6xl md:text-[150px] font-black tracking-tighter uppercase blur-[1px] text-muted-foreground/30">
              IMAGE GEN
            </h1>
            <p className="text-xl font-bold tracking-widest text-muted-foreground/50 mt-4">
              STUDIO
            </p>
          </div>
        )}

        {/* Vignette over bottom area so the floating prompt panel stays readable */}
        {hasAnyJobs && (
          <div className="fixed inset-x-0 bottom-0 h-[240px] bg-gradient-to-t from-background via-background/80 to-transparent z-10 pointer-events-none" />
        )}
      </div>

      {/* Floating Control Panel */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-full max-w-[860px] px-4 pointer-events-none z-20">
        {/* Error Notification Toast */}
        {errorMsg && (
          <div className="absolute -top-16 left-1/2 -translate-x-1/2 w-full max-w-sm pointer-events-auto">
            <div className="bg-destructive text-destructive-foreground shadow-2xl px-4 py-3 rounded-2xl flex items-start gap-3 border border-destructive/80 animate-in slide-in-from-bottom-5">
              <div className="mt-0.5">
                <X className="w-4 h-4" />
              </div>
              <p className="flex-1 text-sm font-medium leading-snug">
                {errorMsg}
              </p>
              <button
                onClick={() => setErrorMsg(null)}
                className="shrink-0 p-1 hover:bg-black/20 rounded-full transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        <div className="bg-card/95 backdrop-blur-xl rounded-[24px] shadow-2xl border border-border/80 pointer-events-auto flex text-foreground transition-all hover:border-border hover:shadow-[0_20px_60px_-15px_rgba(0,0,0,0.3)]">
          <div className="p-4 pl-5 pr-4 flex max-md:flex-col gap-4 w-full">
            {/* Left Content Column */}
            <div className="flex-1 flex flex-col gap-3 justify-center min-w-0">
              {/* Row 1: Image thumbnails and Prompt */}
              <div className="flex items-center gap-4 border-b border-border/50 pb-3">
                {/* Image Reference Thumbs */}
                <div className="flex items-center gap-2 shrink-0">
                  {imageRef && (
                    <div className="relative h-11 w-11 rounded-xl overflow-hidden group border border-border/50 bg-muted shrink-0 shadow-sm">
                      <img
                        src={imageRef}
                        alt="Source"
                        className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
                      />
                      <div
                        className="absolute inset-0 bg-background/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity cursor-pointer text-foreground hover:text-destructive"
                        onClick={() => setImageRef(null)}
                        title="Remove reference"
                      >
                        <X className="w-4 h-4" />
                      </div>
                    </div>
                  )}

                  <label
                    className="h-11 w-11 rounded-xl bg-secondary/50 border border-border/50 flex items-center justify-center cursor-pointer hover:bg-secondary transition-colors shrink-0 text-muted-foreground hover:text-foreground shadow-sm"
                    title="Upload reference image"
                  >
                    <Upload className="w-4 h-4" />
                    <input
                      type="file"
                      className="hidden"
                      accept="image/*"
                      onChange={handleFileUpload}
                    />
                  </label>
                </div>

                {/* Textarea */}
                <Textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Describe what you want to generate..."
                  className="bg-transparent border-none text-foreground placeholder:text-muted-foreground/60 text-[15px] resize-none focus-visible:ring-0 p-0 h-[44px] min-h-[44px] py-2.5 leading-relaxed shadow-none rounded-none w-full scrollbar-none outline-none focus:outline-none focus:ring-0"
                />
              </div>

              {/* Row 2: Settings Pills */}
              <div className="flex items-center flex-wrap gap-2 text-[12px] font-medium text-muted-foreground w-full pt-0.5">
                <div className="relative">
                  <button
                    onClick={() => {
                      setShowModelMenu(!showModelMenu);
                      setShowAspectMenu(false);
                      setShowQualityMenu(false);
                    }}
                    className="flex items-center gap-1.5 h-8 px-3 rounded-full bg-secondary hover:bg-secondary/80 hover:text-foreground transition-colors border border-border/40 shadow-sm"
                  >
                    <span
                      className={`${MODEL_META[selectedModel].chipText} ${MODEL_META[selectedModel].chipBg} font-black text-[10px] w-4 h-4 rounded flex items-center justify-center`}
                    >
                      {MODEL_META[selectedModel].letter}
                    </span>
                    <span>{MODEL_META[selectedModel].name}</span>
                    <ChevronRight
                      className={`w-3 h-3 opacity-50 ml-1 transition-transform duration-200 ${
                        showModelMenu ? '-rotate-90' : ''
                      }`}
                    />
                  </button>

                  {showModelMenu && (
                    <div className="absolute bottom-full left-0 mb-2 w-[200px] bg-card border border-border rounded-xl shadow-xl overflow-hidden z-50 flex flex-col py-1 pointer-events-auto">
                      {MODEL_IDS.map((id, idx) => {
                        const meta = MODEL_META[id];
                        return (
                          <button
                            key={id}
                            onClick={() => {
                              setSelectedModel(id);
                              setShowModelMenu(false);
                            }}
                            className={`flex items-center gap-3 px-3 py-2 text-sm hover:bg-muted transition-colors text-left ${
                              selectedModel === id ? 'bg-muted/50' : ''
                            } ${idx > 0 ? 'border-t border-border/50' : ''}`}
                          >
                            <span
                              className={`${meta.chipText} ${meta.chipBg} font-black text-[10px] w-5 h-5 shrink-0 rounded flex items-center justify-center`}
                            >
                              {meta.letter}
                            </span>
                            <div className="flex flex-col leading-snug">
                              <span className="font-medium text-foreground">
                                {meta.name}
                              </span>
                              <span className="text-[10px] text-muted-foreground font-normal">
                                {meta.subtitle}
                              </span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="w-px h-4 bg-border mx-1"></div>

                {/* Aspect ratio dropdown */}
                <div className="relative shrink-0">
                  <button
                    onClick={() => {
                      setShowAspectMenu(!showAspectMenu);
                      setShowModelMenu(false);
                      setShowQualityMenu(false);
                    }}
                    className="flex items-center gap-1.5 h-8 px-3 rounded-full bg-secondary/50 hover:bg-secondary hover:text-foreground transition-colors border border-border/40 shadow-sm"
                  >
                    <Monitor className="w-3.5 h-3.5 opacity-70" />
                    <span className="max-sm:hidden">{aspectRatio}</span>
                  </button>
                  {showAspectMenu && (
                    <div className="absolute bottom-full left-0 mb-2 w-[120px] bg-card border border-border rounded-xl shadow-xl overflow-hidden z-50 flex flex-col py-1 pointer-events-auto">
                      {ASPECT_RATIOS.map((ratio) => (
                        <button
                          key={ratio}
                          onClick={() => {
                            setAspectRatio(ratio);
                            setShowAspectMenu(false);
                          }}
                          className={`px-3 py-1.5 text-left text-sm hover:bg-muted transition-colors ${
                            aspectRatio === ratio
                              ? 'bg-muted/50 text-foreground'
                              : ''
                          }`}
                        >
                          {ratio}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Quality (GPT Image 2 only) — non-GPT shows static 2K pill */}
                {selectedModel === 'gpt-image-2' ? (
                  <div className="relative shrink-0">
                    <button
                      onClick={() => {
                        setShowQualityMenu(!showQualityMenu);
                        setShowModelMenu(false);
                        setShowAspectMenu(false);
                      }}
                      className="flex items-center gap-1.5 h-8 px-3 rounded-full bg-secondary/50 hover:bg-secondary hover:text-foreground transition-colors border border-border/40 shadow-sm"
                    >
                      <Diamond className="w-3.5 h-3.5 opacity-70" />
                      <span className="max-sm:hidden capitalize">{quality}</span>
                    </button>
                    {showQualityMenu && (
                      <div className="absolute bottom-full left-0 mb-2 w-[120px] bg-card border border-border rounded-xl shadow-xl overflow-hidden z-50 flex flex-col py-1 pointer-events-auto">
                        {QUALITIES.map((q) => (
                          <button
                            key={q}
                            onClick={() => {
                              setQuality(q);
                              setShowQualityMenu(false);
                            }}
                            className={`px-3 py-1.5 text-left text-sm capitalize hover:bg-muted transition-colors ${
                              quality === q
                                ? 'bg-muted/50 text-foreground'
                                : ''
                            }`}
                          >
                            {q}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <button className="flex items-center gap-1.5 h-8 px-3 rounded-full bg-secondary/50 hover:bg-secondary hover:text-foreground transition-colors border border-border/40 shadow-sm shrink-0">
                    <Diamond className="w-3.5 h-3.5 opacity-70" />
                    <span className="max-sm:hidden">2K</span>
                  </button>
                )}

                <div
                  title={`Generate ${batchSize} image${batchSize > 1 ? 's' : ''} per click`}
                  className="flex items-center h-8 bg-secondary/50 rounded-full overflow-hidden mx-1 border border-border/40 shadow-sm shrink-0"
                >
                  <button
                    onClick={() => setBatchSize((n) => Math.max(1, n - 1))}
                    disabled={batchSize <= 1}
                    className="h-full px-2 hover:bg-secondary hover:text-foreground flex items-center transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Minus className="w-3 h-3 opacity-70" />
                  </button>
                  <span className="px-1 text-center text-[11px] min-w-[32px] tabular-nums">
                    {batchSize}/{BATCH_MAX}
                  </span>
                  <button
                    onClick={() => setBatchSize((n) => Math.min(BATCH_MAX, n + 1))}
                    disabled={batchSize >= BATCH_MAX}
                    className="h-full px-2 hover:bg-secondary hover:text-foreground flex items-center transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Plus className="w-3 h-3 opacity-70" />
                  </button>
                </div>

                <button className="flex items-center gap-1.5 h-8 px-3 rounded-full bg-secondary/50 hover:bg-secondary hover:text-foreground transition-colors ml-auto border border-border/40 shadow-sm shrink-0">
                  <Pencil className="w-3 h-3 opacity-70" />
                  <span className="max-sm:hidden">Draw</span>
                </button>
              </div>
            </div>

            {/* Right Generate Button Column */}
            <div className="flex-shrink-0 flex items-stretch max-md:h-12 max-md:w-full">
              <button
                onClick={handleGenerate}
                disabled={!prompt.trim() || pendingCount >= MAX_CONCURRENT}
                className="h-full md:w-[120px] max-md:flex-1 rounded-[16px] bg-primary hover:bg-primary/90 active:scale-[0.98] text-primary-foreground font-semibold text-sm shadow-md transition-all flex md:flex-col items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed border border-primary/20 relative"
              >
                <span className="font-bold text-[15px] tracking-tight">
                  Generate
                </span>
                <div className="flex items-center gap-1 text-[11px] font-black opacity-90">
                  {pendingCount > 0 ? (
                    <>
                      <Loader2 className="w-3 h-3 animate-spin" />
                      {pendingCount}
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3 h-3 fill-primary-foreground" />2
                    </>
                  )}
                </div>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Lightbox / Fullscreen Image Viewer */}
      {selectedImage && (
        <div
          className="fixed inset-0 z-[100] bg-background/95 backdrop-blur-md flex items-center justify-center p-4 sm:p-8 animate-in fade-in duration-200"
          onClick={() => setSelectedImage(null)}
        >
          <button
            className="absolute top-6 right-6 p-2 bg-muted/50 hover:bg-muted text-foreground rounded-full transition-colors cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              setSelectedImage(null);
            }}
          >
            <X className="w-6 h-6" />
          </button>
          <img
            src={selectedImage}
            alt="Enlarged render"
            className="max-w-full max-h-full object-contain shadow-2xl rounded-sm cursor-zoom-out"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
