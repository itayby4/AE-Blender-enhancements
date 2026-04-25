// ── @pipefx/skills/ui — ManifestIdentityFields ───────────────────────────
// Headless form fieldset for the identity portion of a skill manifest:
// id, version, name, description, category, icon, author. Emits semantic
// markup with stable className hooks; the host app supplies the chrome
// (cards, sections, divider lines, etc.).
//
// We bind directly to a `useSkillDraft` result rather than re-deriving an
// onChange/value contract per field — this keeps the page wiring trivial
// and the validation map authoritative for every field.

import type { CSSProperties } from 'react';
import type { DraftValidation, SkillDraft } from './draft.js';

export interface ManifestIdentityFieldsProps {
  draft: SkillDraft;
  validation: DraftValidation;
  onChange: <K extends keyof SkillDraft>(key: K, value: SkillDraft[K]) => void;
  /** Disable the id field (e.g. when editing an existing skill — changing
   *  the id would be effectively a fresh install rather than an edit). */
  lockId?: boolean;
  className?: string;
  style?: CSSProperties;
}

export function ManifestIdentityFields(props: ManifestIdentityFieldsProps) {
  const { draft, validation, onChange, lockId, className, style } = props;
  const err = (path: string): string | undefined => validation.errors[path];

  return (
    <fieldset
      className={className ?? 'skill-identity-fields'}
      style={style}
      data-section="manifest-identity"
    >
      <div className="skill-identity-row" data-field="id">
        <label htmlFor="skill-id">Skill ID</label>
        <input
          id="skill-id"
          type="text"
          value={draft.id}
          disabled={lockId}
          spellCheck={false}
          autoComplete="off"
          placeholder="com.acme.cut-to-beat"
          onChange={(e) => onChange('id', e.target.value)}
          aria-invalid={Boolean(err('id'))}
          data-error={err('id') ? 'true' : undefined}
        />
        {err('id') ? <span className="skill-field-error">{err('id')}</span> : null}
      </div>

      <div className="skill-identity-row" data-field="version">
        <label htmlFor="skill-version">Version</label>
        <input
          id="skill-version"
          type="text"
          value={draft.version}
          spellCheck={false}
          autoComplete="off"
          placeholder="0.1.0"
          onChange={(e) => onChange('version', e.target.value)}
          aria-invalid={Boolean(err('version'))}
          data-error={err('version') ? 'true' : undefined}
        />
        {err('version') ? (
          <span className="skill-field-error">{err('version')}</span>
        ) : null}
      </div>

      <div className="skill-identity-row" data-field="name">
        <label htmlFor="skill-name">Name</label>
        <input
          id="skill-name"
          type="text"
          value={draft.name}
          onChange={(e) => onChange('name', e.target.value)}
          aria-invalid={Boolean(err('name'))}
          data-error={err('name') ? 'true' : undefined}
        />
        {err('name') ? <span className="skill-field-error">{err('name')}</span> : null}
      </div>

      <div className="skill-identity-row" data-field="description">
        <label htmlFor="skill-description">Description</label>
        <textarea
          id="skill-description"
          value={draft.description}
          rows={3}
          onChange={(e) => onChange('description', e.target.value)}
          aria-invalid={Boolean(err('description'))}
          data-error={err('description') ? 'true' : undefined}
        />
        {err('description') ? (
          <span className="skill-field-error">{err('description')}</span>
        ) : null}
      </div>

      <div className="skill-identity-row" data-field="category">
        <label htmlFor="skill-category">Category</label>
        <input
          id="skill-category"
          type="text"
          value={draft.category}
          placeholder="editing, analysis, …"
          onChange={(e) => onChange('category', e.target.value)}
          aria-invalid={Boolean(err('category'))}
        />
        {err('category') ? (
          <span className="skill-field-error">{err('category')}</span>
        ) : null}
      </div>

      <div className="skill-identity-row" data-field="icon">
        <label htmlFor="skill-icon">Icon (lucide name)</label>
        <input
          id="skill-icon"
          type="text"
          value={draft.icon}
          placeholder="sparkles"
          onChange={(e) => onChange('icon', e.target.value)}
          aria-invalid={Boolean(err('icon'))}
        />
        {err('icon') ? <span className="skill-field-error">{err('icon')}</span> : null}
      </div>

      <div className="skill-identity-row" data-field="authorName">
        <label htmlFor="skill-author">Author</label>
        <input
          id="skill-author"
          type="text"
          value={draft.authorName}
          onChange={(e) => onChange('authorName', e.target.value)}
          aria-invalid={Boolean(err('author.name'))}
        />
        {err('author.name') ? (
          <span className="skill-field-error">{err('author.name')}</span>
        ) : null}
      </div>
    </fieldset>
  );
}
