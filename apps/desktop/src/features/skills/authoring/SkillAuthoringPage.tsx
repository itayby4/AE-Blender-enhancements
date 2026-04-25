// ── apps/desktop — SkillAuthoringPage ────────────────────────────────────
// The "create or edit a skill" page. Composes the headless authoring
// primitives from `@pipefx/skills/ui` with the desktop's shadcn chrome
// and the Monaco-backed prompt editor from `./SkillTemplateEditor`.
//
// Two modes:
//   • New — `initial` prop is undefined; the form starts empty.
//   • Edit — `initial` is an InstalledSkill; the form pre-populates from
//     its manifest. Saving with the same id replaces the install (the
//     backend store is keyed on id). The id field is locked in edit mode
//     because changing it is effectively a fresh install — a footgun the
//     UI shouldn't make easy.
//
// Save flow:
//   1. User clicks "Save Local" → POST to `/api/skills/install` with
//      `source: 'local'` via `useSkills().install()`.
//   2. On success, the parent page closes the editor (via `onSaved`).
//   3. The library refreshes via the same refresh-tick pattern used by
//      the import flow.
//
// Export flow:
//   1. User clicks "Export .pfxskill" → `exportSkillBundle()` produces a
//      Uint8Array → blob URL → click an anchor to trigger a download.
//   2. Author keeps their unsigned bundle; signing happens separately
//      (and is not yet exposed in the UI).
//
// We intentionally do NOT add SSE/streaming here — saves are a single
// HTTP request, fast enough to await in place.

import {
  CapabilityPicker,
  InputSchemaBuilder,
  ManifestIdentityFields,
  TemplatePreview,
  useSkillDraft,
  useSkills,
  type InstalledSkill,
} from '@pipefx/skills/ui';
import { exportSkillBundle } from '@pipefx/skills/marketplace';
import { ArrowLeft, Download, Save, Sparkles } from 'lucide-react';
import { useState, type CSSProperties } from 'react';

import { Card } from '../../../components/ui/card.js';
import { ScrollArea } from '../../../components/ui/scroll-area.js';
import { Badge } from '../../../components/ui/badge.js';
import { Button } from '../../../components/ui/button.js';
import { cn } from '../../../lib/utils.js';
import { SkillTemplateEditor } from './SkillTemplateEditor.js';
import { useLiveTools } from './use-live-tools.js';

const API_BASE = 'http://localhost:3001';

export interface SkillAuthoringPageProps {
  /** When provided, the page opens in "edit" mode and the id field is
   *  locked. When undefined, the page opens in "new" mode. */
  initial?: InstalledSkill;
  /** Called after a successful save. The parent typically navigates back
   *  to the library and bumps a refresh tick. */
  onSaved?: (skill: InstalledSkill) => void;
  /** Called when the user clicks "Back" / cancels. */
  onCancel?: () => void;
  className?: string;
  style?: CSSProperties;
}

export function SkillAuthoringPage(props: SkillAuthoringPageProps) {
  const { initial, onSaved, onCancel, className, style } = props;

  const draft = useSkillDraft({ initial: initial?.manifest });
  const { install } = useSkills({ apiBase: API_BASE });
  const { tools: liveTools } = useLiveTools({ apiBase: API_BASE });

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [sampleValues, setSampleValues] = useState<
    Record<string, string | number | boolean>
  >({});

  const isEdit = Boolean(initial);

  const handleSave = async () => {
    if (!draft.validation.ok || !draft.validation.manifest) {
      setSaveError('Manifest is invalid — fix the highlighted fields first.');
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      // Source is always 'local' for the in-app editor — this differentiates
      // hand-authored skills from imported `.pfxskill` bundles in the
      // installed-skill record.
      const installed = await install(draft.validation.manifest, {
        source: 'local',
      });
      onSaved?.(installed);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleExport = () => {
    if (!draft.validation.ok || !draft.validation.manifest) {
      setSaveError('Manifest is invalid — fix the highlighted fields first.');
      return;
    }
    setSaveError(null);
    // No signing in the editor yet — `signing` stays undefined so the
    // exported bundle is unsigned. The recipient will see the amber
    // "unsigned" warning in the import consent dialog, which is the
    // correct UX for a hand-authored draft.
    const bytes = exportSkillBundle({ manifest: draft.validation.manifest });
    // Wrap in a fresh ArrayBuffer view so TypeScript's lib.dom typings
    // accept it as BlobPart — the inferred Uint8Array<ArrayBufferLike>
    // includes the SharedArrayBuffer variant which Blob() rejects.
    const blob = new Blob([bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const filename = `${draft.validation.manifest.id}.pfxskill`;
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div
      className={cn('flex flex-1 min-h-0 flex-col bg-background', className)}
      style={style}
    >
      {/* ── Top bar ─────────────────────────────────────────────── */}
      <div className="px-4 py-3 border-b flex items-center justify-between bg-card">
        <div className="flex items-center gap-3 min-w-0">
          {onCancel && (
            <Button
              size="sm"
              variant="ghost"
              onClick={onCancel}
              className="gap-1"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Library
            </Button>
          )}
          <div className="min-w-0">
            <h2 className="text-sm font-semibold truncate flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              {isEdit ? 'Edit skill' : 'New skill'}
              {draft.dirty && (
                <Badge variant="outline" className="text-[10px]">
                  unsaved
                </Badge>
              )}
            </h2>
            <p className="text-xs text-muted-foreground truncate">
              {draft.draft.id || 'unnamed.skill'} · v
              {draft.draft.version || '0.0.0'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!draft.validation.ok && (
            <Badge variant="destructive" className="text-[10px]">
              {Object.keys(draft.validation.errors).length} issue
              {Object.keys(draft.validation.errors).length === 1 ? '' : 's'}
            </Badge>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={handleExport}
            disabled={!draft.validation.ok}
            title={
              draft.validation.ok ? 'Download .pfxskill' : 'Resolve issues to export'
            }
          >
            <Download className="h-3.5 w-3.5 mr-1.5" />
            Export
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={saving || !draft.validation.ok}
          >
            <Save className="h-3.5 w-3.5 mr-1.5" />
            {saving ? 'Saving…' : 'Save Local'}
          </Button>
        </div>
      </div>

      {saveError && (
        <div className="px-4 py-2 text-xs bg-destructive/10 text-destructive border-b border-destructive/30">
          {saveError}
        </div>
      )}

      {/* ── Main two-column layout ──────────────────────────────── */}
      <div className="flex-1 min-h-0 grid grid-cols-1 xl:grid-cols-2 gap-3 p-3 overflow-hidden">
        {/* Left: identity + inputs + capabilities */}
        <Card className="flex flex-col overflow-hidden">
          <ScrollArea className="flex-1">
            <div className="p-4 space-y-6">
              <Section title="Identity">
                <ManifestIdentityFields
                  draft={draft.draft}
                  validation={draft.validation}
                  onChange={draft.setField}
                  lockId={isEdit}
                  className="skill-identity-fields space-y-3"
                />
              </Section>

              <Section title="Inputs">
                <InputSchemaBuilder
                  inputs={draft.draft.inputs}
                  validation={draft.validation}
                  onAdd={draft.addInput}
                  onUpdate={draft.updateInput}
                  onRemove={draft.removeInput}
                  onMove={draft.moveInput}
                  className="skill-input-builder space-y-3"
                />
              </Section>

              <Section title="Capabilities">
                <CapabilityPicker
                  capabilities={draft.draft.capabilities}
                  availableTools={liveTools}
                  validation={draft.validation}
                  onAdd={draft.addCapability}
                  onUpdate={draft.updateCapability}
                  onRemove={draft.removeCapability}
                  className="skill-capability-picker space-y-3"
                />
              </Section>
            </div>
          </ScrollArea>
        </Card>

        {/* Right: editor + preview, stacked */}
        <Card className="flex flex-col overflow-hidden">
          <div className="px-4 py-2 border-b flex items-center justify-between">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Prompt template
            </h4>
            <span className="text-[10px] text-muted-foreground">
              {draft.draft.prompt.length} chars
            </span>
          </div>
          <div className="border-b">
            <SkillTemplateEditor
              value={draft.draft.prompt}
              onChange={(next) => draft.setField('prompt', next)}
              inputs={draft.draft.inputs}
              height={320}
            />
          </div>
          <ScrollArea className="flex-1">
            <div className="p-4">
              <TemplatePreview
                prompt={draft.draft.prompt}
                inputs={draft.draft.inputs}
                sampleValues={sampleValues}
                onSampleChange={(name, value) =>
                  setSampleValues((prev) => ({ ...prev, [name]: value }))
                }
                className="skill-template-preview space-y-3"
              />
            </div>
          </ScrollArea>
        </Card>
      </div>
    </div>
  );
}

// ── Sectioned wrapper ────────────────────────────────────────────────────
// Light visual scaffold for the form sections. Kept inline rather than
// promoted to a shared component because it's a one-off — if a second page
// needs it, lift it then.

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h4>
      {children}
    </section>
  );
}
