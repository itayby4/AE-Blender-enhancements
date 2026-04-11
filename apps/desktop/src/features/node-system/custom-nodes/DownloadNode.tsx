import { useState, useEffect } from 'react';
import {
  Handle,
  Position,
  useReactFlow,
  useNodeId,
  useViewport,
} from '@xyflow/react';
import { Download, HardDriveDownload, Loader2 } from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardFooter,
} from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';

export function DownloadNode({
  data,
  selected,
}: {
  data: any;
  selected?: boolean;
}) {
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadCount, setDownloadCount] = useState(0);
  const { getEdges, getNodes } = useReactFlow();
  const nodeId = useNodeId();

  const [isExpanded, setIsExpanded] = useState(false);
  useEffect(() => {
    if (!selected) setIsExpanded(false);
  }, [selected]);

  const { zoom } = useViewport();
  const isCompact = zoom < 0.25 && !isExpanded;

  const handleDownload = async () => {
    if (isDownloading || !nodeId) return;
    setIsDownloading(true);
    setDownloadCount(0);

    const allEdges = getEdges();
    const allNodes = getNodes();

    // Find all media URLs upstream
    const mediaToDownload: { url: string; ext: string; prefix: string }[] = [];
    const searchQueue = [nodeId];
    const visited = new Set<string>([nodeId]);

    while (searchQueue.length > 0) {
      const targetId = searchQueue.shift()!;
      const incomingEdges = allEdges.filter((e: any) => e.target === targetId);

      for (const edge of incomingEdges) {
        const parentNode = allNodes.find((n: any) => n.id === edge.source);
        if (!parentNode || visited.has(parentNode.id)) continue;
        visited.add(parentNode.id);

        if (parentNode.type === 'nullNode') {
          searchQueue.push(parentNode.id); // Continue traversal
        } else if (
          parentNode.type === 'modelNode' &&
          parentNode.data?.previewUrl
        ) {
          const url = parentNode.data.previewUrl as string;
          const isImage =
            url.startsWith('data:image') ||
            parentNode.data.mediaType === 'image';
          mediaToDownload.push({
            url,
            ext: isImage ? 'png' : 'mp4',
            prefix: String(parentNode.data.model || 'model'),
          });
        } else if (parentNode.type === 'mediaNode' && parentNode.data?.url) {
          const url = parentNode.data.url as string;
          const ext = url.split('.').pop()?.split('?')[0] || 'media';
          mediaToDownload.push({ url, ext, prefix: 'media' });
        }
      }
    }

    if (mediaToDownload.length > 0) {
      for (let i = 0; i < mediaToDownload.length; i++) {
        const media = mediaToDownload[i];
        try {
          let downloadUrl = media.url;
          let objectUrl = null;

          // If it's a remote URL, fetch and create a blob URL
          if (media.url.startsWith('http')) {
            const resp = await fetch(media.url);
            const blob = await resp.blob();
            objectUrl = URL.createObjectURL(blob);
            downloadUrl = objectUrl;
          }

          // Trigger standard anchor download
          const filename = `pipefx_${media.prefix}_${Date.now()}_${i}.${
            media.ext
          }`;
          const a = document.createElement('a');
          a.href = downloadUrl;
          a.download = filename;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);

          if (objectUrl) URL.revokeObjectURL(objectUrl);

          setDownloadCount((prev) => prev + 1);
        } catch (err) {
          console.error('Failed to download media item:', err);
        }
      }
    }

    setIsDownloading(false);
  };

  if (isCompact) {
    return (
      <div
        onDoubleClick={() => setIsExpanded(true)}
        className="w-[580px] h-[140px] bg-[#2a2a2a] border-4 border-[#111] rounded-lg shadow-2xl flex items-center justify-center relative hover:bg-[#333] transition-colors cursor-pointer"
      >
        <div className="absolute bottom-0 left-0 right-0 h-4 bg-sky-500 opacity-80" />
        <span className="text-gray-200 text-5xl font-extrabold tracking-wider px-8 truncate block text-center w-full">
          {data.label || 'Download'}
        </span>
        <Handle
          type="target"
          position={Position.Left}
          className="w-12 h-12 bg-gray-200 border-4 border-[#111] rounded-none -ml-6"
        />
      </div>
    );
  }

  return (
    <div
      className={`relative w-52 ${
        isExpanded
          ? 'scale-[1.5] origin-center shadow-[0_0_30px_rgba(14,165,233,0.3)] z-50'
          : ''
      }`}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="absolute top-auto bottom-[22px] w-5 h-5 bg-background border-2 border-sky-500/50 hover:border-sky-500 transition-colors -left-2.5 z-[100]"
      />

      <Card
        className={`shadow-xl bg-card/95 backdrop-blur-md border-2 transition-all duration-300 group ${
          isDownloading
            ? 'border-primary shadow-primary/20'
            : 'border-sky-500/50 hover:border-sky-500'
        } w-full overflow-hidden`}
      >
        <CardHeader className="p-2.5 pb-2 border-b border-border/50 bg-sky-500/10">
          <CardTitle className="text-sm font-bold flex items-center justify-between text-sky-500">
            <div className="flex items-center gap-2">
              <HardDriveDownload className="h-4 w-4" />
              <span className="truncate">{data.label || 'Download Media'}</span>
            </div>
          </CardTitle>
        </CardHeader>

        <CardContent className="p-3">
          <div className="text-xs text-muted-foreground/80 leading-snug">
            {isDownloading
              ? `Downloading ${downloadCount} items...`
              : data.description || 'Downloads all upstream images and videos.'}
          </div>
        </CardContent>

        <CardFooter className="p-2 border-t border-border/50 bg-muted/20 flex flex-col items-stretch gap-2">
          <Button
            size="sm"
            variant="default"
            onClick={handleDownload}
            disabled={isDownloading}
            className="h-8 gap-2 bg-sky-600 hover:bg-sky-500 text-white shadow-sm w-full font-bold uppercase tracking-wider text-[11px]"
          >
            {isDownloading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Download className="w-3.5 h-3.5" />
            )}
            {isDownloading ? 'Saving...' : 'Download All'}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
