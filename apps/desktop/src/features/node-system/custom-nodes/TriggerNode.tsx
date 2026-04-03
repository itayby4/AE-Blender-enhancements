import { useState } from 'react';
import { Handle, Position, useReactFlow, useNodeId } from '@xyflow/react';
import { PlaySquare, Loader2, Workflow } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';

export function TriggerNode({ data }: { data: any }) {
  const [isExecuting, setIsExecuting] = useState(false);
  const { getEdges, getNodes, setNodes } = useReactFlow();
  const nodeId = useNodeId();

  const handleExecute = async () => {
    if (isExecuting || !nodeId) return;
    setIsExecuting(true);

    const allEdges = getEdges();

    // 1. Traverse FORWARD from this trigger out to all connected dependencies
    const executionOrder: string[] = [];
    const queue = [nodeId];
    const visited = new Set<string>();

    while (queue.length > 0) {
      const currentId = queue.shift()!;
      if (!visited.has(currentId)) {
        visited.add(currentId);
        
        if (currentId !== nodeId) {
           executionOrder.push(currentId);
        }
        
        // Find all outgoing edges (connecting FROM this node to the next step)
        const outgoingEdges = allEdges.filter(e => e.source === currentId);
        for (const edge of outgoingEdges) {
          queue.push(edge.target);
        }
      }
    }

    const uniqueOrder = Array.from(new Set(executionOrder));

    // 2. Execute pipeline sequentially (forwards)
    for (const executionId of uniqueOrder) {
      const allNodes = getNodes();
      const currentNode = allNodes.find((n: any) => n.id === executionId);

      // We only execute `modelNode` entities. (We can skip other types)
      if (!currentNode || currentNode.type !== 'modelNode') continue;

      const { model } = currentNode.data;

      // Resolve prompt and image ref from connected parent nodes
      let resolvedPrompt = currentNode.data.prompt || '';
      let incomingImageRefs: string[] = [];
      const searchQueue = [executionId];
      const visitedParents = new Set<string>([executionId]);
      
      while (searchQueue.length > 0) {
        const targetId = searchQueue.shift()!;
        const incomingEdges = allEdges.filter((e: any) => e.target === targetId);
        
        for (const edge of incomingEdges) {
          const parentNode = allNodes.find((n: any) => n.id === edge.source);
          if (!parentNode || visitedParents.has(parentNode.id)) continue;
          visitedParents.add(parentNode.id);
          
          if (parentNode.type === 'nullNode') {
            searchQueue.push(parentNode.id); // Continue traversal
          } else if (parentNode.type === 'promptNode' && parentNode.data?.prompt) {
            resolvedPrompt = parentNode.data.prompt as string;
          } else if (parentNode.type === 'modelNode' && parentNode.data?.previewUrl) {
            incomingImageRefs.push(parentNode.data.previewUrl as string);
          } else if (parentNode.type === 'mediaNode' && parentNode.data?.url) {
            incomingImageRefs.push(parentNode.data.url as string);
          }
        }
      }
      const prompt = resolvedPrompt;

      // Mark the current node visually as "Generating" and clear past errors
      setNodes((nds) => nds.map(n => n.id === executionId ? { ...n, data: { ...n.data, previewUrl: null, isGenerating: true, error: null } } : n));
      
      // Map frontend model IDs to backend API model IDs
      const MODEL_MAP: Record<string, string> = {
        kling: 'kling3',
        nanobanana: 'gemini2',
        seeddance: 'seeddance2',
        seeddream: 'seeddream45',
      };
      const backendModel = MODEL_MAP[model as string] || model;
      
      try {
        console.log(`[Pipeline] Triggering node ${executionId} (${backendModel}) with prompt: ${prompt}`);
        
        // Execute the Real Backend API request!
        const response = await fetch('http://localhost:3001/api/ai-models', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: backendModel,
            prompt: prompt || 'Cinematic highly-detailed scene',
            imageRef: incomingImageRefs.length > 0 ? incomingImageRefs[0] : undefined, // Fallback for backward compatibility
            imageRefs: incomingImageRefs, // Send the full array of image references
          }),
        });

        if (!response.ok) {
           const errText = await response.text();
           throw new Error(`API Error: ${errText}`);
        }

        const result = await response.json();

        // Save file to Desktop/RENDERS folder
        try {
          await fetch('http://localhost:3001/api/save-render', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              url: result.url,
              type: result.type || 'video',
              model: backendModel,
              prompt: prompt,
            }),
          });
          console.log(`[Pipeline] Saved render to Desktop/RENDERS`);
        } catch (saveErr) {
          console.warn(`[Pipeline] Could not save to RENDERS folder:`, saveErr);
        }

        // Execution succeeded! Display the media in the Node!
        setNodes((nds) => nds.map(n => {
          if (n.id === executionId) {
            return {
              ...n,
              data: { 
                ...n.data, 
                isGenerating: false, 
                previewUrl: result.url || '',
                mediaType: result.type || 'video',
              }
            };
          }
          return n;
        }));
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        console.error(`[Pipeline] Failed at node ${executionId}:`, errorMessage);

        // Turn node Red with error state
        setNodes((nds) => nds.map(n => {
          if (n.id === executionId) {
            return { ...n, data: { ...n.data, isGenerating: false, error: errorMessage } };
          }
          return n;
        }));
        
        // Halt entire pipeline execution on first failure
        break;
      }
    }

    setIsExecuting(false);
  };

  return (
    <Card className={`w-56 shadow-xl bg-card/95 backdrop-blur-md border-2 transition-all duration-300 group ${isExecuting ? 'border-primary shadow-primary/20' : 'border-indigo-500/50 hover:border-indigo-500'}`}>
      <CardHeader className="p-2.5 pb-2 border-b border-border/50 bg-indigo-500/10">
        <CardTitle className="text-sm font-bold flex items-center justify-between text-indigo-500">
          <div className="flex items-center gap-2">
             <Workflow className="h-4 w-4" />
             {data.label || 'Start Pipeline'}
          </div>
          {isExecuting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-3">
         <div className="text-xs text-muted-foreground/80 leading-snug">
           {isExecuting ? 'Triggering downstream nodes...' : (data.description || 'Starts execution of all connected items.')}
         </div>
      </CardContent>
      <CardFooter className="p-2 border-t border-border/50 bg-muted/20 flex flex-col items-stretch gap-2">
         <Button 
           size="sm" 
           variant="default" 
           onClick={handleExecute} 
           disabled={isExecuting}
           className="h-8 gap-2 bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm w-full font-bold uppercase tracking-wider text-[11px]"
         >
           {isExecuting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PlaySquare className="w-3.5 h-3.5" />}
           {isExecuting ? 'Running...' : 'Execute Pipeline'}
         </Button>
      </CardFooter>
      {/* Output Handle right side - Trigger data forwards! */}
      <Handle 
        type="source" 
        position={Position.Right} 
        style={{ top: 'auto', bottom: 22 }}
        className="w-4 h-4 bg-background border-2 border-indigo-500/50 hover:border-indigo-500 transition-colors" 
      />
    </Card>
  );
}
