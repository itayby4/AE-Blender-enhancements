// ── @pipefx/skills/ui — InputSchemaBuilder ───────────────────────────────
// Builder for the `inputs` array of a skill manifest. Each row exposes
// name, type, label, required, default and (for enum) the comma/newline-
// separated options. Reorder buttons swap adjacent rows so the author
// controls the form rendering order in `SkillRunner`.
//
// Headless: the only visual scaffolding is the row container (so reorder
// has somewhere to grip onto); the host app supplies button styling, icons,
// drag affordances, etc.

import type { CSSProperties } from 'react';
import type { SkillInputType } from '../../contracts/types.js';
import type { DraftInput, DraftValidation } from './draft.js';

const TYPE_OPTIONS: ReadonlyArray<{ value: SkillInputType; label: string }> = [
  { value: 'string', label: 'String' },
  { value: 'number', label: 'Number' },
  { value: 'boolean', label: 'Boolean' },
  { value: 'enum', label: 'Enum (pick one)' },
];

export interface InputSchemaBuilderProps {
  inputs: ReadonlyArray<DraftInput>;
  validation: DraftValidation;
  onAdd: () => void;
  onUpdate: (rowId: string, patch: Partial<DraftInput>) => void;
  onRemove: (rowId: string) => void;
  onMove: (rowId: string, direction: -1 | 1) => void;
  className?: string;
  style?: CSSProperties;
}

export function InputSchemaBuilder(props: InputSchemaBuilderProps) {
  const { inputs, validation, onAdd, onUpdate, onRemove, onMove, className, style } =
    props;

  const errFor = (index: number, field: string): string | undefined =>
    validation.errors[`inputs.${index}.${field}`];

  return (
    <div
      className={className ?? 'skill-input-builder'}
      style={style}
      data-section="manifest-inputs"
    >
      <header className="skill-input-builder-header">
        <h4>Inputs</h4>
        <p className="skill-input-builder-help">
          Variables the user fills in before running. Reference them in the
          prompt with <code>{'{{name}}'}</code>.
        </p>
      </header>

      {inputs.length === 0 ? (
        <p className="skill-input-builder-empty">
          No inputs yet — the prompt will run as-is for every invocation.
        </p>
      ) : null}

      <ol className="skill-input-builder-list">
        {inputs.map((input, index) => (
          <li
            key={input.rowId}
            className="skill-input-row"
            data-row-id={input.rowId}
            data-input-type={input.type}
          >
            <div className="skill-input-row-header">
              <input
                type="text"
                className="skill-input-name"
                value={input.name}
                placeholder="variable_name"
                spellCheck={false}
                autoComplete="off"
                onChange={(e) => onUpdate(input.rowId, { name: e.target.value })}
                aria-invalid={Boolean(errFor(index, 'name'))}
                data-error={errFor(index, 'name') ? 'true' : undefined}
              />
              <select
                className="skill-input-type"
                value={input.type}
                onChange={(e) =>
                  onUpdate(input.rowId, { type: e.target.value as SkillInputType })
                }
              >
                {TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <div className="skill-input-row-actions">
                <button
                  type="button"
                  className="skill-input-move-up"
                  onClick={() => onMove(input.rowId, -1)}
                  disabled={index === 0}
                  aria-label="Move input up"
                  title="Move up"
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="skill-input-move-down"
                  onClick={() => onMove(input.rowId, 1)}
                  disabled={index === inputs.length - 1}
                  aria-label="Move input down"
                  title="Move down"
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="skill-input-remove"
                  onClick={() => onRemove(input.rowId)}
                  aria-label="Remove input"
                  title="Remove"
                >
                  ✕
                </button>
              </div>
            </div>

            {errFor(index, 'name') ? (
              <span className="skill-field-error">{errFor(index, 'name')}</span>
            ) : null}

            <div className="skill-input-row-body">
              <label className="skill-input-field">
                <span>Label (optional)</span>
                <input
                  type="text"
                  value={input.label}
                  onChange={(e) => onUpdate(input.rowId, { label: e.target.value })}
                />
              </label>

              <label className="skill-input-field">
                <span>Description (optional)</span>
                <input
                  type="text"
                  value={input.description}
                  onChange={(e) =>
                    onUpdate(input.rowId, { description: e.target.value })
                  }
                />
              </label>

              <label className="skill-input-field skill-input-field-checkbox">
                <input
                  type="checkbox"
                  checked={input.required}
                  onChange={(e) =>
                    onUpdate(input.rowId, { required: e.target.checked })
                  }
                />
                <span>Required</span>
              </label>

              <label className="skill-input-field">
                <span>Default (optional)</span>
                <input
                  type="text"
                  value={input.defaultRaw}
                  placeholder={
                    input.type === 'boolean'
                      ? 'true / false'
                      : input.type === 'number'
                        ? '0'
                        : ''
                  }
                  onChange={(e) =>
                    onUpdate(input.rowId, { defaultRaw: e.target.value })
                  }
                  aria-invalid={Boolean(errFor(index, 'default'))}
                />
                {errFor(index, 'default') ? (
                  <span className="skill-field-error">{errFor(index, 'default')}</span>
                ) : null}
              </label>

              {input.type === 'enum' ? (
                <label className="skill-input-field skill-input-field-options">
                  <span>Options (one per line, or comma-separated)</span>
                  <textarea
                    value={input.optionsRaw}
                    rows={3}
                    onChange={(e) =>
                      onUpdate(input.rowId, { optionsRaw: e.target.value })
                    }
                    aria-invalid={Boolean(errFor(index, 'options'))}
                  />
                  {errFor(index, 'options') ? (
                    <span className="skill-field-error">{errFor(index, 'options')}</span>
                  ) : null}
                </label>
              ) : null}
            </div>
          </li>
        ))}
      </ol>

      <button type="button" className="skill-input-add" onClick={onAdd}>
        + Add input
      </button>
    </div>
  );
}
