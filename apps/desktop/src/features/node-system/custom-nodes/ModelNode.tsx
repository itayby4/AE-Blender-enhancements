import { type ChangeEvent } from 'react';
import { Handle, Position, useReactFlow, useNodeId } from '@xyflow/react';
import { Video, Sparkles, Image as ImageIcon, Loader2, Wand2, Palette } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';

export function ModelNode({ data }: { data: any }) {
  // Model style configuration
  const MODEL_STYLES: Record<string, { icon: any; borderColor: string; bgColor: string; textColor: string }> = {
    kling:      { icon: Sparkles, borderColor: 'border-primary/50 hover:border-primary',         bgColor: 'bg-primary/20',      textColor: 'text-primary' },
    nanobanana: { icon: Video,    borderColor: 'border-amber-500/50 hover:border-amber-500',     bgColor: 'bg-amber-500/20',    textColor: 'text-amber-500' },
    seeddance:  { icon: Wand2,    borderColor: 'border-emerald-500/50 hover:border-emerald-500', bgColor: 'bg-emerald-500/20',  textColor: 'text-emerald-500' },
    seeddream:  { icon: Palette,  borderColor: 'border-rose-500/50 hover:border-rose-500',       bgColor: 'bg-rose-500/20',     textColor: 'text-rose-500' },
  };
  const style = MODEL_STYLES[data.model] || MODEL_STYLES.nanobanana;
  const IconComponent = style.icon;
  
  // Smart media type detection: use explicit type from API, or auto-detect from URL
  const isImageMedia = data.mediaType === 'image' 
    || (data.previewUrl && data.previewUrl.startsWith('data:image'));
  const isVideoMedia = !isImageMedia;
  
  // Decoupled node logic. Execution state is strictly managed by the ReactFlow node data
  // mutating globally from the Render execution process.
  const previewUrl = data.previewUrl || null; 
  const isGenerating = data.isGenerating || false;
  const prompt = data.prompt || '';

  const { setNodes } = useReactFlow();
  const nodeId = useNodeId();

  // Push prompt edits into the global Flow state so the Render Node can read them during pipeline execution.
  const handlePromptChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    const newPrompt = e.target.value;
    if (!nodeId) return;
    setNodes((nds) =>
      nds.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, prompt: newPrompt } } : n))
    );
  };

  return (
    <Card className={`w-72 shadow-xl bg-card/95 backdrop-blur-md border-2 overflow-hidden transition-all duration-300 hover:shadow-2xl ${style.borderColor} ${isGenerating ? 'ring-2 ring-primary ring-offset-2 ring-offset-background' : ''}`}>
      
      {/* Input Handle for upstream dependency */}
      <Handle 
        type="target" 
        position={Position.Left} 
        style={{ top: 28 }}
        className="w-3.5 h-3.5 bg-background border-2 border-muted-foreground/50 hover:border-foreground transition-colors" 
      />
      
      {/* Node Header */}
      <CardHeader className="p-2.5 pb-2 border-b border-border/50 bg-muted/30">
        <CardTitle className="text-sm font-semibold flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={`p-1 rounded ${style.bgColor} ${style.textColor}`}>
              <IconComponent className="h-4 w-4" />
            </div>
            <span className="truncate pr-2 tracking-tight">{data.label}</span>
          </div>
          
          <div 
             className="h-2 w-2 rounded-full shadow-sm shrink-0 transition-colors duration-500" 
             style={{ backgroundColor: isGenerating ? '#eab308' : data.error ? '#ef4444' : previewUrl ? '#22c55e' : '#64748b' }}
             title={isGenerating ? 'Rendering...' : data.error ? 'Error' : previewUrl ? 'Render Complete' : 'Idle'}
          />
        </CardTitle>
      </CardHeader>
      
      <CardContent className="p-0 flex flex-col">
        {/* Render Preview Window */}
        <div className="relative w-full bg-black flex items-center justify-center border-b border-border/50 overflow-hidden h-28">
           {data.error ? (
             <div className="flex flex-col items-center justify-center gap-1.5 p-3 text-center w-full h-full bg-red-500/10 border-t border-b border-red-500/20">
               <span className="text-[10px] uppercase font-black tracking-widest text-red-500">API Error</span>
               <span className="text-[9px] text-red-400 break-words opacity-80 leading-tight w-full line-clamp-3 font-mono">{data.error}</span>
             </div>
           ) : isGenerating ? (
             <div className="flex flex-col items-center justify-center gap-2 text-primary">
               <Loader2 className="h-6 w-6 animate-spin" />
               <span className="text-[10px] uppercase tracking-widest font-bold">Rendering...</span>
             </div>
           ) : previewUrl ? (
             isVideoMedia ? (
               <video 
                 src={previewUrl} 
                 autoPlay 
                 loop 
                 muted 
                 className="w-full h-full object-cover"
               />
             ) : (
               <img src={previewUrl} alt="Preview" className="w-full h-full object-cover" />
             )
           ) : (
             <div className="flex flex-col items-center justify-center gap-1.5 text-muted-foreground/30">
               {isVideoMedia ? <Video className="h-6 w-6 stroke-[1.5]" /> : <ImageIcon className="h-6 w-6 stroke-[1.5]" />}
               <span className="text-[9px] font-bold uppercase tracking-widest">No Media Found</span>
             </div>
           )}
        </div>

        <div className="p-3 space-y-3 bg-muted/5">
          {/* Text Input for API Prompt */}
          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground/80 pl-0.5 relative z-10 flex cursor-pointer select-none">
              Generation Prompt
            </label>
            <textarea
              className="nodrag w-full text-xs min-h-[60px] max-h-[150px] resize-y p-2 bg-background border border-border/50 rounded-md focus:outline-none focus:ring-1 focus:ring-primary shadow-inner text-foreground placeholder-muted-foreground relative z-10 font-mono"
              placeholder="Describe your scene in detail..."
              value={prompt}
              onChange={handlePromptChange}
              onKeyDown={(e) => {
                 // Prevent React Flow from intercepting Backspace/Delete which deletes the node!
                 if (['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
                    e.stopPropagation();
                 }
              }}
            />
          </div>
          
          <div className="flex items-center justify-between text-[9px] uppercase font-bold tracking-wider text-muted-foreground/70 pt-1">
              <div className="flex items-center gap-1.5 opacity-80">
                <ImageIcon className="w-3 h-3" /> Visual Handle
              </div>
              <div className="flex items-center gap-1.5 opacity-80">
                Media Out <Video className="w-3 h-3" />
              </div>
          </div>
        </div>
      </CardContent>

      {/* Output Handle */}
      <Handle 
        type="source" 
        position={Position.Right} 
        style={{ top: 'auto', bottom: 22 }}
        className="w-3.5 h-3.5 bg-background border-2 border-muted-foreground/50 hover:border-foreground transition-colors" 
      />
    </Card>
  );
}
