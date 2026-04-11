import { useState, useEffect, type ChangeEvent } from 'react';
import {
  Handle,
  Position,
  useReactFlow,
  useNodeId,
  useViewport,
} from '@xyflow/react';
import {
  Loader2,
  Mic,
  Music,
  AudioLines,
  Headphones,
  Volume2,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '../../../components/ui/card';

export function SoundNode({
  data,
  selected,
}: {
  data: any;
  selected?: boolean;
}) {
  const SOUND_STYLES: Record<
    string,
    {
      icon: any;
      borderColor: string;
      bgColor: string;
      textColor: string;
      glowColor: string;
    }
  > = {
    'elevenlabs-tts': {
      icon: Mic,
      borderColor: 'border-cyan-400/50 hover:border-cyan-400',
      bgColor: 'bg-cyan-400/20',
      textColor: 'text-cyan-400',
      glowColor: 'shadow-cyan-500/20',
    },
    'elevenlabs-sfx': {
      icon: Music,
      borderColor: 'border-orange-400/50 hover:border-orange-400',
      bgColor: 'bg-orange-400/20',
      textColor: 'text-orange-400',
      glowColor: 'shadow-orange-500/20',
    },
    'elevenlabs-sts': {
      icon: AudioLines,
      borderColor: 'border-teal-400/50 hover:border-teal-400',
      bgColor: 'bg-teal-400/20',
      textColor: 'text-teal-400',
      glowColor: 'shadow-teal-500/20',
    },
    'elevenlabs-isolate': {
      icon: Headphones,
      borderColor: 'border-pink-400/50 hover:border-pink-400',
      bgColor: 'bg-pink-400/20',
      textColor: 'text-pink-400',
      glowColor: 'shadow-pink-500/20',
    },
  };
  const style = SOUND_STYLES[data.model] || SOUND_STYLES['elevenlabs-tts'];
  const IconComponent = style.icon;

  const previewUrl = data.previewUrl || null;
  const isGenerating = data.isGenerating || false;
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
      nds.map((n) =>
        n.id === nodeId ? { ...n, data: { ...n.data, prompt: newPrompt } } : n
      )
    );
  };

  if (isCompact) {
    return (
      <div
        onDoubleClick={() => setIsExpanded(true)}
        className="w-[580px] h-[140px] bg-[#2a2a2a] border-4 border-[#111] rounded-lg shadow-2xl flex items-center justify-center relative hover:bg-[#333] transition-colors cursor-pointer"
      >
        <div
          className={`absolute bottom-0 left-0 right-0 h-4 opacity-80 ${style.bgColor.replace(
            '/20',
            ''
          )}`}
        />
        <Handle
          id="trigger"
          type="target"
          position={Position.Left}
          className="top-[40px] w-12 h-12 bg-gray-200 border-4 border-[#111] rounded-none -ml-6"
        />
        <Handle
          id="imageRef"
          type="target"
          position={Position.Left}
          className="top-[100px] w-12 h-12 bg-cyan-600 border-4 border-[#111] rounded-none -ml-6"
        />
        <span className="text-gray-200 text-5xl font-extrabold tracking-wider px-8 truncate block text-center w-full">
          {data.label}
        </span>
        <Handle
          type="source"
          position={Position.Right}
          className="w-12 h-12 bg-gray-200 border-4 border-[#111] rounded-none -mr-6"
        />
        {isGenerating && (
          <div className="absolute -top-4 -right-4 w-12 h-12 bg-yellow-500 rounded-full animate-pulse shadow-sm" />
        )}
      </div>
    );
  }

  return (
    <div className="relative w-64">
      {/* Input Handle */}
      <Handle
        id="trigger"
        type="target"
        position={Position.Left}
        className="absolute top-[28px] -left-2.5 w-5 h-5 bg-background border-2 border-muted-foreground/50 hover:border-foreground transition-colors z-[100]"
        title="Trigger"
      />
      {/* Audio Input Handle */}
      <Handle
        id="imageRef"
        type="target"
        position={Position.Left}
        className="absolute top-[70px] -left-2.5 w-5 h-5 bg-background border-2 border-cyan-500/50 hover:border-cyan-500 transition-colors z-[100]"
        title="Audio Input Reference"
      />

      <Card
        className={`shadow-xl bg-card/95 backdrop-blur-md border-2 overflow-hidden transition-all duration-300 hover:shadow-2xl w-full ${
          style.borderColor
        } ${
          isGenerating
            ? 'ring-2 ring-primary ring-offset-2 ring-offset-background'
            : ''
        }`}
      >
        {/* Header */}
        <CardHeader className="border-b border-border/50 bg-muted/30 p-2.5 pb-2">
          <CardTitle className="font-semibold flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <div
                className={`p-1 rounded ${style.bgColor} ${style.textColor}`}
              >
                <IconComponent className="h-4 w-4" />
              </div>
              <span className="truncate pr-2 tracking-tight">{data.label}</span>
            </div>
            <div
              className="h-2 w-2 rounded-full shadow-sm shrink-0 transition-colors duration-500"
              style={{
                backgroundColor: isGenerating
                  ? '#eab308'
                  : data.error
                  ? '#ef4444'
                  : previewUrl
                  ? '#22c55e'
                  : '#64748b',
              }}
            />
          </CardTitle>
        </CardHeader>

        <CardContent className="p-0 flex flex-col">
          {/* Audio Preview / Status Area */}
          <div className="relative w-full bg-black/40 flex items-center justify-center p-4 min-h-[64px] border-b border-border/50">
            {data.error ? (
              <div className="flex flex-col items-center gap-1 text-center w-full">
                <span className="text-[10px] uppercase font-black tracking-widest text-red-500">
                  Error
                </span>
                <span className="text-[9px] text-red-400 break-words opacity-80 leading-tight line-clamp-2 font-mono">
                  {data.error}
                </span>
              </div>
            ) : isGenerating ? (
              <div className="flex items-center gap-2 text-primary">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span className="text-[10px] uppercase tracking-widest font-bold">
                  Generating...
                </span>
              </div>
            ) : previewUrl ? (
              <div className="flex flex-col items-center gap-2 w-full">
                <audio
                  src={previewUrl}
                  controls
                  className="w-full h-8 nodrag"
                />
              </div>
            ) : (
              <div className="flex items-center gap-2 text-muted-foreground/30">
                <Volume2 className="h-5 w-5" />
                <span className="text-[9px] font-bold uppercase tracking-widest">
                  No Audio
                </span>
              </div>
            )}
          </div>

          {/* Prompt Input */}
          <div className="p-3 bg-muted/5">
            <label className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground/80 pl-0.5 mb-1.5 block">
              {data.model === 'elevenlabs-isolate'
                ? 'Connect audio input ↑'
                : data.model === 'elevenlabs-sts'
                ? 'Connect audio + enter text'
                : 'Text Input'}
            </label>
            <textarea
              className="nodrag w-full text-xs min-h-[48px] max-h-[100px] resize-y p-2 bg-background border border-border/50 rounded-md focus:outline-none focus:ring-1 focus:ring-primary shadow-inner text-foreground placeholder-muted-foreground font-mono"
              placeholder={
                data.model === 'elevenlabs-sfx'
                  ? 'Describe the sound effect...'
                  : data.model === 'elevenlabs-isolate'
                  ? 'No text needed — connect audio'
                  : 'Enter text to speak...'
              }
              value={prompt}
              onChange={handlePromptChange}
              onKeyDown={(e) => {
                if (
                  [
                    'Backspace',
                    'Delete',
                    'ArrowLeft',
                    'ArrowRight',
                    'ArrowUp',
                    'ArrowDown',
                  ].includes(e.key)
                ) {
                  e.stopPropagation();
                }
              }}
            />
          </div>
        </CardContent>
      </Card>

      {/* Output Handle */}
      <Handle
        type="source"
        position={Position.Right}
        className="absolute top-auto bottom-[22px] -right-2.5 w-5 h-5 bg-background border-2 border-muted-foreground/50 hover:border-foreground transition-colors z-[100]"
      />
    </div>
  );
}
