// ── @pipefx/skills/ui/authoring ──────────────────────────────────────────
// Phase 12.12 surface. Exposes the scaffold dialog + Monaco-backed editor
// + a `CommandSource` factory the host registers with
// `@pipefx/command-palette`.

export { ScaffoldDialog, type ScaffoldDialogProps } from './ScaffoldDialog.js';
export { SkillEditor, type SkillEditorProps } from './SkillEditor.js';
export {
  SkillBuilderCard,
  type SkillBuilderCardProps,
} from './SkillBuilderCard.js';

export {
  useScaffoldSkill,
  type ScaffoldRequest,
  type UseScaffoldSkillOptions,
  type UseScaffoldSkillResult,
} from './useScaffoldSkill.js';

export {
  useSkillSource,
  type UseSkillSourceOptions,
  type UseSkillSourceResult,
} from './useSkillSource.js';

export {
  createAuthoringSource,
  type CreateAuthoringSourceOptions,
} from './createAuthoringSource.js';
