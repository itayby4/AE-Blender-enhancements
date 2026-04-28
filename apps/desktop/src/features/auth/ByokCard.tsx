/**
 * PipeFX Desktop — BYOK (Bring Your Own Keys) Card.
 *
 * Displays the "Your API Keys" option during sign-up Step 2.
 * Users can optionally enter their provider API keys which are
 * saved via the backend settings endpoint.
 */

import { useState } from 'react';
import { Key, Eye, EyeOff, Check, Save, Loader2 } from 'lucide-react';
import { cn } from '../../lib/utils.js';

interface ByokCardProps {
  isSelected: boolean;
  onSelect: () => void;
  onSave: (keys: { gemini: string; openai: string; anthropic: string }) => Promise<void>;
}

export function ByokCard({ isSelected, onSelect, onSave }: ByokCardProps) {
  const [geminiKey, setGeminiKey] = useState('');
  const [openaiKey, setOpenaiKey] = useState('');
  const [anthropicKey, setAnthropicKey] = useState('');
  const [showKeys, setShowKeys] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved'>('idle');

  const hasAnyKey = !!(geminiKey.trim() || openaiKey.trim() || anthropicKey.trim());

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave({
        gemini: geminiKey.trim(),
        openai: openaiKey.trim(),
        anthropic: anthropicKey.trim(),
      });
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch {
      // Error handled by parent
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'group relative flex flex-col text-left rounded-xl border p-5 transition-all duration-300',
        'hover:shadow-lg',
        isSelected
          ? 'border-primary/60 bg-primary/5 ring-2 ring-primary/30 shadow-lg'
          : 'border-border bg-card hover:border-primary/30 hover:bg-muted/30'
      )}
    >
      {/* Header */}
      <div className="flex items-start gap-3 mb-4">
        <div
          className={cn(
            'flex h-10 w-10 items-center justify-center rounded-lg transition-colors shrink-0',
            isSelected
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary'
          )}
        >
          <Key className="h-5 w-5" strokeWidth={1.75} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-foreground">
            Bring Your Own Keys
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            Use your own API keys for direct provider access.
            No usage limits or fees.
          </div>
        </div>
        {isSelected && (
          <div className="h-2.5 w-2.5 rounded-full bg-primary shrink-0 mt-1" />
        )}
      </div>

      {/* Features */}
      <div className="space-y-1.5 mb-4 pl-1">
        {[
          'Direct provider access',
          'No usage limits or markup',
          'Keys stored locally only',
          'Supports Gemini, OpenAI, Anthropic',
        ].map((feat) => (
          <div
            key={feat}
            className="flex items-center gap-2 text-xs text-muted-foreground"
          >
            <Check className="h-3 w-3 text-primary shrink-0" />
            <span>{feat}</span>
          </div>
        ))}
      </div>

      {/* Key Entry — only when selected */}
      {isSelected && (
        <div
          className="space-y-3 animate-panel-enter"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Show/Hide Toggle */}
          <div className="flex items-center justify-end">
            <button
              type="button"
              onClick={() => setShowKeys(!showKeys)}
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {showKeys ? (
                <EyeOff className="h-3 w-3" />
              ) : (
                <Eye className="h-3 w-3" />
              )}
              {showKeys ? 'Hide' : 'Show'}
            </button>
          </div>

          {/* Key Fields */}
          <div className="space-y-2.5">
            <KeyField
              id="signup-gemini"
              label="Google Gemini"
              value={geminiKey}
              onChange={setGeminiKey}
              show={showKeys}
              placeholder="AIza..."
            />
            <KeyField
              id="signup-openai"
              label="OpenAI"
              value={openaiKey}
              onChange={setOpenaiKey}
              show={showKeys}
              placeholder="sk-..."
            />
            <KeyField
              id="signup-anthropic"
              label="Anthropic"
              value={anthropicKey}
              onChange={setAnthropicKey}
              show={showKeys}
              placeholder="sk-ant-..."
            />
          </div>

          <p className="text-[11px] text-muted-foreground/70 leading-relaxed">
            You only need one key to get started. Keys are stored on your device
            and never leave your machine.
          </p>

          {/* Save Button */}
          <button
            type="button"
            disabled={isSaving || !hasAnyKey}
            onClick={handleSave}
            className={cn(
              'w-full inline-flex items-center justify-center gap-2 h-10 rounded-lg px-4',
              'bg-primary text-primary-foreground font-medium text-sm',
              'hover:bg-primary/90 transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              'disabled:opacity-50 disabled:cursor-not-allowed'
            )}
          >
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving…
              </>
            ) : saveStatus === 'saved' ? (
              <>
                <Check className="h-4 w-4" />
                Saved!
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
                Save &amp; Continue
              </>
            )}
          </button>
        </div>
      )}
    </button>
  );
}

// ──────────────────────────────────────────────

function KeyField({
  id,
  label,
  value,
  onChange,
  show,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  show: boolean;
  placeholder: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-xs font-medium text-muted-foreground">
        {label}
      </label>
      <input
        id={id}
        type={show ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(
          'flex h-9 w-full rounded-lg border border-input bg-background px-3 py-1.5',
          'text-xs font-mono placeholder:text-muted-foreground/50',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          'disabled:cursor-not-allowed disabled:opacity-50'
        )}
      />
    </div>
  );
}
