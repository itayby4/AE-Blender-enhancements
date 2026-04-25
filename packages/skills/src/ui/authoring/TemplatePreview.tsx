// ── @pipefx/skills/ui — TemplatePreview ──────────────────────────────────
// Renders the in-progress prompt with sample input values so authors can
// see exactly what the LLM would receive. Wraps the existing template
// engine — which is the same code path the runner uses — so the preview
// is a faithful representation, not a parallel implementation.
//
// Two failure modes get surfaced inline:
//   1. Schema-invalid manifest — the engine accepts a prompt + values
//      directly, so we can preview even before the manifest validates.
//   2. Undeclared variables — the prompt references `{{foo}}` but no
//      input declares `foo`. The engine throws in strict mode; we catch
//      and surface the message instead.

import { useMemo, type CSSProperties } from 'react';
import { renderTemplate } from '../../domain/template-engine.js';
import type { SkillInput } from '../../contracts/types.js';
import type { DraftInput } from './draft.js';
import {
  extractTemplateVariables,
  synthesizeSampleValues,
} from './draft.js';

export interface TemplatePreviewProps {
  prompt: string;
  inputs: ReadonlyArray<DraftInput>;
  /** Optional overrides keyed by input name. Anything not present here
   *  is auto-filled by `synthesizeSampleValues`. */
  sampleValues?: Readonly<Record<string, string | number | boolean>>;
  onSampleChange?: (name: string, value: string | number | boolean) => void;
  className?: string;
  style?: CSSProperties;
}

// Convert draft inputs to the published SkillInput shape just enough that
// the synthesizer + engine can use them. We don't validate here — invalid
// drafts still get a best-effort preview, which is the point.
function draftInputsToSkillInputs(
  inputs: ReadonlyArray<DraftInput>
): SkillInput[] {
  return inputs.map((d) => {
    const base: SkillInput = {
      name: d.name || '<unnamed>',
      type: d.type,
    };
    if (d.label) base.label = d.label;
    if (d.required) base.required = true;
    if (d.type === 'enum') {
      const opts = d.optionsRaw
        .split(/[\n,]/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      if (opts.length > 0) base.options = opts;
    }
    return base;
  });
}

export function TemplatePreview(props: TemplatePreviewProps) {
  const {
    prompt,
    inputs,
    sampleValues = {},
    onSampleChange,
    className,
    style,
  } = props;

  const skillInputs = useMemo(
    () => draftInputsToSkillInputs(inputs),
    [inputs]
  );

  const referenced = useMemo(
    () => extractTemplateVariables(prompt, skillInputs),
    [prompt, skillInputs]
  );

  const merged = useMemo(
    () => synthesizeSampleValues(skillInputs, sampleValues),
    [skillInputs, sampleValues]
  );

  // Render in non-strict mode so undeclared variables surface as a warning
  // list rather than an exception — the author can see the rest of the
  // prompt while they fix the typo. The variable extractor above gives us
  // the warning data either way.
  const rendered = useMemo(() => {
    try {
      return renderTemplate(prompt, merged, {
        declaredInputs: skillInputs,
        strict: false,
      });
    } catch (err) {
      return { text: `Preview error: ${(err as Error).message}`, usedVariables: [] };
    }
  }, [prompt, merged, skillInputs]);

  const undeclared = referenced.filter((r) => r.undeclared);

  return (
    <div
      className={className ?? 'skill-template-preview'}
      style={style}
      data-section="template-preview"
    >
      <header className="skill-template-preview-header">
        <h4>Preview</h4>
        <p>Sample values are filled in automatically. Override any below.</p>
      </header>

      {skillInputs.length > 0 ? (
        <div className="skill-template-preview-samples">
          {skillInputs.map((input) => {
            const value = merged[input.name];
            const id = `sample-${input.name}`;
            return (
              <label key={input.name} htmlFor={id} className="skill-sample-field">
                <span>{input.label ?? input.name}</span>
                {input.type === 'boolean' ? (
                  <input
                    id={id}
                    type="checkbox"
                    checked={Boolean(value)}
                    onChange={(e) =>
                      onSampleChange?.(input.name, e.target.checked)
                    }
                  />
                ) : input.type === 'enum' && input.options ? (
                  <select
                    id={id}
                    value={String(value)}
                    onChange={(e) => onSampleChange?.(input.name, e.target.value)}
                  >
                    {input.options.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    id={id}
                    type={input.type === 'number' ? 'number' : 'text'}
                    value={String(value)}
                    onChange={(e) => {
                      const next =
                        input.type === 'number'
                          ? e.target.value === ''
                            ? 0
                            : Number(e.target.value)
                          : e.target.value;
                      onSampleChange?.(input.name, next);
                    }}
                  />
                )}
              </label>
            );
          })}
        </div>
      ) : null}

      {undeclared.length > 0 ? (
        <div
          className="skill-template-preview-warnings"
          role="alert"
          data-warning="undeclared-variables"
        >
          <strong>Undeclared variables:</strong>
          <ul>
            {undeclared.map((u) => (
              <li key={u.name}>
                <code>{`{{${u.name}}}`}</code> — add it to inputs above or
                remove the reference.
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <pre className="skill-template-preview-output" data-rendered="true">
        {rendered.text}
      </pre>
    </div>
  );
}
