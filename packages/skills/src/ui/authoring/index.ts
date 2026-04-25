// ── @pipefx/skills/ui — authoring barrel ─────────────────────────────────
// Public surface for the in-app skill authoring UI. Exposed under the
// existing `./ui` subpath (no new package export — consumers already pull
// from `@pipefx/skills/ui` for hooks + library widgets).

export {
  draftToManifestInput,
  emptyDraft,
  emptyDraftCapability,
  emptyDraftInput,
  extractTemplateVariables,
  manifestToDraft,
  synthesizeSampleValues,
  validateDraft,
  type DraftCapability,
  type DraftInput,
  type DraftValidation,
  type ExtractedVariable,
  type SkillDraft,
} from './draft.js';

export {
  useSkillDraft,
  type UseSkillDraftOptions,
  type UseSkillDraftResult,
} from './use-skill-draft.js';

export {
  ManifestIdentityFields,
  type ManifestIdentityFieldsProps,
} from './ManifestIdentityFields.js';

export {
  InputSchemaBuilder,
  type InputSchemaBuilderProps,
} from './InputSchemaBuilder.js';

export {
  CapabilityPicker,
  type CapabilityPickerProps,
} from './CapabilityPicker.js';

export {
  TemplatePreview,
  type TemplatePreviewProps,
} from './TemplatePreview.js';
