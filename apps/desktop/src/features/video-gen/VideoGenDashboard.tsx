import { useState, type ChangeEvent } from 'react';
import { Sparkles, ImageIcon, Clock, Monitor, Diamond, Video, X } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Card, CardContent } from '../../components/ui/card';
import { Textarea } from '../../components/ui/textarea';
import { Label } from '../../components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '../../components/ui/popover';
import { Input } from '../../components/ui/input';

const MODELS = [
  { id: 'kling3', name: 'Kling 3.0', description: 'High-fidelity realistic generation' },
  { id: 'seeddance2', name: 'SeedDance 2.0', description: 'Creative and dynamic motion' }
];

type VideoGeneration = {
  id: string;
  url?: string;
  status: 'pending' | 'success' | 'error';
  error?: string;
  type?: string;
  model: string;
  prompt: string;
  createdAt: number;
};

export function VideoGenDashboard() {
  const [selectedModel, setSelectedModel] = useState(MODELS[0].id);
  const [prompt, setPrompt] = useState('');
  const [duration, setDuration] = useState('5');
  const [resolution, setResolution] = useState('720p');
  const [aspectRatio, setAspectRatio] = useState('16:9');
  const [imageRef, setImageRef] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [batchSize, setBatchSize] = useState<number>(1);
  const [generations, setGenerations] = useState<VideoGeneration[]>([]);
  const [expandedVideo, setExpandedVideo] = useState<VideoGeneration | null>(null);

  const pendingCount = generations.filter(g => g.status === 'pending').length;

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setImageRef(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleImageClick = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (e) => setImageRef(e.target?.result as string);
        reader.readAsDataURL(file);
      }
    };
    input.click();
  };

  const handleGenerate = async () => {
    if (!prompt.trim() || pendingCount >= 8) return; // Prevent spamming more than 8 at a time

    // Prepend new pending tasks
    const newTasks: VideoGeneration[] = Array.from({ length: batchSize }).map(() => ({
      id: crypto.randomUUID(),
      status: 'pending',
      model: selectedModel,
      prompt,
      createdAt: Date.now()
    }));

    setGenerations(prev => [...newTasks, ...prev]);

    // Fire off parallel requests
    newTasks.forEach(async (task) => {
      try {
        const response = await fetch('http://localhost:3001/api/ai-models', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: selectedModel,
            prompt,
            duration,
            resolution,
            aspectRatio,
            imageRef,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => null);
          throw new Error(errorData?.error || 'Failed to connect to video generator');
        }

        const data = await response.json();
        setGenerations(current => current.map(c => 
          c.id === task.id ? { ...c, status: 'success', url: data.url, type: data.type } : c
        ));
      } catch (err) {
        setGenerations(current => current.map(c => 
          c.id === task.id ? { ...c, status: 'error', error: err instanceof Error ? err.message : String(err) } : c
        ));
      }
    });
  };

  const handleDownload = async (video: VideoGeneration) => {
    if (!video.url) return;
    try {
      // Fetch the blob to force a download silently to the Downloads folder
      const resp = await fetch(video.url);
      const blob = await resp.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      const extension = video.type === 'image' ? 'jpg' : 'mp4';
      a.download = `pipefx_${video.type || 'video'}_${video.id.slice(0,6)}.${extension}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error('Failed to fetch blob, falling back to new tab:', err);
      // Fallback if CORS prevents blob download
      const a = document.createElement('a');
      a.href = video.url;
      a.target = '_blank';
      const extension = video.type === 'image' ? 'jpg' : 'mp4';
      a.download = `pipefx_${video.type || 'video'}_${video.id.slice(0,6)}.${extension}`;
      a.click();
    }
  };

  return (
    <div className="flex flex-col h-full bg-background border-l relative overflow-hidden">
      {/* Dashboard Area */}
      <div className="p-6 pb-2 border-b flex items-center justify-between shrink-0 bg-card/50">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            AI Video Studio
          </h2>
          <p className="text-sm text-muted-foreground mt-1">Generate stunning videos using state-of-the-art AI models</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 flex flex-col md:flex-row gap-6">
        
        {/* Left Control Panel */}
        <div className="flex flex-col gap-6 w-full md:w-[400px] shrink-0">
          <Card className="shadow-sm border-border/50">
            <CardContent className="p-4 space-y-4">
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Select AI Model</Label>
                <div className="grid gap-2">
                  {MODELS.map(model => (
                    <div 
                      key={model.id}
                      onClick={() => setSelectedModel(model.id)}
                      className={`p-3 rounded-lg border-2 cursor-pointer transition-all ${
                        selectedModel === model.id 
                          ? 'border-primary bg-primary/5 shadow-sm' 
                          : 'border-transparent hover:bg-muted/50'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-sm">{model.name}</span>
                        {selectedModel === model.id && <div className="h-2 w-2 rounded-full bg-primary" />}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{model.description}</p>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-sm border-border/50 flex-1 flex flex-col min-h-0">
            <CardContent className="p-4 flex flex-col h-full gap-3 overflow-y-auto">
              <div className="space-y-2 flex-1 flex flex-col min-h-[100px]">
                <Label htmlFor="prompt" className="text-xs uppercase tracking-wider text-muted-foreground shrink-0">Video Prompt</Label>
                <Textarea 
                  id="prompt"
                  placeholder="Describe the video you want to generate in detail..."
                  className="flex-1 resize-none bg-muted/20 min-h-[80px]"
                  value={prompt}
                  onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setPrompt(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">Image Reference (Optional)</Label>
                </div>
                {imageRef ? (
                  <div className="relative h-20 rounded-lg overflow-hidden group">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={imageRef} alt="Reference" className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button variant="destructive" size="sm" onClick={() => setImageRef(null)}>Remove Image</Button>
                    </div>
                  </div>
                ) : (
                  <div 
                    className={`h-20 border-2 border-dashed rounded-lg flex flex-col items-center justify-center transition-all cursor-pointer ${
                      isDragging ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-muted/10 hover:bg-muted/20 text-muted-foreground'
                    }`}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onClick={handleImageClick}
                  >
                    <ImageIcon className="h-6 w-6 mb-2 opacity-50" />
                    <span className="text-xs font-medium">Click or Drag & Drop Image Here</span>
                  </div>
                )}
              </div>

              {/* Higgsfield-style Pills */}
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                
                {/* Duration Picker */}
                <Popover>
                  <PopoverTrigger className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-medium transition-colors focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80 h-9 px-4 border border-border/50">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    {duration}s
                  </PopoverTrigger>
                  <PopoverContent className="w-56 p-4 rounded-xl shadow-lg border-border/50 bg-background/95 backdrop-blur-md" align="start">
                    <Label className="text-sm font-medium mb-3 block">Choose duration</Label>
                    <Input 
                      type="number" 
                      value={duration} 
                      onChange={(e) => setDuration(e.target.value)} 
                      className="h-10 bg-muted/50 focus-visible:ring-1"
                    />
                  </PopoverContent>
                </Popover>

                {/* Aspect Ratio Picker */}
                <Popover>
                  <PopoverTrigger className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-medium transition-colors focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80 h-9 px-4 border border-border/50">
                    <Monitor className="h-4 w-4 text-muted-foreground" />
                    {aspectRatio}
                  </PopoverTrigger>
                  <PopoverContent className="w-36 p-1.5 rounded-xl shadow-lg border-border/50 bg-background/95 backdrop-blur-md" align="center">
                    {['16:9', '9:16', '1:1'].map((ratio) => (
                      <Button 
                        key={ratio}
                        variant={aspectRatio === ratio ? 'secondary' : 'ghost'} 
                        size="sm" 
                        className="w-full justify-start font-medium text-sm h-9 px-3 rounded-lg"
                        onClick={() => setAspectRatio(ratio)}
                      >
                        {ratio}
                      </Button>
                    ))}
                  </PopoverContent>
                </Popover>

                {/* Quality Picker */}
                <Popover>
                  <PopoverTrigger className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-medium transition-colors focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80 h-9 px-4 border border-border/50">
                    <Diamond className="h-4 w-4 text-muted-foreground" />
                    {resolution}
                  </PopoverTrigger>
                  <PopoverContent className="w-36 p-1.5 rounded-xl shadow-lg border-border/50 bg-background/95 backdrop-blur-md" align="center">
                    {['1080p', '720p'].map((res) => (
                      <Button 
                        key={res}
                        variant={resolution === res ? 'secondary' : 'ghost'} 
                        size="sm" 
                        className="w-full justify-start font-medium text-sm h-9 px-3 rounded-lg"
                        onClick={() => setResolution(res)}
                      >
                        {res}
                      </Button>
                    ))}
                  </PopoverContent>
                </Popover>

                {/* Batch Size Picker */}
                <Popover>
                  <PopoverTrigger className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-medium transition-colors focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80 h-9 px-4 border border-border/50">
                    <span className="font-bold -mr-0.5">X</span>
                    {batchSize} Variations
                  </PopoverTrigger>
                  <PopoverContent className="w-40 p-1.5 rounded-xl shadow-lg border-border/50 bg-background/95 backdrop-blur-md" align="center">
                    <Label className="text-sm font-medium mb-2 block px-2 mt-1">Number of variations</Label>
                    <div className="grid grid-cols-4 gap-1">
                      {[1, 2, 3, 4].map((num) => (
                        <Button 
                          key={num}
                          variant={batchSize === num ? 'secondary' : 'ghost'} 
                          size="sm" 
                          className={`font-medium h-9 rounded-lg ${batchSize === num ? 'border border-border shadow-sm' : ''}`}
                          onClick={() => setBatchSize(num)}
                        >
                          {num}
                        </Button>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>

              </div>

              <Button 
                onClick={handleGenerate} 
                className="w-full gap-2 mt-auto h-10 font-medium rounded-lg"
                disabled={!prompt.trim() || pendingCount >= 8}
              >
                <Sparkles className="h-4 w-4" />
                Generate Video {pendingCount > 0 ? `(Running: ${pendingCount})` : ''}
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Right Preview Panel - Gallery Grid */}
        <div className="flex-1 flex flex-col bg-muted/10 rounded-xl border border-border/50 overflow-y-auto relative shadow-inner p-4 min-h-[400px]">
          {generations.length === 0 ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground opacity-50">
              <Video className="h-16 w-16 mb-4 stroke-[1.5]" />
              <p className="font-medium">No video generated yet</p>
              <p className="text-xs mt-1">Select a model and enter a prompt to begin</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-2 lg:gap-4 gap-4 auto-rows-max">
              {generations.map((gen) => (
                <div 
                  key={gen.id} 
                  className={`bg-card w-full aspect-video rounded-xl border border-border overflow-hidden relative group shadow-sm transition-all duration-300 ${gen.status === 'success' ? 'hover:shadow-md cursor-pointer hover:border-primary/50 hover:ring-2 hover:ring-primary/20' : ''}`}
                  onClick={() => gen.status === 'success' ? setExpandedVideo(gen) : undefined}
                >
                  {gen.status === 'pending' && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/50 backdrop-blur-md z-10 transition-all duration-500">
                      <div className="relative">
                        <div className="h-16 w-16 border-4 border-muted rounded-full"></div>
                        <div className="h-16 w-16 border-4 border-primary rounded-full border-t-transparent animate-spin absolute inset-0"></div>
                      </div>
                      <p className="text-muted-foreground text-xs mt-4 font-medium animate-pulse">
                        Rendering variation...
                      </p>
                    </div>
                  )}

                  {gen.status === 'error' && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center p-4 text-center bg-destructive/5 text-destructive">
                      <div className="h-10 w-10 rounded-full bg-destructive/10 flex items-center justify-center mb-2">
                        <span className="text-xl">!</span>
                      </div>
                      <p className="text-xs opacity-80 line-clamp-3">{gen.error}</p>
                    </div>
                  )}

                  {gen.status === 'success' && gen.url && (
                    <div className="absolute inset-0 bg-black/5">
                      {gen.type === 'image' ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={gen.url} alt="Result" className="w-full h-full object-cover" />
                      ) : (
                        <video src={gen.url} autoPlay loop muted className="w-full h-full object-cover" />
                      )}
                      
                      {/* Overlay badges */}
                      <div className="absolute top-2 left-2 right-2 flex justify-between opacity-0 group-hover:opacity-100 transition-opacity">
                        <div className="bg-black/60 text-white text-[10px] uppercase font-bold tracking-wider px-2 py-1 rounded backdrop-blur-md">
                          {MODELS.find(m => m.id === gen.model)?.name || gen.model}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Expanded Video Overlay Modal */}
      {expandedVideo && (
        <div className="fixed inset-0 z-50 bg-black/90 flex flex-col p-6 backdrop-blur-sm transition-all duration-300 animate-in fade-in zoom-in-95">
          <div className="w-full h-full flex flex-col max-w-6xl mx-auto relative rounded-xl border border-white/10 bg-background overflow-hidden shadow-2xl">
            {/* Header */}
            <div className="h-14 border-b border-border bg-card/80 px-4 flex items-center justify-between shrink-0">
              <h3 className="font-semibold flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-primary" />
                {MODELS.find(m => m.id === expandedVideo.model)?.name || expandedVideo.model} Result
              </h3>
              <Button variant="ghost" size="icon" onClick={() => setExpandedVideo(null)} className="h-8 w-8 hover:bg-destructive/20 hover:text-destructive">
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Video Container */}
            <div className="flex-1 bg-black flex items-center justify-center relative p-8">
               {expandedVideo.type === 'image' ? (
                 // eslint-disable-next-line @next/next/no-img-element
                 <img src={expandedVideo.url} alt="Expanded" className="h-full w-auto max-h-[70vh] rounded-lg border border-white/10 shadow-lg object-contain" />
               ) : (
                 <video src={expandedVideo.url} autoPlay controls className="h-full w-auto max-h-[70vh] rounded-lg border border-white/10 shadow-lg" />
               )}
            </div>

            {/* Footer Data & Controls */}
            <div className="h-24 border-t border-border bg-card p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between shrink-0 gap-4">
              <div className="flex-1 min-w-0 pr-4">
                 <p className="text-xs text-muted-foreground uppercase font-semibold tracking-wider mb-1">Original Prompt</p>
                 <p className="text-sm font-medium line-clamp-2 leading-relaxed" title={expandedVideo.prompt}>
                   &quot;{expandedVideo.prompt}&quot;
                 </p>
              </div>
              <Button onClick={() => handleDownload(expandedVideo)} className="shrink-0 h-10 px-8 font-medium">
                Download {expandedVideo.type === 'image' ? 'Image' : 'Video'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
