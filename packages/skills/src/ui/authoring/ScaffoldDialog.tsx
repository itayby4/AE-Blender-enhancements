// ── @pipefx/skills/ui/authoring — ScaffoldDialog ─────────────────────────
// Phase 12.12 dialog. Collects a few fields, posts to
// `/api/skills/scaffold`, and on success forwards the new skill to the
// host (which typically opens `SkillEditor` for inline edits).
//
// Bundled-mode is intentionally absent — the doc forbids scaffolding it
// because bundled skills require workspace-source code and a rebuild.

import { useEffect, useState } from 'react';

import type { InstalledSkill } from '../../contracts/api.js';
import type { SkillScaffoldMode } from '../../domain/scaffold-templates.js';
import { cn } from '../lib/cn.js';
import { useScaffoldSkill } from './useScaffoldSkill.js';

export interface ScaffoldDialogProps {
  isOpen: boolean;
  onClose: () => void;
  /** Backend base URL forwarded to the underlying hook. */
  baseUrl?: string;
  getToken?: () => Promise<string | null>;
  /** Called once the new skill is persisted. Host usually opens the
   *  editor on the returned record. */
  onCreated?: (skill: InstalledSkill) => void;
}

const ID_PATTERN = /^[a-z0-9]([a-z0-9._-]*[a-z0-9])?$/;

export function ScaffoldDialog({
  isOpen,
  onClose,
  baseUrl,
  getToken,
  onCreated,
}: ScaffoldDialogProps) {
  const [id, setId] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('general');
  const [mode, setMode] = useState<SkillScaffoldMode>('prompt');
  const [validationError, setValidationError] = useState<string | null>(null);
  const { scaffolding, error, scaffold, reset } = useScaffoldSkill({
    baseUrl,
    getToken,
  });

  // Reset every open so the dialog never carries state between sessions.
  useEffect(() => {
    if (isOpen) {
      setId('');
      setName('');
      setDescription('');
      setCategory('general');
      setMode('prompt');
      setValidationError(null);
      reset();
    }
  }, [isOpen, reset]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedId = id.trim();
    if (!trimmedId) {
      setValidationError('Skill id is required.');
      return;
    }
    if (!ID_PATTERN.test(trimmedId)) {
      setValidationError(
        'Skill id must start + end with [a-z0-9] and contain only lowercase letters, digits, dots, dashes, or underscores.'
      );
      return;
    }
    setValidationError(null);
    const record = await scaffold({
      id: trimmedId,
      name: name.trim() || undefined,
      description: description.trim() || undefined,
      category: category.trim() || undefined,
      mode,
    });
    if (record) {
      onCreated?.(record);
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className={cn(
          'w-full max-w-md max-h-[85vh] flex flex-col',
          'rounded-xl border border-border/60 bg-card shadow-2xl overflow-hidden'
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 px-4 py-3 border-b border-border/40 bg-muted/20 shrink-0">
          <div className="min-w-0">
            <h2 className="text-[13px] font-semibold text-foreground">
              Create skill
            </h2>
            <p className="text-[11px] text-muted-foreground">
              Scaffold a new SKILL.md in your local library and edit it
              inline.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground h-6 w-6 inline-flex items-center justify-center rounded hover:bg-muted/50"
            aria-label="Close"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        </div>

        <form
          className="flex-1 min-h-0 overflow-y-auto p-4 flex flex-col gap-3"
          onSubmit={handleSubmit}
        >
          <Field
            label="Skill id"
            help="Lowercase, dashes ok. e.g. cut-to-beat"
            required
          >
            <input
              type="text"
              value={id}
              onChange={(e) => setId(e.target.value)}
              autoFocus
              spellCheck={false}
              autoComplete="off"
              placeholder="my-skill"
              className={inputCls}
            />
          </Field>

          <Field label="Name" help="Defaults to a Title-Cased id">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Skill"
              className={inputCls}
            />
          </Field>

          <Field label="Description">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="One-line summary shown in the library card."
              rows={2}
              className={cn(inputCls, 'resize-y')}
            />
          </Field>

          <Field label="Category">
            <input
              type="text"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="general"
              className={inputCls}
            />
          </Field>

          <Field label="Template" help="Pick the execution mode for the skill.">
            <div className="grid grid-cols-2 gap-2">
              <ModeButton
                active={mode === 'prompt'}
                title="Prompt"
                description="Body drives a brain turn. Best for content tasks."
                onSelect={() => setMode('prompt')}
              />
              <ModeButton
                active={mode === 'script'}
                title="Script"
                description="Spawn a Python entry script. Best for tools."
                onSelect={() => setMode('script')}
              />
            </div>
          </Field>

          {(validationError || error) && (
            <div className="rounded border border-destructive/40 bg-destructive/10 px-3 py-2 text-[11px] text-destructive">
              {validationError ?? error}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="h-8 px-3 text-[12px] rounded border border-border/60 bg-background hover:bg-muted/40"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={scaffolding}
              className="h-8 px-3 text-[12px] rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {scaffolding ? 'Creating…' : 'Create skill'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Internals ────────────────────────────────────────────────────────────

const inputCls =
  'w-full h-8 px-2.5 text-[12px] rounded border border-border/60 bg-background/80 outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/30';

function Field({
  label,
  help,
  required,
  children,
}: {
  label: string;
  help?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-medium text-foreground">
        {label}
        {required && <span className="text-destructive ml-0.5">*</span>}
      </span>
      {children}
      {help && (
        <span className="text-[10px] text-muted-foreground">{help}</span>
      )}
    </label>
  );
}

function ModeButton({
  active,
  title,
  description,
  onSelect,
}: {
  active: boolean;
  title: string;
  description: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'flex flex-col items-start gap-1 rounded border px-3 py-2 text-left transition-colors',
        active
          ? 'border-primary/60 bg-primary/10 text-foreground'
          : 'border-border/60 bg-background/40 text-muted-foreground hover:text-foreground hover:bg-muted/30'
      )}
    >
      <span className="text-[12px] font-semibold">{title}</span>
      <span className="text-[10px] leading-tight">{description}</span>
    </button>
  );
}
