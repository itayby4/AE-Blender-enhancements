import { useState, useEffect, type ChangeEvent } from 'react';
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
  X 
} from 'lucide-react';

export function ImageGenDashboard() {
  const [prompt, setPrompt] = useState('remove him from the shot and his towel');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedImages, setGeneratedImages] = useState<string[]>([]);
  const [imageRef, setImageRef] = useState<string | null>('https://picsum.photos/400/300'); // Mock initial image
  const [extraFreeGens, setExtraFreeGens] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  useEffect(() => {
    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
      setIsDragging(true);
    };

    const handleDragLeave = (e: DragEvent) => {
      e.preventDefault();
      if (e.clientX === 0 && e.clientY === 0) {
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
  }, []);

  const handleGenerate = async () => {
    if (!prompt.trim() || isGenerating) return;
    setIsGenerating(true);
    setErrorMsg(null);
    
    try {
      // Route the generation request back through your backend Gemini provider
      const response = await fetch('http://localhost:3001/api/video-gen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gemini2',
          prompt,
          imageRef,
        })
      });
      
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'API request failed with status ' + response.status);
      
      const finalUrl = data.url;
      if (!finalUrl) {
        throw new Error('No URL returned from the server.');
      }

      // Wait for the image to actually generate and download before removing the spinner
      await new Promise<void>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('Image generated but failed to load in the browser.'));
        img.src = finalUrl;
      });
        
      setGeneratedImages(prev => [finalUrl, ...prev]);
    } catch (err: unknown) {
      console.error(err);
      setErrorMsg(err instanceof Error ? err.message : 'Unknown generation error');
    } finally {
      setIsGenerating(false);
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
            <span className="text-xl font-bold text-foreground">Drop image as reference</span>
          </div>
        </div>
      )}

      {/* Background Canvas */}
      <div className="absolute inset-0 flex flex-col items-center justify-center transition-all overflow-hidden z-0 bg-muted/50">
        {generatedImages.length > 0 ? (
          <div className="absolute inset-0 overflow-y-auto scrollbar-none z-0">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-[2px] pb-48 w-full">
              {generatedImages.map((src, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img 
                  key={`${i}-${window.btoa(src.slice(0, 10))}`}
                  src={src} 
                  alt={`Generated output ${i}`} 
                  onClick={() => setSelectedImage(src)}
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    target.style.display = 'none'; // hide broken images completely
                  }}
                  className="w-full aspect-video object-cover transition-opacity duration-700 opacity-90 hover:opacity-100 cursor-zoom-in bg-muted/20 hover:scale-[1.02] border border-border/20 rounded-sm" 
                />
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full w-full pointer-events-none mb-32 opacity-20 relative z-0">
            <h1 className="text-6xl md:text-[150px] font-black tracking-tighter uppercase blur-[1px] text-muted-foreground/30">IMAGE GEN</h1>
            <p className="text-xl font-bold tracking-widest text-muted-foreground/50 mt-4">STUDIO</p>
          </div>
        )}

        {/* Optional vignette gradient over the background image to make the UI popup readable */}
        {generatedImages.length > 0 && (
          <div className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-background via-background/70 to-transparent z-10 pointer-events-none flex-shrink-0"></div>
        )}

        {isGenerating && (
          <div className="absolute inset-0 bg-background/60 backdrop-blur-sm flex flex-col items-center justify-center z-10 transition-all duration-300">
             <div className="relative">
                <div className="h-24 w-24 border-[3px] border-muted rounded-full"></div>
                <div className="h-24 w-24 border-[3px] border-primary rounded-full border-t-transparent animate-spin absolute inset-0"></div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <Sparkles className="h-8 w-8 text-primary animate-pulse" />
                </div>
              </div>
              <h3 className="mt-8 font-semibold text-foreground tracking-wide uppercase text-sm animate-pulse">Rendering pixels...</h3>
          </div>
        )}

      </div>

      {/* Floating Control Panel */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-full max-w-[860px] px-4 pointer-events-none z-20">
        
        {/* Error Notification Toast */}
        {errorMsg && (
          <div className="absolute -top-16 left-1/2 -translate-x-1/2 w-full max-w-sm pointer-events-auto">
            <div className="bg-destructive text-destructive-foreground shadow-2xl px-4 py-3 rounded-2xl flex items-start gap-3 border border-destructive/80 animate-in slide-in-from-bottom-5">
              <div className="mt-0.5"><X className="w-4 h-4" /></div>
              <p className="flex-1 text-sm font-medium leading-snug">{errorMsg}</p>
              <button onClick={() => setErrorMsg(null)} className="shrink-0 p-1 hover:bg-black/20 rounded-full transition-colors"><X className="w-3.5 h-3.5" /></button>
            </div>
          </div>
        )}

        <div className="bg-card/95 backdrop-blur-xl rounded-[24px] shadow-2xl border border-border/80 pointer-events-auto flex text-foreground transition-all hover:border-border hover:shadow-[0_20px_60px_-15px_rgba(0,0,0,0.3)]">
          <div className="p-4 pl-5 pr-4 flex gap-4 w-full">
            
            {/* Left Content Column */}
            <div className="flex-1 flex flex-col gap-3 justify-center min-w-0">
              
              {/* Row 1: Image thumbnails and Prompt */}
              <div className="flex items-center gap-4 border-b border-border/50 pb-3">
                
                {/* Image Reference Thumbs */}
                <div className="flex items-center gap-2 shrink-0">
                  {imageRef && (
                    <div className="relative h-11 w-11 rounded-xl overflow-hidden group border border-border/50 bg-muted shrink-0 shadow-sm">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={imageRef} alt="Source" className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
                      <div className="absolute inset-0 bg-background/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity cursor-pointer text-foreground hover:text-destructive" onClick={() => setImageRef(null)} title="Remove reference">
                        <X className="w-4 h-4" />
                      </div>
                    </div>
                  )}
                  
                  <label 
                    className="h-11 w-11 rounded-xl bg-secondary/50 border border-border/50 flex items-center justify-center cursor-pointer hover:bg-secondary transition-colors shrink-0 text-muted-foreground hover:text-foreground shadow-sm"
                    title="Upload reference image"
                  >
                    <Upload className="w-4 h-4" />
                    <input type="file" className="hidden" accept="image/*" onChange={handleFileUpload} />
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
                
                <button className="flex items-center gap-1.5 h-8 px-3 rounded-full bg-secondary hover:bg-secondary/80 hover:text-foreground transition-colors border border-border/40 shadow-sm">
                  <span className="text-primary font-black text-[10px] w-4 h-4 rounded bg-primary/10 flex items-center justify-center">G</span>
                  <span>Gemini 3 Pro</span>
                  <ChevronRight className="w-3 h-3 opacity-50 ml-1" />
                </button>

                <div className="w-px h-4 bg-border mx-1"></div>

                <button className="flex items-center gap-1.5 h-8 px-3 rounded-full bg-secondary/50 hover:bg-secondary hover:text-foreground transition-colors border border-border/40 shadow-sm">
                  <Monitor className="w-3.5 h-3.5 opacity-70" />
                  <span>16:9</span>
                </button>

                <button className="flex items-center gap-1.5 h-8 px-3 rounded-full bg-secondary/50 hover:bg-secondary hover:text-foreground transition-colors border border-border/40 shadow-sm">
                  <Diamond className="w-3.5 h-3.5 opacity-70" />
                  <span>2K</span>
                </button>

                <div className="flex items-center h-8 bg-secondary/50 rounded-full overflow-hidden mx-1 border border-border/40 shadow-sm">
                  <button className="h-full px-2 hover:bg-secondary hover:text-foreground flex items-center transition-colors"><Minus className="w-3 h-3 opacity-70" /></button>
                  <span className="px-1 text-center text-[11px] min-w-[32px]">1/4</span>
                  <button className="h-full px-2 hover:bg-secondary hover:text-foreground flex items-center transition-colors"><Plus className="w-3 h-3 opacity-70" /></button>
                </div>

                {/* Toggle switch for extra gens */}
                <button 
                  onClick={() => setExtraFreeGens(!extraFreeGens)}
                  className="flex items-center gap-1.5 h-8 px-3 rounded-full bg-secondary/50 hover:bg-secondary hover:text-foreground transition-colors ml-auto group border border-border/40 shadow-sm"
                >
                  <span className="opacity-90">Extra free gens</span>
                  <div className={`w-7 h-4 rounded-full p-[2px] transition-colors duration-200 ${extraFreeGens ? 'bg-primary' : 'bg-muted-foreground/30'}`}>
                    <div className={`w-[12px] h-[12px] rounded-full bg-background shadow-sm transition-transform duration-200 ${extraFreeGens ? 'translate-x-[12px]' : 'translate-x-0'}`} />
                  </div>
                </button>

                <button className="flex items-center gap-1.5 h-8 px-3 rounded-full bg-secondary/50 hover:bg-secondary hover:text-foreground transition-colors border border-border/40 shadow-sm">
                  <Pencil className="w-3 h-3 opacity-70" />
                  <span>Draw</span>
                </button>

              </div>
            </div>

            {/* Right Generate Button Column */}
            <div className="flex-shrink-0 flex items-stretch ml-2">
              <button 
                onClick={handleGenerate}
                disabled={isGenerating || !prompt.trim()}
                className="h-full w-[120px] rounded-[16px] bg-primary hover:bg-primary/90 active:scale-[0.98] text-primary-foreground font-semibold text-sm shadow-md transition-all flex items-center justify-center gap-1.5 flex-col disabled:opacity-50 disabled:cursor-not-allowed border border-primary/20"
              >
                {isGenerating ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    <span className="font-bold text-[15px] tracking-tight">Generate</span>
                    <div className="flex items-center gap-1 text-[11px] font-black opacity-90">
                      <Sparkles className="w-3 h-3 fill-primary-foreground" />
                      2
                    </div>
                  </>
                )}
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
            onClick={(e) => { e.stopPropagation(); setSelectedImage(null); }}
          >
            <X className="w-6 h-6" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
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
