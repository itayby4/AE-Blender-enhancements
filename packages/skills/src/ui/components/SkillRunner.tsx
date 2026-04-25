// ── @pipefx/skills/ui — SkillRunner ──────────────────────────────────────
// Renders a manifest-driven input form and fires `useSkillRun` on submit.
// Defers all styling/chrome to the host app (we just emit semantic markup
// + className hooks). The form coerces values to the declared
// `SkillInputType` so the backend receives the shape that matches the
// manifest — string fields go through unchanged, numbers go through
// `Number(...)`, booleans go through checkbox state, enums constrain to
// the declared options.

import { useMemo, useState, type FormEvent, type CSSProperties } from 'react';
import type {
  InstalledSkill,
  SkillInput,
  SkillRunRecord,
} from '../../contracts/index.js';
import {
  useSkillRun,
  type SkillRunError,
} from '../hooks/use-skill-run.js';

type InputValue = string | number | boolean;

function defaultFor(input: SkillInput): InputValue {
  if (input.default !== undefined) return input.default;
  if (input.type === 'boolean') return false;
  if (input.type === 'number') return 0;
  if (input.type === 'enum') return input.options?.[0] ?? '';
  return '';
}

function buildInitialValues(
  inputs: ReadonlyArray<SkillInput>
): Record<string, InputValue> {
  const out: Record<string, InputValue> = {};
  for (const input of inputs) out[input.name] = defaultFor(input);
  return out;
}

export interface SkillRunnerProps {
  skill: InstalledSkill;
  apiBase?: string;
  sessionId?: string;
  onComplete?: (record: SkillRunRecord) => void;
  onError?: (err: SkillRunError) => void;
  className?: string;
  style?: CSSProperties;
}

export function SkillRunner(props: SkillRunnerProps) {
  const { skill, apiBase, sessionId, onComplete, onError, className, style } =
    props;
  const inputs = skill.manifest.inputs;
  const initial = useMemo(() => buildInitialValues(inputs), [inputs]);
  const [values, setValues] = useState<Record<string, InputValue>>(initial);
  const { run, pending, error, lastRun } = useSkillRun({ apiBase });

  const update = (name: string, value: InputValue) =>
    setValues((prev) => ({ ...prev, [name]: value }));

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    try {
      const record = await run({
        skillId: skill.manifest.id,
        inputs: values,
        sessionId,
      });
      onComplete?.(record);
    } catch (err) {
      onError?.(err as SkillRunError);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className={className}
      style={style}
      data-skill-id={skill.manifest.id}
    >
      <header className="skill-runner-header">
        <h3>{skill.manifest.name}</h3>
        {skill.manifest.description ? (
          <p>{skill.manifest.description}</p>
        ) : null}
      </header>

      <div className="skill-runner-fields">
        {inputs.map((input) => {
          const id = `skill-${skill.manifest.id}-${input.name}`;
          const label = input.label ?? input.name;
          const value = values[input.name];

          if (input.type === 'boolean') {
            return (
              <label key={input.name} htmlFor={id} className="skill-runner-field">
                <input
                  id={id}
                  type="checkbox"
                  checked={Boolean(value)}
                  onChange={(e) => update(input.name, e.target.checked)}
                />
                <span>{label}</span>
                {input.description ? (
                  <span className="skill-runner-help">{input.description}</span>
                ) : null}
              </label>
            );
          }

          if (input.type === 'enum') {
            return (
              <label key={input.name} htmlFor={id} className="skill-runner-field">
                <span>{label}</span>
                <select
                  id={id}
                  value={String(value)}
                  required={input.required}
                  onChange={(e) => update(input.name, e.target.value)}
                >
                  {(input.options ?? []).map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
                {input.description ? (
                  <span className="skill-runner-help">{input.description}</span>
                ) : null}
              </label>
            );
          }

          const inputType = input.type === 'number' ? 'number' : 'text';
          return (
            <label key={input.name} htmlFor={id} className="skill-runner-field">
              <span>{label}</span>
              <input
                id={id}
                type={inputType}
                value={String(value)}
                required={input.required}
                onChange={(e) => {
                  const next =
                    input.type === 'number'
                      ? e.target.value === ''
                        ? 0
                        : Number(e.target.value)
                      : e.target.value;
                  update(input.name, next);
                }}
              />
              {input.description ? (
                <span className="skill-runner-help">{input.description}</span>
              ) : null}
            </label>
          );
        })}
      </div>

      {error ? (
        <div className="skill-runner-error" role="alert" data-code={error.code}>
          {error.message}
          {error.code === 'skill_unavailable' && error.missing?.length ? (
            <ul>
              {error.missing.map((req, i) => (
                <li key={i}>
                  {req.description ?? req.connectorId ?? req.toolName ?? 'capability'}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {lastRun && lastRun.status === 'failed' ? (
        <div className="skill-runner-failed" role="alert">
          Run failed: {lastRun.error ?? 'unknown error'}
        </div>
      ) : null}

      <div className="skill-runner-actions">
        <button type="submit" disabled={pending}>
          {pending ? 'Running…' : 'Run skill'}
        </button>
      </div>
    </form>
  );
}
