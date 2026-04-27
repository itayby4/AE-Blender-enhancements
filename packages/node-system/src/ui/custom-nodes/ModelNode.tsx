import { useState, useEffect, type ChangeEvent } from 'react';
import {
  Handle,
  Position,
  useReactFlow,
  useNodeId,
  useViewport,
} from '@xyflow/react';
import {
  Video,
  Sparkles,
  Image as ImageIcon,
  Loader2,
  Wand2,
  Palette,
  Brain,
  Mic,
  Music,
  AudioLines,
  Headphones,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '../card.js';

export function ModelNode({
  data,
  selected,
}: {
  data: any;
  selected?: boolean;
}) {
  // Model style configuration
  const MODEL_STYLES: Record<
    string,
    { icon: any; borderColor: string; bgColor: string; textColor: string }
  > = {
    kling: {
      icon: Sparkles,
      borderColor: 'border-primary/50 hover:border-primary',
      bgColor: 'bg-primary/20',
      textColor: 'text-primary',
    },
    nanobanana: {
      icon: Video,
      borderColor: 'border-amber-500/50 hover:border-amber-500',
      bgColor: 'bg-amber-500/20',
      textColor: 'text-amber-500',
    },
    seeddance: {
      icon: Wand2,
      borderColor: 'border-emerald-500/50 hover:border-emerald-500',
      bgColor: 'bg-emerald-500/20',
      textColor: 'text-emerald-500',
    },
    'seedance-2': {
      icon: Wand2,
      borderColor: 'border-emerald-500/50 hover:border-emerald-500',
      bgColor: 'bg-emerald-500/20',
      textColor: 'text-emerald-500',
    },
    'seedance-2-fast': {
      icon: Wand2,
      borderColor: 'border-emerald-400/50 hover:border-emerald-400',
      bgColor: 'bg-emerald-400/20',
      textColor: 'text-emerald-400',
    },
    seeddream: {
      icon: Palette,
      borderColor: 'border-rose-500/50 hover:border-rose-500',
      bgColor: 'bg-rose-500/20',
      textColor: 'text-rose-500',
    },
    'gpt-image-2': {
      icon: Sparkles,
      borderColor: 'border-sky-400/50 hover:border-sky-400',
      bgColor: 'bg-sky-400/20',
      textColor: 'text-sky-400',
    },
    anthropic: {
      icon: Brain,
      borderColor: 'border-purple-500/50 hover:border-purple-500',
      bgColor: 'bg-purple-500/20',
      textColor: 'text-purple-500',
    },
    'elevenlabs-tts': {
      icon: Mic,
      borderColor: 'border-cyan-400/50 hover:border-cyan-400',
      bgColor: 'bg-cyan-400/20',
      textColor: 'text-cyan-400',
    },
    'elevenlabs-sfx': {
      icon: Music,
      borderColor: 'border-orange-400/50 hover:border-orange-400',
      bgColor: 'bg-orange-400/20',
      textColor: 'text-orange-400',
    },
    'elevenlabs-sts': {
      icon: AudioLines,
      borderColor: 'border-teal-400/50 hover:border-teal-400',
      bgColor: 'bg-teal-400/20',
      textColor: 'text-teal-400',
    },
    'elevenlabs-isolate': {
      icon: Headphones,
      borderColor: 'border-pink-400/50 hover:border-pink-400',
      bgColor: 'bg-pink-400/20',
      textColor: 'text-pink-400',
    },
  };
  const style = MODEL_STYLES[data.model] || MODEL_STYLES.nanobanana;
  const IconComponent = style.icon;

  // Smart media type detection
  const isAudioMedia =
    data.mediaType === 'audio' ||
    (data.previewUrl && data.previewUrl.startsWith('data:audio'));
  const isImageMedia =
    !isAudioMedia &&
    (data.mediaType === 'image' ||
      (data.previewUrl && data.previewUrl.startsWith('data:image')));
  const isVideoMedia = !isAudioMedia && !isImageMedia;

  // Decoupled node logic. Execution state is strictly managed by the ReactFlow node data
  // mutating globally from the Render execution process.
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

  // Push prompt edits into the global Flow state so the Render Node can read them during pipeline execution.
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
        {/* Compact Mode Image Reference Handle */}
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
    <div
      className={`relative w-72 ${
        isExpanded ? 'scale-[1.5] origin-center z-50' : ''
      }`}
    >
      {/* Input Handle for trigger/pipeline dependency */}
      <Handle
        id="trigger"
        type="target"
        position={Position.Left}
        className="absolute top-[28px] -left-2.5 w-5 h-5 bg-background border-2 border-muted-foreground/50 hover:border-foreground transition-colors z-[100]"
        title="Trigger / Execute"
      />
      {/* Input Handle for Image Reference (First Frame) */}
      <Handle
        id="imageRef"
        type="target"
        position={Position.Left}
        className="absolute top-[85px] -left-2.5 w-5 h-5 bg-background border-2 border-cyan-500/50 hover:border-cyan-500 transition-colors z-[100]"
        title="First Frame Visual Reference"
      />

      <Card
        className={`shadow-xl bg-card/95 backdrop-blur-md border-2 overflow-hidden transition-all duration-300 hover:shadow-2xl w-full h-full ${
          style.borderColor
        } ${
          isGenerating
            ? 'ring-2 ring-primary ring-offset-2 ring-offset-background'
            : ''
        } ${isExpanded ? 'shadow-[0_0_30px_rgba(0,0,0,0.5)]' : ''}`}
      >
        {/* Node Header */}
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
              title={
                isGenerating
                  ? 'Rendering...'
                  : data.error
                  ? 'Error'
                  : previewUrl
                  ? 'Render Complete'
                  : 'Idle'
              }
            />
          </CardTitle>
        </CardHeader>

        <CardContent className="p-0 flex flex-col">
          {/* Render Preview Window */}
          <div
            className={`relative w-full bg-black flex items-center justify-center border-b border-border/50 overflow-hidden ${
              data.ratio === '9:16'
                ? 'aspect-[9/16]'
                : data.ratio === '1:1'
                ? 'aspect-square'
                : 'aspect-[16/9]'
            }`}
          >
            {data.error ? (
              <div className="flex flex-col items-center justify-center gap-1.5 p-3 text-center w-full h-full bg-red-500/10 border-t border-b border-red-500/20">
                <span className="text-[10px] uppercase font-black tracking-widest text-red-500">
                  API Error
                </span>
                <span className="text-[9px] text-red-400 break-words opacity-80 leading-tight w-full line-clamp-3 font-mono">
                  {data.error}
                </span>
              </div>
            ) : isGenerating ? (
              <div className="flex flex-col items-center justify-center gap-2 text-primary">
                <Loader2 className="h-6 w-6 animate-spin" />
                <span className="text-[10px] uppercase tracking-widest font-bold">
                  Rendering...
                </span>
              </div>
            ) : previewUrl ? (
              isAudioMedia ? (
                <div className="flex flex-col items-center justify-center gap-3 p-4 w-full">
                  <div className={`p-3 rounded-full ${style.bgColor}`}>
                    <Mic className={`h-8 w-8 ${style.textColor}`} />
                  </div>
                  <audio
                    src={previewUrl}
                    controls
                    className="w-full max-w-[250px] h-8 nodrag"
                  />
                  <span className="text-[9px] uppercase font-bold tracking-widest text-muted-foreground">
                    Audio Generated
                  </span>
                </div>
              ) : isVideoMedia ? (
                <video
                  src={previewUrl}
                  autoPlay
                  loop
                  muted
                  className="w-full h-full object-contain"
                />
              ) : (
                <img
                  src={previewUrl}
                  alt="Preview"
                  className="w-full h-full object-contain"
                />
              )
            ) : (
              <div className="flex flex-col items-center justify-center gap-1.5 text-muted-foreground/30">
                {isVideoMedia ? (
                  <Video className="h-6 w-6 stroke-[1.5]" />
                ) : (
                  <ImageIcon className="h-6 w-6 stroke-[1.5]" />
                )}
                <span className="text-[9px] font-bold uppercase tracking-widest">
                  No Media Found
                </span>
              </div>
            )}
          </div>

          <div className="p-3 space-y-3 bg-muted/5">
            {/* Text Input for API Prompt */}
            <div className="space-y-1.5">
              <label className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground/80 pl-0.5 flex cursor-pointer select-none relative z-10">
                Generation Prompt
              </label>
              <div className="flex items-center gap-1.5 flex-wrap relative z-10">
                {[
                  'kling',
                  'seeddance',
                  'seedance-2',
                  'seedance-2-fast',
                ].includes(data.model) && (
                  <select
                    className="nodrag text-[9px] bg-background border border-border/50 rounded px-1.5 py-0.5 min-w-[35px] focus:outline-none focus:border-primary text-muted-foreground uppercase font-bold tracking-wider cursor-pointer"
                    value={data.duration || '5'}
                    title="Video Duration (Seconds)"
                    onChange={(e) => {
                      if (!nodeId) return;
                      setNodes((nds) =>
                        nds.map((n) =>
                          n.id === nodeId
                            ? {
                                ...n,
                                data: { ...n.data, duration: e.target.value },
                              }
                            : n
                        )
                      );
                    }}
                  >
                    {[4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15].map((s) => (
                      <option key={s} value={String(s)}>
                        {s}S
                      </option>
                    ))}
                  </select>
                )}
                <select
                  className="nodrag text-[9px] bg-background border border-border/50 rounded px-1.5 py-0.5 min-w-[50px] focus:outline-none focus:border-primary text-muted-foreground uppercase font-bold tracking-wider cursor-pointer"
                  value={data.ratio || '16:9'}
                  title="Aspect Ratio"
                  onChange={(e) => {
                    if (!nodeId) return;
                    setNodes((nds) =>
                      nds.map((n) =>
                        n.id === nodeId
                          ? {
                              ...n,
                              data: { ...n.data, ratio: e.target.value },
                            }
                          : n
                      )
                    );
                  }}
                >
                  <option value="16:9">16:9</option>
                  <option value="9:16">9:16</option>
                  <option value="1:1">1:1</option>
                  <option value="21:9">21:9</option>
                  <option value="4:3">4:3</option>
                  <option value="3:4">3:4</option>
                  <option value="auto">Auto</option>
                </select>
                {[
                  'kling',
                  'seeddance',
                  'seedance-2',
                  'seedance-2-fast',
                ].includes(data.model) && (
                  <select
                    className="nodrag text-[9px] bg-background border border-border/50 rounded px-1.5 py-0.5 min-w-[50px] focus:outline-none focus:border-primary text-muted-foreground uppercase font-bold tracking-wider cursor-pointer"
                    value={data.resolution || '720p'}
                    title="Resolution"
                    onChange={(e) => {
                      if (!nodeId) return;
                      setNodes((nds) =>
                        nds.map((n) =>
                          n.id === nodeId
                            ? {
                                ...n,
                                data: {
                                  ...n.data,
                                  resolution: e.target.value,
                                },
                              }
                            : n
                        )
                      );
                    }}
                  >
                    <option value="720p">720P</option>
                    <option value="1080p">1080P</option>
                  </select>
                )}
                {/* GPT Image 2 — quality / background / format selectors. */}
                {data.model === 'gpt-image-2' && (
                  <>
                    <select
                      className="nodrag text-[9px] bg-background border border-border/50 rounded px-1.5 py-0.5 min-w-[60px] focus:outline-none focus:border-primary text-muted-foreground uppercase font-bold tracking-wider cursor-pointer"
                      value={data.quality || 'auto'}
                      title="Render quality"
                      onChange={(e) => {
                        if (!nodeId) return;
                        setNodes((nds) =>
                          nds.map((n) =>
                            n.id === nodeId
                              ? { ...n, data: { ...n.data, quality: e.target.value } }
                              : n
                          )
                        );
                      }}
                    >
                      <option value="auto">Q: Auto</option>
                      <option value="low">Q: Low</option>
                      <option value="medium">Q: Med</option>
                      <option value="high">Q: High</option>
                    </select>
                    <select
                      className="nodrag text-[9px] bg-background border border-border/50 rounded px-1.5 py-0.5 min-w-[60px] focus:outline-none focus:border-primary text-muted-foreground uppercase font-bold tracking-wider cursor-pointer"
                      value={data.background || 'auto'}
                      title="Background"
                      onChange={(e) => {
                        if (!nodeId) return;
                        setNodes((nds) =>
                          nds.map((n) =>
                            n.id === nodeId
                              ? { ...n, data: { ...n.data, background: e.target.value } }
                              : n
                          )
                        );
                      }}
                    >
                      <option value="auto">BG: Auto</option>
                      <option value="opaque">BG: Opaque</option>
                      <option value="transparent">BG: Transparent</option>
                    </select>
                    <select
                      className="nodrag text-[9px] bg-background border border-border/50 rounded px-1.5 py-0.5 min-w-[55px] focus:outline-none focus:border-primary text-muted-foreground uppercase font-bold tracking-wider cursor-pointer"
                      value={data.outputFormat || 'png'}
                      title="Output format"
                      onChange={(e) => {
                        if (!nodeId) return;
                        setNodes((nds) =>
                          nds.map((n) =>
                            n.id === nodeId
                              ? { ...n, data: { ...n.data, outputFormat: e.target.value } }
                              : n
                          )
                        );
                      }}
                    >
                      <option value="png">PNG</option>
                      <option value="jpeg">JPEG</option>
                      <option value="webp">WEBP</option>
                    </select>
                  </>
                )}
              </div>
              <textarea
                className="nodrag w-full text-xs min-h-[60px] max-h-[150px] resize-y p-2 bg-background border border-border/50 rounded-md focus:outline-none focus:ring-1 focus:ring-primary shadow-inner text-foreground placeholder-muted-foreground relative z-10 font-mono"
                placeholder="Describe your scene in detail..."
                value={prompt}
                onChange={handlePromptChange}
                onKeyDown={(e) => {
                  // Prevent React Flow from intercepting Backspace/Delete which deletes the node!
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
