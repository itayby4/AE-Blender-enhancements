// ── @pipefx/skills-builtin — AutoPod bundled UI ──────────────────────────
// Phase 12.11: AutoPod Studio (formerly
// `apps/desktop/src/features/autopod/AutopodDashboard.tsx`) ships as a
// `component`-mode skill alongside Subtitles and Audio Sync.
//
// The component owns its workflow + state and posts directly to
//   POST http://localhost:3001/api/autopod/discover
//   POST http://localhost:3001/api/autopod/run
// Skill inputs declared in SKILL.md are intentionally empty — the user
// interaction (sync + mapping table + run button) lives in the bundled
// UI. The `app_target` is hardcoded to `resolve` for now; the Premiere
// connector is a placeholder this phase, so multi-target picking is
// deferred until a real Premiere MCP exists.

import { useState } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '../../_ui/card.js';
import { Button } from '../../_ui/button.js';
import { Label } from '../../_ui/label.js';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../_ui/select.js';
import {
  Settings,
  Play,
  Video,
  Mic,
  Plus,
  Trash2,
  RefreshCw,
  Loader2,
} from 'lucide-react';
import { cn } from '../../_ui/lib/cn.js';

interface MappingRow {
  id: string;
  audioLabel: string; // Display name for the audio channel
  audioValue: string; // Actual path (possibly with ?ch=N)
  cameraId: string; // Which camera this mic maps to
}

interface DiscoveryData {
  cameras: { id: string; name: string; path: string }[];
  audio_sources: { path: string; name: string; channels: number }[];
  fps: number;
  duration_sec: number;
}

// `BundledSkillProps` (runId, skillId, inputs, onComplete, getToken) is
// host-injected at mount. We accept `getToken` so both `/api/autopod/*`
// fetches can attach the host's Bearer JWT.
export interface AutopodSkillProps {
  getToken?: () => Promise<string | null>;
}

export default function AutopodSkill({ getToken }: AutopodSkillProps = {}) {
  // The autopod backend supports both 'resolve' and 'premiere' app targets,
  // but Premiere is a placeholder MCP this phase. SKILL.md restricts the
  // required tools to the `resolve` connector, so we pin the target.
  const activeApp = 'resolve';

  const [mappings, setMappings] = useState<MappingRow[]>([]);
  const [fallback, setFallback] = useState('1');
  const [useGenerative, setUseGenerative] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [status, setStatus] = useState('');
  const [discoveryData, setDiscoveryData] = useState<DiscoveryData | null>(
    null
  );

  const handleRemoveMapping = (id: string) => {
    setMappings(mappings.filter((m) => m.id !== id));
  };

  const handleChangeCamera = (id: string, cameraId: string) => {
    setMappings(mappings.map((m) => (m.id === id ? { ...m, cameraId } : m)));
  };

  const handleSync = async () => {
    setIsSyncing(true);
    setStatus('Syncing with NLE timeline...');
    try {
      const token = getToken ? await getToken() : null;
      const response = await fetch(
        'http://localhost:3001/api/autopod/discover',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ app_target: activeApp }),
        }
      );

      if (!response.ok) throw new Error('Failed to connect to backend');

      const data = await response.json();

      if (data.error) throw new Error(data.error);

      setDiscoveryData(data);

      // Auto-populate one row per audio channel
      const newMappings: MappingRow[] = [];
      let idx = 0;
      for (const src of (data.audio_sources ?? []) as DiscoveryData['audio_sources']) {
        if (src.channels === 1) {
          idx++;
          newMappings.push({
            id: `ch_${idx}`,
            audioLabel: src.name,
            audioValue: src.path,
            cameraId: '',
          });
        } else {
          for (let ch = 1; ch <= src.channels; ch++) {
            idx++;
            newMappings.push({
              id: `ch_${idx}`,
              audioLabel: `${src.name} (Ch ${ch})`,
              audioValue: `${src.path}?ch=${ch}`,
              cameraId: '',
            });
          }
        }
      }
      setMappings(newMappings);

      setStatus(
        `Timeline synced: ${data.cameras?.length || 0} cameras, ${idx} audio channel(s) found.`
      );
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setStatus(`Sync Error: ${msg}`);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleRun = async () => {
    setIsRunning(true);
    setStatus('Initializing AutoPod engine...');

    // Transform: each row is Audio→Camera. Backend expects Camera→[Audio1, Audio2, ...]
    const mappingDict: Record<string, string[]> = {};
    for (const m of mappings) {
      if (!m.cameraId || !m.audioValue) continue;
      if (!mappingDict[m.cameraId]) mappingDict[m.cameraId] = [];
      mappingDict[m.cameraId].push(m.audioValue);
    }

    try {
      setStatus(
        'Processing pipeline... this involves XML export and VAD analysis.'
      );

      const token = getToken ? await getToken() : null;
      const response = await fetch('http://localhost:3001/api/autopod/run', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          app_target: activeApp,
          mapping_json: JSON.stringify(mappingDict),
          fallback: String(fallback),
          use_generative: useGenerative,
        }),
      });

      if (!response.ok) throw new Error('Failed to connect to backend');

      const resData = await response.json();
      if (resData.error) {
        setStatus(
          `Error: ${resData.error}${resData.xml_path ? '\nXML saved at: ' + resData.xml_path : ''}`
        );
      } else {
        setStatus(
          `Completed! ${resData.message || 'Pipeline finished successfully.'}`
        );
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setStatus(`Error: ${msg}`);
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col p-6 overflow-y-auto space-y-6">
      <div className="max-w-4xl mx-auto w-full">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">
              AutoPod Studio
            </h2>
            <p className="text-sm text-muted-foreground">
              Automated multi-camera editing — AI mapping + local VAD precision
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="gap-2 border-primary/20 hover:bg-primary/5"
            onClick={handleSync}
            disabled={isSyncing || isRunning}
          >
            {isSyncing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Sync with Timeline
          </Button>
        </div>

        <div className="grid grid-cols-3 gap-6">
          <div className="col-span-2 space-y-6">
            <Card className="border-border/50 shadow-sm">
              <CardHeader className="bg-muted/30 pb-4 border-b">
                <CardTitle className="text-lg">Participant Mapping</CardTitle>
                <CardDescription>
                  {useGenerative
                    ? 'AI will automatically map cameras to microphones.'
                    : discoveryData
                      ? 'Assign each audio channel (microphone) to the camera showing that speaker.'
                      : 'Click "Sync with Timeline" to auto-detect your audio channels and cameras.'}
                </CardDescription>
              </CardHeader>
              <CardContent className="p-6 space-y-4">
                {!useGenerative && mappings.length > 0 && (
                  <div className="flex items-center gap-3 px-3 pb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    <div className="w-5" />
                    <div className="flex-1">Audio Channel (Mic)</div>
                    <div className="w-4" />
                    <div className="w-[130px]">Assigned Camera</div>
                    <div className="w-8" />
                  </div>
                )}

                {!useGenerative &&
                  mappings.map((mapping) => (
                    <div
                      key={mapping.id}
                      className="flex items-center gap-3 bg-muted/20 p-3 rounded-lg border"
                    >
                      <Mic className="h-4 w-4 text-muted-foreground shrink-0" />

                      <div
                        className="flex-1 text-xs font-mono truncate"
                        title={mapping.audioValue}
                      >
                        {mapping.audioLabel ||
                          mapping.audioValue ||
                          'No audio source'}
                      </div>

                      <div className="h-px w-4 bg-border shrink-0"></div>

                      <div className="flex items-center gap-2 shrink-0">
                        <Video className="h-4 w-4 text-muted-foreground" />
                        <Select
                          value={mapping.cameraId || null}
                          onValueChange={(v) => {
                            if (v) handleChangeCamera(mapping.id, String(v));
                          }}
                        >
                          <SelectTrigger className="w-[130px] h-8 text-xs">
                            <SelectValue placeholder="Select Camera" />
                          </SelectTrigger>
                          <SelectContent>
                            {discoveryData
                              ? discoveryData.cameras.map((c) => (
                                  <SelectItem key={c.id} value={c.id}>
                                    Camera {c.id}
                                  </SelectItem>
                                ))
                              : ['1', '2', '3', '4'].map((v) => (
                                  <SelectItem key={v} value={v}>
                                    Camera {v}
                                  </SelectItem>
                                ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:bg-destructive/10 shrink-0"
                        onClick={() => handleRemoveMapping(mapping.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}

                {!useGenerative && !discoveryData && (
                  <Button
                    variant="outline"
                    className="w-full border-dashed"
                    onClick={() => {
                      const newId = Date.now().toString();
                      setMappings([
                        ...mappings,
                        {
                          id: newId,
                          audioLabel: '',
                          audioValue: '',
                          cameraId: '1',
                        },
                      ]);
                    }}
                  >
                    <Plus className="h-4 w-4 mr-2" /> Add Participant
                  </Button>
                )}

                <div className="pt-4 border-t border-border/50 mt-4">
                  <div className="flex items-center gap-2 mb-4">
                    <input
                      type="checkbox"
                      id="useGenerative"
                      checked={useGenerative}
                      onChange={(e) => setUseGenerative(e.target.checked)}
                      className="accent-primary h-4 w-4"
                    />
                    <Label
                      htmlFor="useGenerative"
                      className="font-semibold text-primary"
                    >
                      Use &quot;Sentient Director&quot; (Full AI Mapping)
                    </Label>
                  </div>

                  {useGenerative && (
                    <div className="space-y-4 p-4 bg-primary/5 rounded-lg border border-primary/20 mt-4">
                      <p className="text-xs text-muted-foreground">
                        <strong>Hybrid AI Mode:</strong> Automatically detects
                        your cameras and mics, maps them using 15-second proxy
                        clips, and then cuts the full sequence locally. Zero
                        manual setup required.
                      </p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/50 shadow-sm">
              <CardHeader className="bg-muted/30 pb-4 border-b">
                <CardTitle className="text-lg">Sequence Fallbacks</CardTitle>
                <CardDescription>
                  Define overlap and silence resolution.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-6 grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs font-semibold">
                    Fallback Camera
                  </Label>
                  <Select
                    value={fallback}
                    onValueChange={(v) => {
                      if (v) setFallback(String(v));
                    }}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Select fallback camera" />
                    </SelectTrigger>
                    <SelectContent>
                      {discoveryData
                        ? discoveryData.cameras.map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              Camera {c.id}
                            </SelectItem>
                          ))
                        : ['1', '2', '3'].map((v) => (
                            <SelectItem key={v} value={v}>
                              Camera {v}
                            </SelectItem>
                          ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[10px] text-muted-foreground">
                    Used during silence or cross-talk overlap.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="col-span-1 space-y-6">
            <Card
              className={cn(
                'border-border/50 shadow-sm border-primary/20',
                isRunning ? 'bg-primary/5' : 'bg-card'
              )}
            >
              <CardHeader className="pb-4">
                <CardTitle className="text-lg flex items-center gap-2">
                  {isRunning ? (
                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  ) : (
                    <Settings className="h-5 w-5 text-primary" />
                  )}
                  System Execution
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Button
                  className="w-full gap-2 font-semibold"
                  size="lg"
                  onClick={handleRun}
                  disabled={isRunning || isSyncing}
                >
                  <Play className="h-4 w-4 fill-current" />
                  {isRunning ? 'Processing...' : 'Run AutoPod Edit'}
                </Button>

                {status && (
                  <div className="p-3 bg-background border rounded text-xs font-mono break-words text-muted-foreground shadow-inner">
                    {status}
                  </div>
                )}

                {!discoveryData && !useGenerative && (
                  <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded text-[10px] text-yellow-600">
                    <strong>Tip:</strong> Click &quot;Sync with Timeline&quot; to
                    auto-detect your participants and cameras.
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
