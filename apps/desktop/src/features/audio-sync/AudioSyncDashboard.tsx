import { useState } from 'react';
import {
  Music,
  Video,
  Play,
  CheckCircle2,
  XCircle,
  Loader2,
  Trash2,
  FileAudio,
  AudioWaveform,
  ArrowRight,
  FolderOpen,
} from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Card, CardContent } from '../../components/ui/card';
import { Label } from '../../components/ui/label';
import { open } from '@tauri-apps/plugin-dialog';

type PipelineStage =
  | 'idle'
  | 'exporting'
  | 'discovering'
  | 'correlating'
  | 'injecting'
  | 'importing'
  | 'done'
  | 'error';

const STAGE_LABELS: Record<PipelineStage, string> = {
  idle: 'Ready',
  exporting: 'Exporting timeline XMLΓÇª',
  discovering: 'Discovering video sourcesΓÇª',
  correlating: 'Running FFT cross-correlationΓÇª',
  injecting: 'Injecting synced audio into XMLΓÇª',
  importing: 'Importing synced timelineΓÇª',
  done: 'Audio synced successfully!',
  error: 'An error occurred.',
};

const STAGE_ORDER: PipelineStage[] = [
  'exporting',
  'discovering',
  'correlating',
  'injecting',
  'importing',
  'done',
];

interface SyncResult {
  video: string;
  audio: string;
  offset: string;
}

const MEDIA_EXTENSIONS = [
  'wav', 'mp3', 'flac', 'aac', 'm4a', 'ogg', 'aiff', 'aif', 'bwf',
  'mp4', 'mov', 'mxf', 'avi', 'mkv', 'm4v', 'wmv', 'webm',
];

export function AudioSyncDashboard() {
  const [audioPaths, setAudioPaths] = useState<string[]>([]);
  const [stage, setStage] = useState<PipelineStage>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [resultMessage, setResultMessage] = useState('');
  const [syncResults, setSyncResults] = useState<SyncResult[]>([]);

  const isRunning = !['idle', 'done', 'error'].includes(stage);

  const handleBrowse = async () => {
    const selected = await open({
      multiple: true,
      title: 'Select Audio or Video Files',
      filters: [
        {
          name: 'Media Files',
          extensions: MEDIA_EXTENSIONS,
        },
      ],
    });

    if (selected) {
      const paths = Array.isArray(selected) ? selected : [selected];
      const newPaths = paths.filter((p) => !audioPaths.includes(p));
      if (newPaths.length > 0) {
        setAudioPaths((prev) => [...prev, ...newPaths]);
      }
    }
  };

  const removeFile = (index: number) => {
    setAudioPaths((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSync = async () => {
    if (audioPaths.length === 0) return;

    setStage('exporting');
    setErrorMessage('');
    setResultMessage('');
    setSyncResults([]);

    try {
      const response = await fetch(
        'http://localhost:3001/api/audio-sync/run',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ audio_paths: audioPaths }),
        }
      );

      const data = await response.json();

      if (!response.ok || data.error) {
        setStage('error');
        setErrorMessage(data.error || 'Unknown error');
        return;
      }

      setStage('done');
      setResultMessage(
        data.message || 'Audio synced and imported successfully!'
      );

      // Parse sync results for display
      if (data.sync_map) {
        const results: SyncResult[] = Object.entries(data.sync_map).flatMap(
          ([videoPath, matches]: [string, any]) => {
            const videoName = videoPath.split(/[\\/]/).pop() || videoPath;
            const items = Array.isArray(matches) ? matches : [matches];
            return items.map((info: any) => ({
              video: videoName,
              audio: info.audio_path.split(/[\\/]/).pop() || info.audio_path,
              offset: `${info.offset_seconds >= 0 ? '+' : ''}${info.offset_seconds.toFixed(3)}s`,
            }));
          }
        );
        setSyncResults(results);
      }
    } catch (err) {
      setStage('error');
      setErrorMessage(err instanceof Error ? err.message : String(err));
    }
  };

  const currentStageIndex = STAGE_ORDER.indexOf(stage);

  const getFileName = (filePath: string) => {
    return filePath.split(/[\\/]/).pop() || filePath;
  };

  return (
    <div className="flex flex-col h-full bg-background border-l relative overflow-hidden">
      {/* Header */}
      <div className="p-4 md:p-6 pb-2 md:pb-2 border-b flex items-center justify-between shrink-0 bg-card/50">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Music className="h-5 w-5 text-primary" />
            A/V Sync Studio
          </h2>
          <p className="text-xs md:text-sm text-muted-foreground mt-1">
            Sync external audio & video recordings to your edited timeline
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-hidden flex flex-col md:flex-row relative">
        {/* Left Control Panel */}
        <div className="w-full md:w-[340px] lg:w-[400px] shrink-0 flex flex-col border-b md:border-b-0 md:border-r border-border/50 bg-card/10 overflow-y-auto custom-scrollbar">
          <div className="p-4 md:p-6 flex flex-col gap-4 md:gap-5">
            {/* Drop Zone */}
            <Card className="shadow-sm border-border/50">
              <CardContent className="p-4 space-y-4">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <FileAudio className="h-3.5 w-3.5" />
                  External Media Files
                </Label>

                <div
                  onClick={handleBrowse}
                  className="relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 transition-all cursor-pointer border-border/60 hover:border-primary/50 hover:bg-muted/30 active:scale-[0.98]"
                >
                  <div className="h-12 w-12 rounded-full flex items-center justify-center mb-3 transition-colors bg-muted text-muted-foreground">
                    <FolderOpen className="h-5 w-5" />
                  </div>
                  <p className="text-sm font-medium text-center">
                    Click to browse files
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    WAV, MP3, FLAC, AAC, AIFF, MP4, MOV, MXF
                  </p>
                </div>

                {/* File List */}
                {audioPaths.length > 0 && (
                  <div className="space-y-2 mt-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">
                        {audioPaths.length} file
                        {audioPaths.length !== 1 ? 's' : ''} selected
                      </span>
                      <button
                        onClick={() => setAudioPaths([])}
                        className="text-[10px] text-muted-foreground hover:text-destructive transition-colors"
                      >
                        Clear all
                      </button>
                    </div>
                    {audioPaths.map((filePath, idx) => (
                      <div
                        key={idx}
                        className="flex items-center gap-2 bg-muted/30 rounded-lg px-3 py-2 group"
                      >
                        {/\.(mp4|mov|mxf|avi|mkv|m4v|wmv|webm)$/i.test(filePath) ? (
                          <Video className="h-3.5 w-3.5 text-blue-400 shrink-0" />
                        ) : (
                          <AudioWaveform className="h-3.5 w-3.5 text-primary shrink-0" />
                        )}
                        <span className="text-xs truncate flex-1 font-mono">
                          {getFileName(filePath)}
                        </span>
                        <button
                          onClick={() => removeFile(idx)}
                          className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* How It Works */}
            <Card className="shadow-sm border-border/50">
              <CardContent className="p-4 space-y-3">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <AudioWaveform className="h-3.5 w-3.5" />
                  How It Works
                </Label>
                <div className="space-y-2">
                  {[
                    'Export timeline and discover video clips',
                    'Extract scratch audio from each media source',
                    'FFT cross-correlate with your external media',
                    'Calculate precise sync offsets',
                    'Create new timeline with synced video & audio tracks',
                  ].map((step, idx) => (
                    <div key={idx} className="flex items-start gap-2.5">
                      <div className="h-5 w-5 rounded-full bg-muted flex items-center justify-center shrink-0 mt-0.5">
                        <span className="text-[10px] font-bold text-muted-foreground">
                          {idx + 1}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        {step}
                      </p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Sync Button */}
            <Button
              id="audio-sync-btn"
              onClick={handleSync}
              className="w-full gap-2 min-h-[48px] font-medium rounded-lg text-sm"
              disabled={isRunning || audioPaths.length === 0}
            >
              {isRunning ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  SyncingΓÇª
                </>
              ) : (
                <>
                  <Play className="h-4 w-4" />
                  Sync Audio
                </>
              )}
            </Button>

            {audioPaths.length === 0 && !isRunning && (
              <p className="text-[10px] text-muted-foreground text-center -mt-2">
                Add at least one audio file to begin
              </p>
            )}
          </div>
        </div>

        {/* Right Status Panel */}
        <div className="flex-1 flex flex-col bg-muted/10 overflow-y-auto relative p-6 md:p-8">
          {stage === 'idle' ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground opacity-50">
              <Music className="h-16 w-16 mb-4 stroke-[1.5]" />
              <p className="font-medium">No sync performed yet</p>
              <p className="text-xs mt-1">
                Add audio files and click Sync Audio
              </p>
            </div>
          ) : (
            <div className="max-w-lg mx-auto w-full space-y-6 mt-4">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                {stage === 'done' ? (
                  <CheckCircle2 className="h-5 w-5 text-green-400" />
                ) : stage === 'error' ? (
                  <XCircle className="h-5 w-5 text-red-400" />
                ) : (
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                )}
                Pipeline Status
              </h3>

              {/* Progress Steps */}
              <div className="space-y-1">
                {STAGE_ORDER.map((s, i) => {
                  const isCurrent = s === stage;
                  const isCompleted = currentStageIndex > i;
                  const isError =
                    stage === 'error' && i === 0 && currentStageIndex === -1;

                  return (
                    <div
                      key={s}
                      className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
                        isCurrent
                          ? 'bg-primary/10 border border-primary/30'
                          : isCompleted
                          ? 'bg-muted/30'
                          : 'opacity-40'
                      }`}
                    >
                      <div className="shrink-0">
                        {isCompleted ? (
                          <CheckCircle2 className="h-4 w-4 text-green-400" />
                        ) : isCurrent && stage !== 'error' ? (
                          s === 'done' ? (
                            <CheckCircle2 className="h-4 w-4 text-green-400" />
                          ) : (
                            <Loader2 className="h-4 w-4 animate-spin text-primary" />
                          )
                        ) : isError ? (
                          <XCircle className="h-4 w-4 text-red-400" />
                        ) : (
                          <div className="h-4 w-4 rounded-full border border-muted-foreground/30" />
                        )}
                      </div>
                      <span
                        className={`text-sm ${
                          isCurrent
                            ? 'font-medium text-foreground'
                            : isCompleted
                            ? 'text-muted-foreground'
                            : 'text-muted-foreground/50'
                        }`}
                      >
                        {STAGE_LABELS[s]}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Sync Results Table */}
              {stage === 'done' && syncResults.length > 0 && (
                <Card className="shadow-sm border-green-500/20 bg-green-500/5">
                  <CardContent className="p-4 space-y-3">
                    <Label className="text-xs uppercase tracking-wider text-green-400 flex items-center gap-1.5">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Sync Results
                    </Label>
                    <div className="space-y-2">
                      {syncResults.map((result, idx) => (
                        <div
                          key={idx}
                          className="flex items-center gap-2 text-xs bg-background/50 rounded-lg px-3 py-2.5"
                        >
                          <span className="truncate flex-1 font-mono text-muted-foreground">
                            {result.video}
                          </span>
                          <ArrowRight className="h-3 w-3 text-primary shrink-0" />
                          <span className="truncate flex-1 font-mono text-muted-foreground">
                            {result.audio}
                          </span>
                          <span className="shrink-0 font-bold text-primary tabular-nums bg-primary/10 px-2 py-0.5 rounded">
                            {result.offset}
                          </span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Error Message */}
              {stage === 'error' && errorMessage && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 mt-4">
                  <p className="text-sm text-red-400 font-medium mb-1">
                    Error
                  </p>
                  <p className="text-xs text-red-300/80 break-all">
                    {errorMessage}
                  </p>
                </div>
              )}

              {/* Success Message */}
              {stage === 'done' && resultMessage && !syncResults.length && (
                <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4 mt-4">
                  <p className="text-sm text-green-400 font-medium mb-1">
                    Complete
                  </p>
                  <p className="text-xs text-green-300/80">{resultMessage}</p>
                </div>
              )}

              {/* Reset Button */}
              {(stage === 'done' || stage === 'error') && (
                <Button
                  variant="outline"
                  className="w-full mt-4"
                  onClick={() => {
                    setStage('idle');
                    setErrorMessage('');
                    setResultMessage('');
                    setSyncResults([]);
                  }}
                >
                  Sync Again
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
