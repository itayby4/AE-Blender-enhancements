// ── @pipefx/skills/ui — public surface ───────────────────────────────────
// Phase 12.7 ships the rebuilt library (Library / Store tabs, capability-
// aware cards) and the inline-mode run dialog. Component-mode hosts use
// `BundledSkillHost` + a registry populated by `@pipefx/skills-builtin`
// (Phase 12.9). The authoring scaffold lands in 12.12.

export { SkillsPage, type SkillsPageProps, type SkillsTab } from './SkillsPage.js';

export {
  SkillLibrary,
  type SkillLibraryProps,
  type SkillFilter,
  SkillCard,
  type SkillCardProps,
  StoreComingSoon,
} from './library/index.js';

export {
  InlineForm,
  type InlineFormProps,
  type InlineFormValues,
  SkillRunOutput,
  type SkillRunOutputProps,
  SkillRunDialog,
  type SkillRunDialogProps,
  BundledSkillHost,
  createBundledSkillRegistry,
  type BundledSkillHostProps,
  type BundledSkillProps,
  type BundledSkillComponent,
  type BundledSkillRegistry,
} from './runner/index.js';

export {
  useSkills,
  type UseSkillsOptions,
  type UseSkillsResult,
  type SkillWithAvailability,
  useSkillRun,
  type UseSkillRunOptions,
  type UseSkillRunResult,
} from './hooks/index.js';

export {
  createSkillsSource,
  type CreateSkillsSourceOptions,
} from './palette/index.js';

export {
  ScaffoldDialog,
  type ScaffoldDialogProps,
  SkillEditor,
  type SkillEditorProps,
  SkillBuilderCard,
  type SkillBuilderCardProps,
  useScaffoldSkill,
  type ScaffoldRequest,
  type UseScaffoldSkillOptions,
  type UseScaffoldSkillResult,
  useSkillSource,
  type UseSkillSourceOptions,
  type UseSkillSourceResult,
  createAuthoringSource,
  type CreateAuthoringSourceOptions,
} from './authoring/index.js';
