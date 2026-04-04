import { useState } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Image as ImageIcon, Video, Music, FileQuestion } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';

type MediaType = 'image' | 'video' | 'audio' | 'unknown';


const STYLE_MAP: Record<MediaType, { icon: any; color: string; bg: string; border: string }> = {
  image:   { icon: ImageIcon,    color: 'text-cyan-400',    bg: 'bg-cyan-500/10',    border: 'border-cyan-500/50 hover:border-cyan-500' },
  video:   { icon: Video,        color: 'text-pink-400',    bg: 'bg-pink-500/10',     border: 'border-pink-500/50 hover:border-pink-500' },
  audio:   { icon: Music,        color: 'text-yellow-400',  bg: 'bg-yellow-500/10',   border: 'border-yellow-500/50 hover:border-yellow-500' },
  unknown: { icon: FileQuestion,  color: 'text-gray-400',    bg: 'bg-gray-500/10',     border: 'border-gray-500/50 hover:border-gray-500' },
};

export function MediaNode({ data }: { data: any }) {
  const [hasError, setHasError] = useState(false);

  const mediaType: MediaType = data.mediaType || 'unknown';
  const style = STYLE_MAP[mediaType];
  const IconComponent = style.icon;
  const url: string = data.url || '';
  const fileName: string = data.fileName || 'Untitled';

  return (
    <Card className={`w-64 shadow-xl bg-card/95 backdrop-blur-md border-2 overflow-hidden transition-all duration-300 hover:shadow-2xl ${style.border}`}>
      {/* Input Handle */}
      <Handle
        type="target"
        position={Position.Left}
        style={{ top: 28 }}
        className="w-3.5 h-3.5 bg-background border-2 border-muted-foreground/50 hover:border-foreground transition-colors"
      />

      {/* Header */}
      <CardHeader className={`p-2.5 pb-2 border-b border-border/50 ${style.bg}`}>
        <CardTitle className={`text-sm font-bold flex items-center gap-2 ${style.color}`}>
          <div className={`p-1 rounded ${style.bg} ${style.color}`}>
            <IconComponent className="h-3.5 w-3.5" />
          </div>
          <span className="truncate text-xs font-semibold">{fileName}</span>
        </CardTitle>
      </CardHeader>

      {/* Preview */}
      <CardContent className="p-0">
        <div className="relative w-full bg-black/90 rounded-b-md flex items-center justify-center overflow-hidden h-48 p-1">
          {hasError || !url ? (
            <div className="flex flex-col items-center justify-center gap-1.5 text-muted-foreground/30">
              <IconComponent className="h-8 w-8 stroke-[1.5]" />
              <span className="text-[9px] font-bold uppercase tracking-widest">Preview Error</span>
            </div>
          ) : mediaType === 'image' ? (
            <img
              src={url}
              alt={fileName}
              className="w-full h-full object-contain drop-shadow-md"
              onError={() => setHasError(true)}
            />
          ) : mediaType === 'video' ? (
            <video
              src={url}
              autoPlay
              loop
              muted
              className="w-full h-full object-cover"
              onError={() => setHasError(true)}
            />
          ) : mediaType === 'audio' ? (
            <div className="w-full p-3 flex flex-col items-center justify-center gap-2">
              <Music className={`h-8 w-8 ${style.color} animate-pulse`} />
              <audio
                src={url}
                controls
                className="w-full h-8 nodrag"
                onError={() => setHasError(true)}
              />
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center gap-1.5 text-muted-foreground/30">
              <FileQuestion className="h-8 w-8 stroke-[1.5]" />
              <span className="text-[9px] font-bold uppercase tracking-widest">Unknown Format</span>
            </div>
          )}
        </div>

        {/* Footer metadata */}
        <div className="px-3 py-2 flex items-center justify-between text-[9px] uppercase font-bold tracking-wider text-muted-foreground/60 border-t border-border/50">
          <span>{mediaType.toUpperCase()}</span>
          <span>Media Out →</span>
        </div>
      </CardContent>

      {/* Output Handle */}
      <Handle
        type="source"
        position={Position.Right}
        style={{ top: 'auto', bottom: 18 }}
        className="w-3.5 h-3.5 bg-background border-2 border-muted-foreground/50 hover:border-foreground transition-colors"
      />
    </Card>
  );
}
