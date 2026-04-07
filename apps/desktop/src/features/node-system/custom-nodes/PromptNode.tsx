import { useState, useEffect, type ChangeEvent } from 'react';
import { Handle, Position, useReactFlow, useNodeId, useViewport } from '@xyflow/react';
import { Type } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';

export function PromptNode({ data, selected }: { data: any, selected?: boolean }) {
  const prompt = data.prompt || '';
  const { setNodes } = useReactFlow();
  const nodeId = useNodeId();

  const [isExpanded, setIsExpanded] = useState(false);
  useEffect(() => {
    if (!selected) setIsExpanded(false);
  }, [selected]);

  const { zoom } = useViewport();
  const isCompact = zoom < 0.25 && !isExpanded;

  const handlePromptChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    const newPrompt = e.target.value;
    if (!nodeId) return;
    setNodes((nds) =>
      nds.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, prompt: newPrompt } } : n))
    );
  };

  if (isCompact) {
    return (
      <div onDoubleClick={() => setIsExpanded(true)} className="w-[580px] h-[140px] bg-[#2a2a2a] border-4 border-[#111] rounded-lg shadow-2xl flex items-center justify-center relative hover:bg-[#333] transition-colors cursor-pointer">
        <div className="absolute bottom-0 left-0 right-0 h-4 bg-violet-500 opacity-80" />
        <span className="text-gray-200 text-5xl font-extrabold tracking-wider px-8 truncate block text-center w-full">{data.label || 'Prompt'}</span>
        <Handle type="source" position={Position.Right} className="w-12 h-12 bg-gray-200 border-4 border-[#111] rounded-none -mr-6" />
      </div>
    );
  }

  return (
    <Card className={`min-w-64 w-fit max-w-[800px] shadow-xl bg-card/95 backdrop-blur-md border-2 border-violet-500/50 hover:border-violet-500 transition-all duration-300 overflow-hidden ${isExpanded ? 'scale-[1.5] origin-center shadow-[0_0_30px_rgba(139,92,246,0.3)]' : ''}`}>
      <CardHeader className="p-2.5 pb-2 border-b border-border/50 bg-violet-500/10">
        <CardTitle className="text-sm font-bold flex items-center gap-2 text-violet-400">
          <div className="p-1 rounded bg-violet-500/20 text-violet-400">
            <Type className="h-3.5 w-3.5" />
          </div>
          <span className="truncate">{data.label || 'Prompt'}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-3">
        <textarea
          className="nodrag min-w-[200px] text-xs min-h-[80px] max-h-[600px] resize p-2 bg-background border border-border/50 rounded-md focus:outline-none focus:ring-1 focus:ring-violet-500 shadow-inner text-foreground placeholder-muted-foreground font-mono leading-relaxed"
          placeholder="Write your prompt here..."
          value={prompt}
          onChange={handlePromptChange}
          onKeyDown={(e) => {
            if (['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
              e.stopPropagation();
            }
          }}
        />
      </CardContent>
      {/* Output Handle — connects prompt text to a model node */}
      <Handle
        type="source"
        position={Position.Right}
        className="w-3.5 h-3.5 bg-background border-2 border-violet-500/50 hover:border-violet-500 transition-colors"
      />
    </Card>
  );
}
