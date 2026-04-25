// ── @pipefx/skills/ui — SkillLibrary ─────────────────────────────────────
// Grid of installed skills lit/greyed by the capability matcher. Pulls
// from the `useSkills` + `useAvailableSkills` hooks; emits `onSelect` so
// the host app can mount a SkillRunner (or its own runner UI) when a
// card is clicked. The component is intentionally headless — no shadcn
// imports — so apps can wrap or restyle without forking.

import type { CSSProperties, ReactNode } from 'react';
import type { InstalledSkill } from '../../contracts/index.js';
import { useAvailableSkills } from '../hooks/use-available-skills.js';
import { useSkills } from '../hooks/use-skills.js';
import { SkillCard } from './SkillCard.js';

export interface SkillLibraryProps {
  apiBase?: string;
  /** Polling cadence for the availability snapshot. Defaults to 5 s. */
  availabilityPollMs?: number;
  onSelect?: (skill: InstalledSkill) => void;
  onUninstall?: (skill: InstalledSkill) => void;
  /** Render an icon next to each card (caller resolves manifest.icon). */
  renderIcon?: (skill: InstalledSkill) => ReactNode;
  /** Fallback when no skills are installed. */
  emptyState?: ReactNode;
  className?: string;
  style?: CSSProperties;
}

export function SkillLibrary(props: SkillLibraryProps) {
  const {
    apiBase,
    availabilityPollMs,
    onSelect,
    onUninstall,
    renderIcon,
    emptyState,
    className,
    style,
  } = props;

  const { skills, loading, error, uninstall } = useSkills({ apiBase });
  const { byId } = useAvailableSkills({
    apiBase,
    pollMs: availabilityPollMs,
  });

  const handleUninstall = async (skill: InstalledSkill) => {
    if (onUninstall) {
      onUninstall(skill);
      return;
    }
    await uninstall(skill.manifest.id);
  };

  if (loading && skills.length === 0) {
    return (
      <div className={className} style={style} data-state="loading">
        Loading skills…
      </div>
    );
  }

  if (error) {
    return (
      <div className={className} style={style} data-state="error" role="alert">
        Failed to load skills: {error}
      </div>
    );
  }

  if (skills.length === 0) {
    return (
      <div className={className} style={style} data-state="empty">
        {emptyState ?? <p>No skills installed yet.</p>}
      </div>
    );
  }

  return (
    <div className={className} style={style} data-state="ready">
      {skills.map((skill) => (
        <SkillCard
          key={skill.manifest.id}
          skill={skill}
          availability={byId.get(skill.manifest.id)}
          onRun={onSelect}
          onUninstall={handleUninstall}
          iconSlot={renderIcon?.(skill)}
        />
      ))}
    </div>
  );
}
