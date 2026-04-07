import { useState, useEffect } from 'react';
import { Handle, Position, useViewport } from '@xyflow/react';
import { Image as ImageIcon, Video, Music, FileQuestion } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';

type MediaType = 'image' | 'video' | 'audio' | 'unknown';


const STYLE_MAP: Record<MediaType, { icon: any; color: string; bg: string; border: string }> = {
  image:   { icon: ImageIcon,    color: 'text-cyan-400',    bg: 'bg-cyan-500/10',    border: 'border-cyan-500/50 hover:border-cyan-500' },
  video:   { icon: Video,        color: 'text-pink-400',    bg: 'bg-pink-500/10',     border: 'border-pink-500/50 hover:border-pink-500' },
  audio:   { icon: Music,        color: 'text-yellow-400',  bg: 'bg-yellow-500/10',   border: 'border-yellow-500/50 hover:border-yellow-500' },
  unknown: { icon: FileQuestion,  color: 'text-gray-400',    bg: 'bg-gray-500/10',     border: 'border-gray-500/50 hover:border-gray-500' },
};

export function MediaNode({ data, selected }: { data: any, selected?: boolean }) {
  const [hasError, setHasError] = useState(false);

  const mediaType: MediaType = data.mediaType || 'unknown';
  const style = STYLE_MAP[mediaType];
  const IconComponent = style.icon;
  const url: string = data.url || '';
  const fileName: string = data.fileName || 'Untitled';
  
  const [isExpanded, setIsExpanded] = useState(false);
  useEffect(() => {
    if (!selected) setIsExpanded(false);
  }, [selected]);

  const { zoom } = useViewport();
  const isCompact = zoom < 0.25 && !isExpanded;

  if (isCompact) {
    const bottomColor = mediaType === 'image' ? 'bg-cyan-500' : mediaType === 'video' ? 'bg-pink-500' : mediaType === 'audio' ? 'bg-yellow-500' : 'bg-gray-500';
    return (
      <div onDoubleClick={() => setIsExpanded(true)} className="w-[580px] h-[140px] bg-[#2a2a2a] border-4 border-[#111] rounded-lg shadow-2xl flex items-center justify-center relative hover:bg-[#333] transition-colors cursor-pointer">
        <div className={`absolute bottom-0 left-0 right-0 h-4 opacity-80 ${bottomColor}`} />
        <Handle type="target" position={Position.Left} className="w-12 h-12 bg-gray-200 border-4 border-[#111] rounded-none -ml-6" />
        <span className="text-gray-200 text-5xl font-extrabold tracking-wider px-8 truncate block text-center w-full">{fileName || 'Media'}</span>
        <Handle type="source" position={Position.Right} className="w-12 h-12 bg-gray-200 border-4 border-[#111] rounded-none -mr-6" />
      </div>
    );
  }

  return (
    <Card className={`shadow-xl bg-card/95 backdrop-blur-md border-2 overflow-hidden transition-all duration-300 hover:shadow-2xl ${style.border} w-64 ${isExpanded ? 'scale-[1.5] origin-center shadow-[0_0_30px_rgba(0,200,255,0.3)]' : ''}`}>
      {/* Input Handle */}
      <Handle
        type="target"
        position={Position.Left}
        className="top-[28px] w-3.5 h-3.5 bg-background border-2 border-muted-foreground/50 hover:border-foreground transition-colors"
      />

      {/* Header */}
      <CardHeader className={`p-2.5 pb-2 border-b border-border/50 ${style.bg}`}>
        <CardTitle className={`font-bold flex items-center gap-2 ${style.color} text-sm`}>
          <div className={`p-1 rounded ${style.bg} ${style.color}`}>
            <IconComponent className="h-3.5 w-3.5" />
          </div>
          <span className="truncate font-semibold text-xs">{fileName}</span>
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
        className="top-auto bottom-[18px] w-3.5 h-3.5 bg-background border-2 border-muted-foreground/50 hover:border-foreground transition-colors"
      />
    </Card>
  );
}
