import { useState } from 'react';
import {
  Subtitles,
  Languages,
  Zap,
  Play,
  CheckCircle2,
  XCircle,
  Loader2,
  AudioWaveform,
  SplitSquareHorizontal,
  Timer,
} from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Card, CardContent } from '../../components/ui/card';
import { Label } from '../../components/ui/label';
import { Input } from '../../components/ui/input';
import { Slider } from '../../components/ui/slider';
import { Switch } from '../../components/ui/switch';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';

const LANGUAGES = [
  { value: '', label: 'Original (No Translation)' },
  { value: 'Hebrew', label: 'עברית — Hebrew' },
  { value: 'English', label: 'English' },
  { value: 'Spanish', label: 'Español — Spanish' },
  { value: 'French', label: 'Français — French' },
  { value: 'Arabic', label: 'العربية — Arabic' },
  { value: 'Russian', label: 'Русский — Russian' },
  { value: 'Portuguese', label: 'Português — Portuguese' },
  { value: 'German', label: 'Deutsch — German' },
  { value: 'Japanese', label: '日本語 — Japanese' },
  { value: 'Korean', label: '한국어 — Korean' },
  { value: 'Chinese', label: '中文 — Chinese' },
  { value: 'Italian', label: 'Italiano — Italian' },
  { value: 'Turkish', label: 'Türkçe — Turkish' },
  { value: 'Hindi', label: 'हिन्दी — Hindi' },
];

const VAD_MODES = [
  {
    value: 'low',
    label: 'Normal',
    description: 'Standard segmentation — good for clear speech',
  },
  {
    value: 'high',
    label: 'Sensitive',
    description: 'Catches more speech — use if words are cut off',
  },
];

type PipelineStage =
  | 'idle'
  | 'rendering'
  | 'vad'
  | 'transcribing'
  | 'translating'
  | 'importing'
  | 'done'
  | 'error';

const STAGE_LABELS: Record<PipelineStage, string> = {
  idle: 'Ready',
  rendering: 'Rendering audio from timeline…',
  vad: 'Detecting speech segments…',
  transcribing: 'Transcribing audio via Whisper…',
  translating: 'Translating subtitles…',
  importing: 'Importing subtitles into timeline…',
  done: 'Subtitles generated successfully!',
  error: 'An error occurred.',
};

const STAGE_ORDER: PipelineStage[] = [
  'rendering',
  'vad',
  'transcribing',
  'translating',
  'importing',
  'done',
];

export function SubtitlesDashboard() {
  const [language, setLanguage] = useState('');
  const [customLanguage, setCustomLanguage] = useState('');
  const [maxWords, setMaxWords] = useState(5);
  const [vadSensitivity, setVadSensitivity] = useState('low');
  const [animation, setAnimation] = useState(false);
  const [useTimeRange, setUseTimeRange] = useState(false);
  const [startSeconds, setStartSeconds] = useState('');
  const [endSeconds, setEndSeconds] = useState('');

  const [stage, setStage] = useState<PipelineStage>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [resultMessage, setResultMessage] = useState('');

  const isRunning = !['idle', 'done', 'error'].includes(stage);

  const handleGenerate = async () => {
    setStage('rendering');
    setErrorMessage('');
    setResultMessage('');

    const targetLanguage = language === '_custom' ? customLanguage : language;

    try {
      const response = await fetch(
        'http://localhost:3001/api/subtitles/generate',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            target_language: targetLanguage || undefined,
            max_words_per_chunk: animation ? 1 : maxWords,
            vad_sensitivity: vadSensitivity,
            animation,
            start_seconds:
              useTimeRange && startSeconds
                ? parseFloat(startSeconds)
                : undefined,
            end_seconds:
              useTimeRange && endSeconds ? parseFloat(endSeconds) : undefined,
          }),
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
        data.message || 'Subtitles generated and imported successfully!'
      );
    } catch (err) {
      setStage('error');
      setErrorMessage(err instanceof Error ? err.message : String(err));
    }
  };

  const currentStageIndex = STAGE_ORDER.indexOf(stage);

  return (
    <div className="flex flex-col h-full bg-background border-l relative overflow-hidden">
      {/* Header */}
      <div className="p-4 md:p-6 pb-2 md:pb-2 border-b flex items-center justify-between shrink-0 bg-card/50">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Subtitles className="h-5 w-5 text-primary" />
            Subtitle Studio
          </h2>
          <p className="text-xs md:text-sm text-muted-foreground mt-1">
            Auto-generate and translate subtitles from your timeline audio
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-hidden flex flex-col md:flex-row relative">
        {/* Left Control Panel */}
        <div className="w-full md:w-[340px] lg:w-[400px] shrink-0 flex flex-col border-b md:border-b-0 md:border-r border-border/50 bg-card/10 overflow-y-auto custom-scrollbar">
          <div className="p-4 md:p-6 flex flex-col gap-4 md:gap-5">
            {/* Language Selection */}
            <Card className="shadow-sm border-border/50">
              <CardContent className="p-4 space-y-4">
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Languages className="h-3.5 w-3.5" />
                    Target Language
                  </Label>
                  <Select
                    value={language}
                    onValueChange={(val) => setLanguage(val ?? '')}
                  >
                    <SelectTrigger
                      id="subtitle-language"
                      className="w-full bg-muted/20"
                    >
                      <SelectValue placeholder="Select language…" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectLabel>Common Languages</SelectLabel>
                        {LANGUAGES.map((lang) => (
                          <SelectItem
                            key={lang.value}
                            value={lang.value || '_original'}
                          >
                            {lang.label}
                          </SelectItem>
                        ))}
                        <SelectItem value="_custom">Custom…</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  {language === '_custom' && (
                    <Input
                      id="subtitle-custom-language"
                      placeholder="Type language name (e.g. Thai, Swahili)"
                      value={customLanguage}
                      onChange={(e) => setCustomLanguage(e.target.value)}
                      className="bg-muted/20 mt-2"
                    />
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Words Per Group */}
            <Card className="shadow-sm border-border/50">
              <CardContent className="p-4 space-y-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                      <SplitSquareHorizontal className="h-3.5 w-3.5" />
                      Words Per Group
                    </Label>
                    <span className="text-sm font-bold tabular-nums bg-muted px-2 py-0.5 rounded min-w-[32px] text-center">
                      {animation ? 1 : maxWords}
                    </span>
                  </div>
                  <Slider
                    id="subtitle-max-words"
                    min={1}
                    max={15}
                    step={1}
                    value={[maxWords]}
                    onValueChange={(val) => {
                      const arr = Array.isArray(val) ? val : [val];
                      setMaxWords(arr[0]);
                    }}
                    disabled={animation}
                    className={animation ? 'opacity-40' : ''}
                  />
                  <div className="flex justify-between text-[10px] text-muted-foreground font-mono">
                    <span>1</span>
                    <span>5</span>
                    <span>10</span>
                    <span>15</span>
                  </div>
                  {animation && (
                    <p className="text-[10px] text-muted-foreground italic">
                      Animation mode forces 1 word per group
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* VAD Sensitivity */}
            <Card className="shadow-sm border-border/50">
              <CardContent className="p-4 space-y-3">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <AudioWaveform className="h-3.5 w-3.5" />
                  Segmentation Sensitivity
                </Label>
                <div className="grid grid-cols-2 gap-2">
                  {VAD_MODES.map((mode) => (
                    <div
                      key={mode.value}
                      onClick={() => setVadSensitivity(mode.value)}
                      className={`p-3 rounded-lg border-2 cursor-pointer transition-all ${
                        vadSensitivity === mode.value
                          ? 'border-primary bg-primary/5 shadow-sm'
                          : 'border-transparent hover:bg-muted/50'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-sm">
                          {mode.label}
                        </span>
                        {vadSensitivity === mode.value && (
                          <div className="h-2 w-2 rounded-full bg-primary" />
                        )}
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-1 leading-tight">
                        {mode.description}
                      </p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Animation Toggle */}
            <Card className="shadow-sm border-border/50">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex flex-col gap-1">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                      <Zap className="h-3.5 w-3.5" />
                      Word-by-Word Animation
                    </Label>
                    <p className="text-[10px] text-muted-foreground">
                      TikTok-style subtitles — one word at a time
                    </p>
                  </div>
                  <Switch
                    id="subtitle-animation"
                    checked={animation}
                    onCheckedChange={setAnimation}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Time Range (Optional) */}
            <Card className="shadow-sm border-border/50">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Timer className="h-3.5 w-3.5" />
                    Time Range (Optional)
                  </Label>
                  <Switch
                    id="subtitle-use-timerange"
                    size="sm"
                    checked={useTimeRange}
                    onCheckedChange={setUseTimeRange}
                  />
                </div>
                {useTimeRange && (
                  <div className="flex gap-3 mt-2">
                    <div className="flex-1 space-y-1">
                      <Label
                        htmlFor="subtitle-start"
                        className="text-[10px] text-muted-foreground"
                      >
                        Start (sec)
                      </Label>
                      <Input
                        id="subtitle-start"
                        type="number"
                        min="0"
                        step="0.1"
                        placeholder="0"
                        value={startSeconds}
                        onChange={(e) => setStartSeconds(e.target.value)}
                        className="bg-muted/20"
                      />
                    </div>
                    <div className="flex-1 space-y-1">
                      <Label
                        htmlFor="subtitle-end"
                        className="text-[10px] text-muted-foreground"
                      >
                        End (sec)
                      </Label>
                      <Input
                        id="subtitle-end"
                        type="number"
                        min="0"
                        step="0.1"
                        placeholder="End of timeline"
                        value={endSeconds}
                        onChange={(e) => setEndSeconds(e.target.value)}
                        className="bg-muted/20"
                      />
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Generate Button */}
            <Button
              id="subtitle-generate-btn"
              onClick={handleGenerate}
              className="w-full gap-2 min-h-[48px] font-medium rounded-lg text-sm"
              disabled={isRunning}
            >
              {isRunning ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Processing…
                </>
              ) : (
                <>
                  <Play className="h-4 w-4" />
                  Generate Subtitles
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Right Status Panel */}
        <div className="flex-1 flex flex-col bg-muted/10 overflow-y-auto relative p-6 md:p-8">
          {stage === 'idle' ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground opacity-50">
              <Subtitles className="h-16 w-16 mb-4 stroke-[1.5]" />
              <p className="font-medium">No subtitles generated yet</p>
              <p className="text-xs mt-1">
                Configure settings and click Generate
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

              {/* Error Message */}
              {stage === 'error' && errorMessage && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 mt-4">
                  <p className="text-sm text-red-400 font-medium mb-1">Error</p>
                  <p className="text-xs text-red-300/80 break-all">
                    {errorMessage}
                  </p>
                </div>
              )}

              {/* Success Message */}
              {stage === 'done' && resultMessage && (
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
                  }}
                >
                  Generate Again
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
