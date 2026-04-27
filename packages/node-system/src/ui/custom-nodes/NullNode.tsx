import { useState, useEffect } from 'react';
import { Handle, Position, useViewport } from '@xyflow/react';
import { CircleDashed } from 'lucide-react';
import { Card } from '../card.js';

export function NullNode({
  data,
  selected,
}: {
  data: any;
  selected?: boolean;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  useEffect(() => {
    if (!selected) setIsExpanded(false);
  }, [selected]);

  const { zoom } = useViewport();
  const isCompact = zoom < 0.25 && !isExpanded;

  if (isCompact) {
    return (
      <div
        onDoubleClick={() => setIsExpanded(true)}
        className="w-[580px] h-[140px] bg-[#2a2a2a] border-4 border-[#111] rounded-lg shadow-2xl flex items-center justify-center relative hover:bg-[#333] transition-colors cursor-pointer"
      >
        <div className="absolute bottom-0 left-0 right-0 h-4 bg-gray-500 opacity-50" />
        <Handle
          type="target"
          position={Position.Left}
          className="w-12 h-12 bg-gray-200 border-4 border-[#111] rounded-none -ml-6"
        />
        <span className="text-gray-200 text-5xl font-extrabold tracking-wider px-8 truncate block text-center w-full uppercase">
          {data.label || 'NULL'}
        </span>
        <Handle
          type="source"
          position={Position.Right}
          className="w-12 h-12 bg-gray-200 border-4 border-[#111] rounded-none -mr-6"
        />
      </div>
    );
  }

  return (
    <div
      className={`relative w-32 h-20 ${
        isExpanded
          ? 'scale-[1.5] origin-center shadow-[0_0_30px_rgba(255,255,255,0.1)] z-50'
          : ''
      }`}
    >
      {/* Input Handle */}
      <Handle
        type="target"
        position={Position.Left}
        className="absolute w-5 h-5 bg-muted border-2 border-muted-foreground/50 hover:border-foreground transition-colors -left-2.5 top-1/2 -translate-y-1/2 z-[100]"
      />
      <Card className="shadow-md bg-card/50 backdrop-blur-md border border-muted-foreground/30 hover:border-muted-foreground/60 opacity-80 transition-all duration-300 overflow-hidden flex flex-col justify-center items-center w-full h-full">
        <div className="flex flex-col items-center gap-1.5 opacity-60">
          <CircleDashed className="text-muted-foreground h-5 w-5" />
          <span className="uppercase font-bold tracking-widest text-muted-foreground text-[10px]">
            {data.label || 'NULL'}
          </span>
        </div>
      </Card>

      {/* Output Handle */}
      <Handle
        type="source"
        position={Position.Right}
        className="absolute w-5 h-5 bg-muted border-2 border-muted-foreground/50 hover:border-foreground transition-colors -right-2.5 top-1/2 -translate-y-1/2 z-[100]"
      />
    </div>
  );
}
