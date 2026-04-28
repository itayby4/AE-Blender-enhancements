import { useCallback, useEffect, useState } from 'react';
import { readDir, mkdir } from '@tauri-apps/plugin-fs';
import { open } from '@tauri-apps/plugin-dialog';
import { convertFileSrc } from '@tauri-apps/api/core';
import { ImageIcon, Video as VideoIcon, RefreshCw, FolderOpen, Link2 } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { ScrollArea } from '../../components/ui/scroll-area';
import { cn } from '../../lib/utils';
import { updateProjectApi } from '../../lib/api';

interface MediaPoolProps {
  projectId?: string;
  folderPath?: string;
  onFolderLinked?: () => void;
}

type Tab = 'images' | 'videos';

interface MediaFile {
  name: string;
  path: string;
  src: string;
}

const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'];
const VIDEO_EXTS = ['mp4', 'webm', 'mov', 'mkv'];

function joinPath(base: string, segment: string): string {
  const sep = base.includes('\\') ? '\\' : '/';
  return `${base}${sep}${segment}`;
}

export function MediaPool({ projectId, folderPath, onFolderLinked }: MediaPoolProps) {
  const [tab, setTab] = useState<Tab>('images');
  const [images, setImages] = useState<MediaFile[]>([]);
  const [videos, setVideos] = useState<MediaFile[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadFolder = useCallback(
    async (sub: 'images' | 'videos', exts: string[]): Promise<MediaFile[]> => {
      if (!folderPath) return [];
      const dir = joinPath(folderPath, sub);
      try {
        const entries = await readDir(dir);
        return entries
          .filter((e) => {
            if (e.isDirectory) return false;
            const ext = e.name.split('.').pop()?.toLowerCase();
            return ext ? exts.includes(ext) : false;
          })
          .map((e) => {
            const full = joinPath(dir, e.name);
            return { name: e.name, path: full, src: convertFileSrc(full) };
          })
          .sort((a, b) => b.name.localeCompare(a.name));
      } catch {
        return [];
      }
    },
    [folderPath]
  );

  const refresh = useCallback(async () => {
    if (!folderPath) {
      setImages([]);
      setVideos([]);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const [imgs, vids] = await Promise.all([
        loadFolder('images', IMAGE_EXTS),
        loadFolder('videos', VIDEO_EXTS),
      ]);
      setImages(imgs);
      setVideos(vids);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsLoading(false);
    }
  }, [folderPath, loadFolder]);

  useEffect(() => {
    void refresh();
    const interval = setInterval(() => void refresh(), 5000);
    return () => clearInterval(interval);
  }, [refresh]);

  const handleLinkFolder = async () => {
    if (!projectId) return;
    try {
      const picked = await open({ directory: true, multiple: false });
      if (typeof picked !== 'string') return;
      const sep = picked.includes('\\') ? '\\' : '/';
      await mkdir(`${picked}${sep}images`, { recursive: true });
      await mkdir(`${picked}${sep}videos`, { recursive: true });
      await updateProjectApi(projectId, { folderPath: picked });
      onFolderLinked?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  if (!folderPath) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center">
        <FolderOpen className="h-8 w-8 text-muted-foreground mb-2" />
        <p className="text-sm font-medium">No folder linked</p>
        <p className="text-xs text-muted-foreground mt-1 mb-3">
          Pick a folder to store generated media for this project.
        </p>
        {projectId && (
          <Button size="sm" variant="outline" onClick={handleLinkFolder} className="gap-1.5">
            <Link2 className="h-3.5 w-3.5" />
            Link folder
          </Button>
        )}
        {error && <p className="text-[11px] text-destructive mt-2">{error}</p>}
      </div>
    );
  }

  const items = tab === 'images' ? images : videos;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-1 p-2 border-b shrink-0">
        <button
          onClick={() => setTab('images')}
          className={cn(
            'flex items-center gap-1.5 h-7 px-2.5 rounded-md text-xs font-medium transition-colors',
            tab === 'images'
              ? 'bg-muted text-foreground'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
          )}
        >
          <ImageIcon className="h-3.5 w-3.5" />
          Images
          <span className="text-[10px] font-mono text-muted-foreground">{images.length}</span>
        </button>
        <button
          onClick={() => setTab('videos')}
          className={cn(
            'flex items-center gap-1.5 h-7 px-2.5 rounded-md text-xs font-medium transition-colors',
            tab === 'videos'
              ? 'bg-muted text-foreground'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
          )}
        >
          <VideoIcon className="h-3.5 w-3.5" />
          Videos
          <span className="text-[10px] font-mono text-muted-foreground">{videos.length}</span>
        </button>
        <div className="flex-1" />
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => void refresh()}
          disabled={isLoading}
          title="Refresh"
        >
          <RefreshCw className={cn('h-3.5 w-3.5', isLoading && 'animate-spin')} />
        </Button>
      </div>

      {error && (
        <div className="px-3 py-2 text-[11px] text-destructive">{error}</div>
      )}

      <ScrollArea className="flex-1 min-h-0">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center px-4">
            <p className="text-xs text-muted-foreground">
              No {tab} yet. Generated {tab} will appear here automatically.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-1.5 p-2">
            {items.map((file) => (
              <a
                key={file.path}
                href={file.src}
                target="_blank"
                rel="noreferrer"
                className="group relative aspect-square bg-muted rounded-md overflow-hidden border hover:border-primary transition-colors"
                title={file.name}
              >
                {tab === 'images' ? (
                  <img
                    src={file.src}
                    alt={file.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <video
                    src={file.src}
                    className="w-full h-full object-cover"
                    muted
                    preload="metadata"
                  />
                )}
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <p className="text-[10px] text-white font-mono truncate">{file.name}</p>
                </div>
              </a>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
