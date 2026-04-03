import { Handle, Position } from '@xyflow/react';
import { CircleDashed } from 'lucide-react';
import { Card } from '../../../components/ui/card';

export function NullNode({ data }: { data: any }) {
  return (
    <Card className="w-32 shadow-md bg-card/50 backdrop-blur-md border border-muted-foreground/30 hover:border-muted-foreground/60 opacity-80 transition-all duration-300 overflow-hidden flex flex-col justify-center items-center h-20">
      {/* Input Handle */}
      <Handle
        type="target"
        position={Position.Left}
        className="w-3 h-3 bg-muted border-2 border-muted-foreground/50 hover:border-foreground transition-colors"
      />
      
      <div className="flex flex-col items-center gap-1.5 opacity-60">
        <CircleDashed className="h-5 w-5 text-muted-foreground" />
        <span className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground">
          {data.label || 'NULL'}
        </span>
      </div>

      {/* Output Handle */}
      <Handle
        type="source"
        position={Position.Right}
        className="w-3 h-3 bg-muted border-2 border-muted-foreground/50 hover:border-foreground transition-colors"
      />
    </Card>
  );
}
