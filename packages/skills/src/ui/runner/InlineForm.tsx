// ── @pipefx/skills/ui — InlineForm ───────────────────────────────────────
// Auto-generated form for the `inline` ui tier. Renders one control per
// `inputs[]` entry from the SKILL.md frontmatter and emits a typed value
// map matching the runner's `inputs` shape.

import { useMemo, useState } from 'react';

import type {
  SkillFrontmatterInput,
  SkillFrontmatterInputType,
} from '../../contracts/skill-md.js';
import { cn } from '../lib/cn.js';

export type InlineFormValues = Record<string, string | number | boolean>;

export interface InlineFormProps {
  inputs: ReadonlyArray<SkillFrontmatterInput>;
  submitting?: boolean;
  submitLabel?: string;
  onSubmit: (values: InlineFormValues) => void;
  onCancel?: () => void;
}

export function InlineForm({
  inputs,
  submitting = false,
  submitLabel = 'Run',
  onSubmit,
  onCancel,
}: InlineFormProps) {
  const initial = useMemo(() => buildInitialValues(inputs), [inputs]);
  const [values, setValues] = useState<InlineFormValues>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const setField = (id: string, next: string | number | boolean) => {
    setValues((prev) => ({ ...prev, [id]: next }));
    setErrors((prev) => {
      if (!prev[id]) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const nextErrors: Record<string, string> = {};
    for (const input of inputs) {
      if (!input.required) continue;
      const v = values[input.id];
      if (v === undefined || v === '' || v === null) {
        nextErrors[input.id] = 'Required';
      }
    }
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }
    onSubmit(values);
  };

  if (inputs.length === 0) {
    return (
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <p className="text-[12px] text-muted-foreground">
          This skill takes no inputs.
        </p>
        <FormActions
          submitting={submitting}
          submitLabel={submitLabel}
          onCancel={onCancel}
        />
      </form>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      {inputs.map((input) => (
        <FieldRow
          key={input.id}
          input={input}
          value={values[input.id]}
          error={errors[input.id]}
          onChange={(next) => setField(input.id, next)}
        />
      ))}
      <FormActions
        submitting={submitting}
        submitLabel={submitLabel}
        onCancel={onCancel}
      />
    </form>
  );
}

// ── Field row ────────────────────────────────────────────────────────────

function FieldRow({
  input,
  value,
  error,
  onChange,
}: {
  input: SkillFrontmatterInput;
  value: string | number | boolean | undefined;
  error?: string;
  onChange: (next: string | number | boolean) => void;
}) {
  const label = input.label ?? input.id;
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-medium text-foreground/90 flex items-center gap-1">
        {label}
        {input.required && <span className="text-destructive">*</span>}
      </span>
      {input.description && (
        <span className="text-[11px] text-muted-foreground/80">
          {input.description}
        </span>
      )}
      <FieldControl input={input} value={value} onChange={onChange} hasError={!!error} />
      {error && <span className="text-[11px] text-destructive">{error}</span>}
    </label>
  );
}

function FieldControl({
  input,
  value,
  onChange,
  hasError,
}: {
  input: SkillFrontmatterInput;
  value: string | number | boolean | undefined;
  onChange: (next: string | number | boolean) => void;
  hasError: boolean;
}) {
  const baseInput = cn(
    'h-8 px-2.5 text-[12px] rounded border bg-background/80 outline-none transition-colors',
    hasError
      ? 'border-destructive/60 focus:border-destructive focus:ring-1 focus:ring-destructive/30'
      : 'border-border/60 focus:border-primary/50 focus:ring-1 focus:ring-primary/30'
  );

  switch (input.type) {
    case 'boolean':
      return (
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(e) => onChange(e.target.checked)}
          className="h-4 w-4 rounded border-border/60 accent-primary"
        />
      );
    case 'number':
      return (
        <input
          type="number"
          value={value === undefined ? '' : String(value)}
          onChange={(e) => {
            const n = Number(e.target.value);
            onChange(Number.isFinite(n) ? n : 0);
          }}
          className={baseInput}
        />
      );
    case 'enum':
      return (
        <select
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
          className={baseInput}
        >
          {!input.required && <option value="">—</option>}
          {(input.options ?? []).map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      );
    case 'clip-ref':
    case 'file':
    case 'string':
    default:
      return (
        <input
          type="text"
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={input.type === 'clip-ref' ? 'clip-id or path' : ''}
          className={baseInput}
        />
      );
  }
}

function FormActions({
  submitting,
  submitLabel,
  onCancel,
}: {
  submitting: boolean;
  submitLabel: string;
  onCancel?: () => void;
}) {
  return (
    <div className="flex items-center justify-end gap-2 pt-1">
      {onCancel && (
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="text-[11px] px-2.5 h-7 rounded border border-border/60 hover:bg-muted/60 transition-colors disabled:opacity-50"
        >
          Cancel
        </button>
      )}
      <button
        type="submit"
        disabled={submitting}
        className="text-[11px] px-3 h-7 rounded font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
      >
        {submitting ? 'Running…' : submitLabel}
      </button>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────

function buildInitialValues(
  inputs: ReadonlyArray<SkillFrontmatterInput>
): InlineFormValues {
  const out: InlineFormValues = {};
  for (const input of inputs) {
    if (input.default !== undefined) {
      out[input.id] = input.default;
    } else {
      out[input.id] = defaultByType(input.type);
    }
  }
  return out;
}

function defaultByType(type: SkillFrontmatterInputType): string | number | boolean {
  switch (type) {
    case 'boolean':
      return false;
    case 'number':
      return 0;
    default:
      return '';
  }
}
