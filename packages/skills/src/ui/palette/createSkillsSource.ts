// ── @pipefx/skills/ui/palette — createSkillsSource ───────────────────────
// Adapts an installed-skills snapshot into a `CommandSource` that the
// `@pipefx/command-palette` host can register. Items inherit each skill's
// frontmatter `triggers` as fuzzy keywords (so `/subtitles` and `cut to
// beat` both find the right card), and unrunnable skills surface as
// disabled with a "Missing tools" reason.

import type {
  CommandItem,
  CommandSource,
} from '@pipefx/command-palette/contracts';

import type { InstalledSkill, SkillAvailability } from '../../contracts/api.js';
import type { SkillId } from '../../contracts/skill-md.js';

export interface CreateSkillsSourceOptions {
  /** Source id used by the palette for `pinnedSourceId` filtering. */
  id?: string;
  /** Group label and source label. */
  label?: string;
  /** Returns the current skills + availability snapshot. Called on every
   *  palette render — keep it cheap (the desktop's `useSkills` snapshot
   *  is a stable reference). */
  getSkills: () => ReadonlyArray<{
    skill: InstalledSkill;
    availability: SkillAvailability | null | undefined;
  }>;
  /** Invoked when the user activates a skill item in the palette. The
   *  host decides whether to open the run dialog, route to a bundled UI,
   *  or kick off a background run. */
  onRun: (skill: InstalledSkill) => void;
  /** Optional reactive seam — usually wired to the same notifier the
   *  desktop already uses to refresh the library. */
  subscribe?: (listener: () => void) => () => void;
  /** When true, unrunnable skills are excluded from the list instead of
   *  being shown disabled. Defaults to `false` (show + disable). */
  hideUnavailable?: boolean;
}

const DEFAULT_ID = 'skills';
const DEFAULT_LABEL = 'Skills';

export function createSkillsSource(
  opts: CreateSkillsSourceOptions
): CommandSource {
  const id = opts.id ?? DEFAULT_ID;
  const label = opts.label ?? DEFAULT_LABEL;

  const list = (): ReadonlyArray<CommandItem> => {
    const out: CommandItem[] = [];
    for (const { skill, availability } of opts.getSkills()) {
      const fm = skill.loaded.frontmatter;
      const runnable = availability?.runnable ?? true;
      if (!runnable && opts.hideUnavailable) continue;

      const item: CommandItem = {
        id: itemId(id, fm.id),
        label: fm.name,
        description: fm.description,
        keywords: buildKeywords(fm.id, fm.triggers, fm.category),
        disabled: !runnable,
        disabledReason: runnable ? undefined : 'Missing required tools',
        run: () => opts.onRun(skill),
      };
      out.push(item);
    }
    return out;
  };

  return {
    id,
    label,
    group: label,
    list,
    subscribe: opts.subscribe,
  };
}

function itemId(sourceId: string, skillId: SkillId): string {
  return `${sourceId}:${skillId}`;
}

function buildKeywords(
  skillId: SkillId,
  triggers: ReadonlyArray<string> | undefined,
  category: string | undefined
): ReadonlyArray<string> {
  const out: string[] = [skillId];
  if (triggers) out.push(...triggers);
  if (category) out.push(category);
  return out;
}
