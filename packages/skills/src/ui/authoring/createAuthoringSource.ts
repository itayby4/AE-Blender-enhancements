// ── @pipefx/skills/ui/authoring — createAuthoringSource ──────────────────
// `@pipefx/command-palette` adapter for the authoring entry points. The
// host wires this alongside `createSkillsSource` so the same palette
// surfaces both "Run subtitles" (skill items) and "Create skill"
// (authoring command).
//
// Why a dedicated source: keeps the desktop's `desktopSource` (navigation
// + system actions) free of skill-package coupling, and lets a future
// non-desktop host (CLI, web) wire authoring commands without copying
// labels and ids.

import type {
  CommandIcon,
  CommandSource,
} from '@pipefx/command-palette/contracts';

const DEFAULT_ID = 'skills-authoring';
const DEFAULT_LABEL = 'Authoring';

export interface CreateAuthoringSourceOptions {
  id?: string;
  label?: string;
  /** Icon for the "Create skill" command. Falls back to no icon. */
  createSkillIcon?: CommandIcon;
  /** Invoked when the user activates the "Create skill" command. The
   *  host typically opens its `<ScaffoldDialog />`. */
  onCreateSkill: () => void;
}

export function createAuthoringSource(
  opts: CreateAuthoringSourceOptions
): CommandSource {
  const id = opts.id ?? DEFAULT_ID;
  const label = opts.label ?? DEFAULT_LABEL;

  return {
    id,
    label,
    group: label,
    list: () => [
      {
        id: `${id}:create-skill`,
        label: 'Create skill',
        description: 'Scaffold a new SKILL.md from a prompt or script template.',
        keywords: ['new', 'create', 'scaffold', 'author', 'skill', 'authoring'],
        icon: opts.createSkillIcon,
        run: opts.onCreateSkill,
      },
    ],
  };
}
