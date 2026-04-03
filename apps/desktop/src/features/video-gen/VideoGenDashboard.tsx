import { useState, type ChangeEvent } from 'react';
import { Sparkles, Loader2, ImageIcon, Clock, Monitor, Diamond, Video } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Card, CardContent } from '../../components/ui/card';
import { Textarea } from '../../components/ui/textarea';
import { Label } from '../../components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '../../components/ui/popover';
import { Input } from '../../components/ui/input';

const MODELS = [
  { id: 'kling3', name: 'Kling 3.0', description: 'High-fidelity realistic generation' },
  { id: 'seeddance2', name: 'SeedDance 2.0', description: 'Creative and dynamic motion' },
  { id: 'nanobanana2', name: 'Nano Banana 2', description: 'Fast experimental model' }
];

export function VideoGenDashboard() {
  const [selectedModel, setSelectedModel] = useState(MODELS[0].id);
  const [prompt, setPrompt] = useState('');
  const [duration, setDuration] = useState('5');
  const [resolution, setResolution] = useState('720p');
  const [aspectRatio, setAspectRatio] = useState('16:9');
  const [imageRef, setImageRef] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [outputType, setOutputType] = useState('video'); // 'video' | 'image'
  const [generatedResult, setGeneratedResult] = useState<{ url?: string; status: string; type?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

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
    if (!prompt.trim() || isGenerating) return;

    setIsGenerating(true);
    setError(null);
    setGeneratedResult(null);

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
          outputType,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.error || 'Failed to connect to video generator');
      }

      const data = await response.json();
      setGeneratedResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownload = async () => {
    if (!generatedResult?.url) return;
    try {
      // Fetch the blob to force a download silently to the Downloads folder
      const resp = await fetch(generatedResult.url);
      const blob = await resp.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      const extension = generatedResult.type === 'image' ? 'jpg' : 'mp4';
      a.download = `pipefx_${generatedResult.type || 'video'}_${Date.now()}.${extension}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      // Basic notification to let the user know it saved successfully
      alert('הוידאו הורד בהצלחה! חפש אותו בתיקיית ה-Downloads שלך.');
    } catch (err) {
      console.error('Failed to fetch blob, falling back to new tab:', err);
      // Fallback if CORS prevents blob download
      const a = document.createElement('a');
      a.href = generatedResult.url;
      a.target = '_blank';
      const extension = generatedResult.type === 'image' ? 'jpg' : 'mp4';
      a.download = `pipefx_${generatedResult.type || 'video'}_${Date.now()}.${extension}`;
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
                <Label htmlFor="prompt" className="text-xs uppercase tracking-wider text-muted-foreground shrink-0">{outputType === 'image' ? 'Image Prompt' : 'Video Prompt'}</Label>
                <Textarea 
                  id="prompt"
                  placeholder={`Describe the ${outputType === 'image' ? 'image' : 'video'} you want to generate in detail...`}
                  className="flex-1 resize-none bg-muted/20 min-h-[80px]"
                  value={prompt}
                  disabled={isGenerating}
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
                
                {/* Output Type Picker (only for Nano Banana currently) */}
                {selectedModel === 'nanobanana2' && (
                  <div className="inline-flex bg-secondary p-1 rounded-xl border border-border/50 items-center">
                    <Button 
                      variant={outputType === 'video' ? 'default' : 'ghost'} 
                      size="sm" 
                      onClick={() => setOutputType('video')}
                      className={`h-7 px-3 rounded-lg text-xs font-medium ${outputType === 'video' ? 'shadow-sm' : ''}`}
                    >
                      <Video className="w-3 h-3 mr-1" />
                      Video
                    </Button>
                    <Button 
                      variant={outputType === 'image' ? 'default' : 'ghost'} 
                      size="sm" 
                      onClick={() => setOutputType('image')}
                      className={`h-7 px-3 rounded-lg text-xs font-medium ${outputType === 'image' ? 'shadow-sm' : ''}`}
                    >
                      <ImageIcon className="w-3 h-3 mr-1" />
                      Image
                    </Button>
                  </div>
                )}
                
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

              </div>

              <Button 
                onClick={handleGenerate} 
                className="w-full gap-2 mt-auto h-10 font-medium rounded-lg"
                disabled={isGenerating || !prompt.trim()}
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Generating {outputType === 'image' ? 'Image' : 'Video'}...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    Generate {outputType === 'image' ? 'Image' : 'Video'}
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Right Preview Panel */}
        <div className="flex-1 flex flex-col bg-muted/10 rounded-xl border border-border/50 overflow-hidden relative shadow-inner min-h-[400px]">
          {error ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center text-destructive">
              <div className="h-12 w-12 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
                <span className="text-2xl">!</span>
              </div>
              <h3 className="font-semibold mb-2">Generation Failed</h3>
              <p className="text-sm opacity-80">{error}</p>
            </div>
          ) : isGenerating ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/50 backdrop-blur-sm z-10 transition-all duration-500">
              <div className="relative">
                <div className="h-20 w-20 border-4 border-muted rounded-full"></div>
                <div className="h-20 w-20 border-4 border-primary rounded-full border-t-transparent animate-spin absolute inset-0"></div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <Sparkles className="h-6 w-6 text-primary animate-pulse" />
                </div>
              </div>
              <h3 className="mt-6 font-semibold animate-pulse">Rendering pixels...</h3>
              <p className="text-muted-foreground text-sm mt-2 max-w-[250px] text-center">
                This might take a few moments depending on the complexity of your prompt.
              </p>
            </div>
          ) : generatedResult ? (
            <div className="absolute inset-0 flex flex-col bg-background/80">
              <div className="flex-1 flex items-center justify-center bg-black/5 p-4">
                 <div className="w-full h-full max-w-3xl max-h-[80%] rounded-lg overflow-hidden shadow-2xl relative border-border/50 border bg-black group flex items-center justify-center">
                    {/* Placeholder media player */}
                    {generatedResult.type === 'image' ? (
                      <ImageIcon className="h-16 w-16 text-white/20 absolute" />
                    ) : (
                      <Video className="h-16 w-16 text-white/20 absolute" />
                    )}
                    {generatedResult.type === 'image' ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img 
                        src={generatedResult.url} 
                        alt="Generated"
                        className="w-full h-full object-contain relative z-10" 
                      />
                    ) : (
                      <video 
                        src={generatedResult.url} 
                        controls 
                        autoPlay 
                        className="w-full h-full object-contain relative z-10"
                      >
                        Your browser does not support the video tag.
                      </video>
                    )}
                 </div>
              </div>
              <div className="h-16 border-t bg-card shrink-0 flex items-center px-4 justify-between">
                <div className="text-sm text-muted-foreground">
                  Model: <span className="font-medium text-foreground">{MODELS.find(m => m.id === selectedModel)?.name}</span>
                </div>
                <Button variant="outline" size="sm" onClick={handleDownload}>Download {generatedResult.type === 'image' ? 'Image' : 'MP4'}</Button>
              </div>
            </div>
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground opacity-50">
              <Video className="h-16 w-16 mb-4 stroke-[1.5]" />
              <p className="font-medium">No video generated yet</p>
              <p className="text-xs mt-1">Select a model and enter a prompt to begin</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
