// ── @pipefx/skills/ui — SkillCard ────────────────────────────────────────
// Pure, controlled view of a single installed skill. Renders runnable
// state, a list of unmet capability requirements (when greyed), and emits
// `onRun` / `onUninstall` callbacks. Stays headless — no shadcn/ui import,
// no router, no fetch — so the host app can wrap it with project-specific
// chrome without forking. Tailwind classes are hint-level only.

import type { CSSProperties, ReactNode } from 'react';
import type {
  CapabilityRequirement,
  InstalledSkill,
  SkillAvailability,
} from '../../contracts/index.js';

export interface SkillCardProps {
  skill: InstalledSkill;
  availability?: SkillAvailability;
  /** Override: caller can decide a skill is forced runnable (e.g. "run
   *  anyway" override per arc §7 — reduces matcher false-negatives). */
  forceRunnable?: boolean;
  onRun?: (skill: InstalledSkill) => void;
  onUninstall?: (skill: InstalledSkill) => void;
  /** Slot for a custom icon — keeps lucide out of the package. */
  iconSlot?: ReactNode;
  className?: string;
  style?: CSSProperties;
}

function describeRequirement(req: CapabilityRequirement): string {
  if (req.description) return req.description;
  const parts: string[] = [];
  if (req.connectorId) parts.push(req.connectorId);
  if (req.toolName) parts.push(req.toolName);
  return parts.length ? parts.join(' · ') : 'capability';
}

export function SkillCard(props: SkillCardProps) {
  const {
    skill,
    availability,
    forceRunnable,
    onRun,
    onUninstall,
    iconSlot,
    className,
    style,
  } = props;

  const runnable = forceRunnable ?? availability?.runnable ?? true;
  const missing = availability?.missing ?? [];
  const { manifest } = skill;

  return (
    <div
      data-skill-id={manifest.id}
      data-runnable={runnable ? 'true' : 'false'}
      className={className}
      style={style}
    >
      <div className="skill-card-header">
        {iconSlot ? <span className="skill-card-icon">{iconSlot}</span> : null}
        <div className="skill-card-titles">
          <h3 className="skill-card-name">{manifest.name}</h3>
          {manifest.category ? (
            <span className="skill-card-category">{manifest.category}</span>
          ) : null}
        </div>
        {skill.signed ? (
          <span
            className="skill-card-signed"
            title={
              skill.fingerprint
                ? `Signed · ${skill.fingerprint.slice(0, 12)}…`
                : 'Signed bundle'
            }
          >
            ✓
          </span>
        ) : null}
      </div>

      {manifest.description ? (
        <p className="skill-card-description">{manifest.description}</p>
      ) : null}

      {!runnable && missing.length > 0 ? (
        <div
          className="skill-card-missing"
          role="note"
          aria-label="Missing requirements"
        >
          <span className="skill-card-missing-label">Requires</span>
          <ul>
            {missing.map((req, i) => (
              <li key={i}>{describeRequirement(req)}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="skill-card-actions">
        <button
          type="button"
          disabled={!runnable}
          aria-disabled={!runnable}
          onClick={() => onRun?.(skill)}
          className="skill-card-run"
        >
          Run
        </button>
        {onUninstall ? (
          <button
            type="button"
            onClick={() => onUninstall(skill)}
            className="skill-card-uninstall"
          >
            Uninstall
          </button>
        ) : null}
      </div>
    </div>
  );
}
