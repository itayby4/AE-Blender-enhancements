import { useState, useEffect } from 'react';
import {
  X,
  Key,
  Palette,
  Info,
  Eye,
  EyeOff,
  Save,
  Square,
  Squircle,
} from 'lucide-react';
import { PipeFxLogo } from '../../components/brand/PipeFxLogo.js';
import { Button } from '../../components/ui/button.js';
import { Input } from '../../components/ui/input.js';
import { Label } from '../../components/ui/label.js';
import { cn } from '../../lib/utils.js';
import { PalettePicker } from './PalettePicker.js';
import { PaletteEditor } from './PaletteEditor.js';
import { applyPalette } from '../../lib/palette-runtime.js';
import type { CustomPalette } from '../../lib/palette-runtime.js';
import type { CornerMode } from '../../lib/corners-runtime.js';
import { fetchSettings, updateSettings } from '../../lib/api.js';

interface SettingsPageProps {
  onClose: () => void;
  activePalette: string;
  onPaletteChange: (id: string) => void;
  cornerMode: CornerMode;
  onCornerModeChange: (mode: CornerMode) => void;
}

type Tab = 'appearance' | 'api-keys' | 'about';

/**
 * SettingsPage — Full-screen settings view.
 * Tabs: Appearance (palette picker + editor), API Keys, About.
 */
export function SettingsPage({
  onClose,
  activePalette,
  onPaletteChange,
  cornerMode,
  onCornerModeChange,
}: SettingsPageProps) {
  const [activeTab, setActiveTab] = useState<Tab>('appearance');
  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [openaiApiKey, setOpenaiApiKey] = useState('');
  const [anthropicApiKey, setAnthropicApiKey] = useState('');
  const [showKeys, setShowKeys] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle');

  // Custom palette state
  const [customPalettes, setCustomPalettes] = useState<CustomPalette[]>([]);
  const [editorState, setEditorState] = useState<
    | { open: false }
    | { open: true; editing: CustomPalette | null }
  >({ open: false });

  useEffect(() => {
    fetchSettings()
      .then((data) => {
        setGeminiApiKey(data.geminiApiKey || '');
        setOpenaiApiKey(data.openaiApiKey || '');
        setAnthropicApiKey(data.anthropicApiKey || '');
        if (Array.isArray(data.customPalettes)) {
          setCustomPalettes(data.customPalettes);
        }
      })
      .catch(console.error);
  }, []);

  const handleSaveKeys = async () => {
    setIsSaving(true);
    try {
      await updateSettings({
        geminiApiKey: geminiApiKey.trim(),
        openaiApiKey: openaiApiKey.trim(),
        anthropicApiKey: anthropicApiKey.trim(),
      });
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch {
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 3000);
    } finally {
      setIsSaving(false);
    }
  };

  const handlePaletteChange = async (id: string) => {
    onPaletteChange(id);
    applyPalette(id, customPalettes);
    try {
      await updateSettings({ activePalette: id });
    } catch {
      // Silently ignore — palette is already applied visually
    }
  };

  const handleSaveCustomPalette = async (palette: CustomPalette) => {
    const updated = editorState.open && (editorState as any).editing
      ? customPalettes.map((p) => (p.id === palette.id ? palette : p))
      : [...customPalettes, palette];

    setCustomPalettes(updated);
    setEditorState({ open: false });

    // Apply instantly if this is the active palette
    if (activePalette === palette.id) {
      applyPalette(palette.id, updated);
    }

    try {
      await updateSettings({ customPalettes: updated });
    } catch (err) {
      console.error('[Settings] Failed to persist custom palettes', err);
    }
  };

  const handleDeleteCustomPalette = async (id: string) => {
    const updated = customPalettes.filter((p) => p.id !== id);
    setCustomPalettes(updated);

    // If deleted palette was active, fall back to default
    if (activePalette === id) {
      handlePaletteChange('cool-teal');
    }

    try {
      await updateSettings({ customPalettes: updated });
    } catch (err) {
      console.error('[Settings] Failed to persist palette deletion', err);
    }
  };

  const tabs: { id: Tab; label: string; icon: typeof Palette }[] = [
    { id: 'appearance', label: 'Appearance', icon: Palette },
    { id: 'api-keys', label: 'API Keys', icon: Key },
    { id: 'about', label: 'About', icon: Info },
  ];

  return (
    <div className="flex flex-col h-full bg-card rounded-xl border overflow-hidden animate-panel-enter">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b shrink-0">
        <h2 className="text-base font-semibold tracking-tight">Settings</h2>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Sidebar tabs */}
        <nav className="w-44 border-r bg-muted/20 p-3 flex flex-col gap-1 shrink-0">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors text-left',
                  activeTab === tab.id
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                <Icon className="w-4 h-4 shrink-0" />
                {tab.label}
              </button>
            );
          })}
        </nav>

        {/* Content */}
        <div className="flex-1 min-h-0 overflow-y-auto p-6">
          {/* ── Appearance ── */}
          {activeTab === 'appearance' && (
            <div className="max-w-2xl space-y-8">
              <div>
                <h3 className="text-sm font-semibold mb-1">Color Palette</h3>
                <p className="text-xs text-muted-foreground mb-4">
                  Select a built-in theme or create your own. Changes apply instantly.
                </p>

                {editorState.open ? (
                  <PaletteEditor
                    initial={(editorState as any).editing}
                    existingIds={[
                      'cool-teal', 'warm-amber', 'violet-dusk', 'neutral',
                      ...customPalettes.map((p) => p.id),
                    ]}
                    onSave={handleSaveCustomPalette}
                    onCancel={() => setEditorState({ open: false })}
                  />
                ) : (
                  <PalettePicker
                    activePalette={activePalette}
                    customPalettes={customPalettes}
                    onChange={handlePaletteChange}
                    onEditCustom={(p) => setEditorState({ open: true, editing: p })}
                    onDeleteCustom={handleDeleteCustomPalette}
                    onCreateNew={() => setEditorState({ open: true, editing: null })}
                  />
                )}
              </div>

              {/* ── Corner Shape ── */}
              <div>
                <h3 className="text-sm font-semibold mb-1">Corner Shape</h3>
                <p className="text-xs text-muted-foreground mb-4">
                  Choose between rounded or sharp corners throughout the app.
                </p>

                <div className="grid grid-cols-2 gap-3 max-w-md">
                  <CornerOption
                    active={cornerMode === 'rounded'}
                    onClick={() => onCornerModeChange('rounded')}
                    icon={Squircle}
                    label="Rounded"
                    description="Soft, modern edges"
                  />
                  <CornerOption
                    active={cornerMode === 'sharp'}
                    onClick={() => onCornerModeChange('sharp')}
                    icon={Square}
                    label="Sharp"
                    description="Crisp, angular edges"
                  />
                </div>
              </div>
            </div>
          )}

          {/* ── API Keys ── */}
          {activeTab === 'api-keys' && (
            <div className="max-w-lg space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold mb-1">AI Provider Keys</h3>
                  <p className="text-xs text-muted-foreground">
                    Keys are stored locally and never sent to third parties.
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 gap-1.5 text-muted-foreground"
                  onClick={() => setShowKeys(!showKeys)}
                >
                  {showKeys ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  {showKeys ? 'Hide' : 'Show'}
                </Button>
              </div>

              <div className="space-y-4">
                <ApiKeyField
                  id="gemini"
                  label="Google Gemini"
                  value={geminiApiKey}
                  onChange={setGeminiApiKey}
                  show={showKeys}
                  placeholder="AIzaSy..."
                  hint="Required for AI chat. Get it at aistudio.google.com"
                />
                <ApiKeyField
                  id="openai"
                  label="OpenAI"
                  value={openaiApiKey}
                  onChange={setOpenaiApiKey}
                  show={showKeys}
                  placeholder="sk-..."
                  hint="Optional. For GPT-4 model access."
                />
                <ApiKeyField
                  id="anthropic"
                  label="Anthropic"
                  value={anthropicApiKey}
                  onChange={setAnthropicApiKey}
                  show={showKeys}
                  placeholder="sk-ant-..."
                  hint="Optional. For Claude model access."
                />
              </div>

              <div className="flex items-center gap-3 pt-2">
                <Button onClick={handleSaveKeys} disabled={isSaving} className="gap-2">
                  <Save className="w-4 h-4" />
                  {isSaving ? 'Saving...' : 'Save Keys'}
                </Button>
                {saveStatus === 'saved' && (
                  <span className="text-sm text-success font-medium">Saved</span>
                )}
                {saveStatus === 'error' && (
                  <span className="text-sm text-destructive font-medium">Save failed. Is the backend running?</span>
                )}
              </div>
            </div>
          )}

          {/* ── About ── */}
          {activeTab === 'about' && (
            <div className="max-w-lg space-y-6">
              <div className="flex items-center gap-4">
                <PipeFxLogo className="h-20 w-20 text-foreground" title="PipeFX logo" />
                <div>
                  <div className="text-xl font-bold tracking-tight">PipeFX</div>
                  <div className="text-sm text-muted-foreground">Creative Director's Command Center</div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Version', value: '0.1.0' },
                  { label: 'Framework', value: 'Tauri 2 + React 19' },
                  { label: 'AI Engine', value: 'Gemini + MCP' },
                  { label: 'License', value: 'Proprietary' },
                ].map((item) => (
                  <div key={item.label} className="bg-muted/30 rounded-lg p-3">
                    <div className="text-xs text-muted-foreground mb-0.5">{item.label}</div>
                    <div className="text-sm font-medium font-mono">{item.value}</div>
                  </div>
                ))}
              </div>

              <p className="text-xs text-muted-foreground leading-relaxed">
                PipeFX connects your AI assistant directly to professional creative tools — DaVinci Resolve, Adobe Premiere, After Effects, Blender, and more — via the Model Context Protocol.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────

function ApiKeyField({
  id, label, value, onChange, show, placeholder, hint,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  show: boolean;
  placeholder: string;
  hint: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-sm font-medium">{label}</Label>
      <Input
        id={id}
        type={show ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="font-mono text-sm bg-muted/40 border-border/50"
      />
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

// ──────────────────────────────────────────────

function CornerOption({
  active,
  onClick,
  icon: Icon,
  label,
  description,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof Square;
  label: string;
  description: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group relative flex flex-col items-start gap-2 rounded-lg border p-4 text-left transition-all',
        active
          ? 'border-primary bg-primary/5 ring-2 ring-primary/30'
          : 'border-border bg-card hover:border-primary/40 hover:bg-muted/40'
      )}
    >
      <div
        className={cn(
          'flex h-9 w-9 items-center justify-center rounded-md transition-colors',
          active
            ? 'bg-primary text-primary-foreground'
            : 'bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary'
        )}
      >
        <Icon className="h-5 w-5" strokeWidth={1.75} />
      </div>
      <div>
        <div className="text-sm font-semibold">{label}</div>
        <div className="text-xs text-muted-foreground">{description}</div>
      </div>
      {active && (
        <div className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-primary" />
      )}
    </button>
  );
}
