import { useState, useEffect } from 'react';
import { Handle, Position, useNodeId, useViewport } from '@xyflow/react';
import { PlaySquare, Loader2, Workflow } from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardFooter,
} from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';

import { usePipelineExecutor } from '../usePipelineExecutor';

export function TriggerNode({
  data,
  selected,
}: {
  data: any;
  selected?: boolean;
}) {
  const nodeId = useNodeId();
  const { executePipeline, isGlobalExecuting } = usePipelineExecutor();

  const [isExpanded, setIsExpanded] = useState(false);
  useEffect(() => {
    if (!selected) setIsExpanded(false);
  }, [selected]);

  const { zoom } = useViewport();
  const isCompact = zoom < 0.25 && !isExpanded;

  // We rely on the global execution state, but if we want to show specifically
  // that THIS node triggered it, we can just use the global state.
  const isExecuting = isGlobalExecuting;

  const handleExecute = async () => {
    if (isExecuting || !nodeId) return;
    await executePipeline(nodeId);
  };

  if (isCompact) {
    return (
      <div
        onDoubleClick={() => setIsExpanded(true)}
        className="w-[580px] h-[140px] bg-[#2a2a2a] border-4 border-[#111] rounded-lg shadow-2xl flex items-center justify-center relative hover:bg-[#333] transition-colors cursor-pointer"
      >
        <div className="absolute bottom-0 left-0 right-0 h-4 bg-indigo-500 opacity-80" />
        <span className="text-gray-200 text-5xl font-extrabold tracking-wider px-8 truncate block text-center w-full">
          {data.label || 'Start'}
        </span>
        <Handle
          type="source"
          position={Position.Right}
          className="w-12 h-12 bg-gray-200 border-4 border-[#111] rounded-none -mr-6"
        />
        {isExecuting && (
          <div className="absolute -top-4 -right-4 w-12 h-12 bg-yellow-500 rounded-full animate-pulse shadow-sm" />
        )}
      </div>
    );
  }

  return (
    <div
      className={`relative w-44 ${
        isExpanded
          ? 'scale-[1.5] origin-center shadow-[0_0_30px_rgba(99,102,241,0.3)] z-50'
          : ''
      }`}
    >
      <Card className="shadow-lg bg-card/95 backdrop-blur-md border-2 border-indigo-500/50 hover:border-indigo-500 transition-all duration-300 w-full overflow-hidden">
        <CardHeader className="p-2.5 pb-2 border-b border-border/50 bg-indigo-500/10">
          <CardTitle className="text-sm font-bold flex items-center justify-between text-indigo-500">
            <div className="flex items-center gap-2">
              <Workflow className="h-4 w-4" />
              <span className="truncate">{data.label || 'Start Pipeline'}</span>
            </div>
            {isExecuting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3">
          <div className="text-xs text-muted-foreground/80 leading-snug">
            {isExecuting
              ? 'Triggering downstream nodes...'
              : data.description || 'Starts execution of all connected items.'}
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
            {isExecuting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <PlaySquare className="w-3.5 h-3.5" />
            )}
            {isExecuting ? 'Running...' : 'Execute Pipeline'}
          </Button>
        </CardFooter>
      </Card>
      {/* Output Handle right side - Trigger data forwards! */}
      <Handle
        type="source"
        position={Position.Right}
        className="absolute w-5 h-5 bg-background border-2 border-indigo-500/50 hover:border-indigo-500 transition-colors top-auto bottom-[22px] -right-2.5 z-[100]"
      />
    </div>
  );
}
