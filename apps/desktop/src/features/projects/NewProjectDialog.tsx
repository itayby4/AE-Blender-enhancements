import { useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { mkdir, exists } from '@tauri-apps/plugin-fs';
import { FolderOpen, Loader2, FolderPlus, FolderInput } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../../components/ui/dialog';
import { Input } from '../../components/ui/input';
import { Button } from '../../components/ui/button';
import { Label } from '../../components/ui/label';
import { cn } from '../../lib/utils';

export interface NewProjectResult {
  name: string;
  folderPath: string;
}

interface NewProjectDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (result: NewProjectResult) => Promise<void> | void;
}

type Mode = 'new' | 'existing';

function pathSep(p: string): string {
  return p.includes('\\') ? '\\' : '/';
}

function basename(p: string): string {
  const sep = pathSep(p);
  const trimmed = p.replace(/[\\/]+$/, '');
  const idx = trimmed.lastIndexOf(sep);
  return idx >= 0 ? trimmed.slice(idx + 1) : trimmed;
}

export function NewProjectDialog({
  isOpen,
  onClose,
  onCreated,
}: NewProjectDialogProps) {
  const [mode, setMode] = useState<Mode>('new');

  // "new" mode state
  const [name, setName] = useState('');
  const [parentDir, setParentDir] = useState('');

  // "existing" mode state
  const [existingPath, setExistingPath] = useState('');

  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const reset = () => {
    setMode('new');
    setName('');
    setParentDir('');
    setExistingPath('');
    setError(null);
    setIsBusy(false);
  };

  const handleClose = () => {
    if (isBusy) return;
    reset();
    onClose();
  };

  const handlePickParent = async () => {
    try {
      const picked = await open({ directory: true, multiple: false });
      if (typeof picked === 'string') setParentDir(picked);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const handlePickExisting = async () => {
    try {
      const picked = await open({ directory: true, multiple: false });
      if (typeof picked === 'string') setExistingPath(picked);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleSubmit = async () => {
    setError(null);
    setIsBusy(true);
    try {
      let projectName: string;
      let folderPath: string;

      if (mode === 'new') {
        const trimmed = name.trim();
        if (!trimmed) {
          setError('Project name is required');
          setIsBusy(false);
          return;
        }
        if (!parentDir) {
          setError('Pick a parent folder');
          setIsBusy(false);
          return;
        }
        const sep = pathSep(parentDir);
        folderPath = `${parentDir}${sep}${trimmed}`;
        projectName = trimmed;

        if (await exists(folderPath)) {
          setError('A folder with that name already exists at this location');
          setIsBusy(false);
          return;
        }
        await mkdir(folderPath, { recursive: true });
      } else {
        if (!existingPath) {
          setError('Pick the project folder');
          setIsBusy(false);
          return;
        }
        if (!(await exists(existingPath))) {
          setError('That folder does not exist');
          setIsBusy(false);
          return;
        }
        folderPath = existingPath;
        projectName = name.trim() || basename(existingPath);
      }

      const sep = pathSep(folderPath);
      // mkdir is recursive — safe to call on existing folders.
      await mkdir(`${folderPath}${sep}images`, { recursive: true });
      await mkdir(`${folderPath}${sep}videos`, { recursive: true });

      await onCreated({ name: projectName, folderPath });
      reset();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setIsBusy(false);
    }
  };

  const previewPath = (() => {
    if (mode === 'new') {
      if (!parentDir || !name.trim()) return null;
      const sep = pathSep(parentDir);
      return `${parentDir}${sep}${name.trim()}${sep}{images,videos}`;
    }
    if (!existingPath) return null;
    const sep = pathSep(existingPath);
    return `${existingPath}${sep}{images,videos}`;
  })();

  return (
    <Dialog open={isOpen} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{mode === 'new' ? 'New Project' : 'Open Existing Project'}</DialogTitle>
        </DialogHeader>

        {/* Mode toggle */}
        <div className="flex items-center gap-1 bg-muted/40 rounded-md p-1">
          <button
            type="button"
            onClick={() => {
              setMode('new');
              setError(null);
            }}
            disabled={isBusy}
            className={cn(
              'flex-1 flex items-center justify-center gap-1.5 h-7 rounded text-xs font-medium transition-colors',
              mode === 'new'
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <FolderPlus className="h-3.5 w-3.5" />
            Create new
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('existing');
              setError(null);
            }}
            disabled={isBusy}
            className={cn(
              'flex-1 flex items-center justify-center gap-1.5 h-7 rounded text-xs font-medium transition-colors',
              mode === 'existing'
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <FolderInput className="h-3.5 w-3.5" />
            Open existing
          </button>
        </div>

        <div className="space-y-4 py-2">
          {mode === 'new' ? (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="proj-name" className="text-xs">Project name</Label>
                <Input
                  id="proj-name"
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="My Project"
                  disabled={isBusy}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Parent folder</Label>
                <div className="flex gap-2">
                  <Input
                    value={parentDir}
                    onChange={(e) => setParentDir(e.target.value)}
                    placeholder="Pick a location…"
                    disabled={isBusy}
                    className="font-mono text-xs"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handlePickParent}
                    disabled={isBusy}
                    className="gap-1.5 shrink-0"
                  >
                    <FolderOpen className="h-3.5 w-3.5" />
                    Browse
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label className="text-xs">Project folder</Label>
                <div className="flex gap-2">
                  <Input
                    value={existingPath}
                    onChange={(e) => setExistingPath(e.target.value)}
                    placeholder="Pick the project folder…"
                    disabled={isBusy}
                    className="font-mono text-xs"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handlePickExisting}
                    disabled={isBusy}
                    className="gap-1.5 shrink-0"
                  >
                    <FolderOpen className="h-3.5 w-3.5" />
                    Browse
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Missing <span className="font-mono">images/</span> and{' '}
                  <span className="font-mono">videos/</span> subfolders will be created.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="proj-name-existing" className="text-xs">
                  Project name <span className="text-muted-foreground">(optional)</span>
                </Label>
                <Input
                  id="proj-name-existing"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={existingPath ? basename(existingPath) : 'Defaults to folder name'}
                  disabled={isBusy}
                />
              </div>
            </>
          )}
          {previewPath && (
            <p className="text-[11px] text-muted-foreground font-mono break-all">
              → {previewPath}
            </p>
          )}
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={handleClose} disabled={isBusy}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isBusy} className="gap-2">
            {isBusy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {mode === 'new' ? 'Create' : 'Open'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
