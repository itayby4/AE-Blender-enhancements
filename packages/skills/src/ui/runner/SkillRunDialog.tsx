// ── @pipefx/skills/ui — SkillRunDialog ───────────────────────────────────
// Wraps `InlineForm` + `SkillRunOutput` for the `inline` ui tier. Pure
// presentational — the host owns mount / dismiss state.
//
// Component-mode skills (`ui: bundled`) bypass this dialog. The host
// renders `BundledSkillHost` directly with the `mountInstruction` from
// the run record.

import { useEffect } from 'react';

import type {
  InstalledSkill,
  SkillRunRecord,
} from '../../contracts/api.js';
import { useSkillRun } from '../hooks/useSkillRun.js';
import { cn } from '../lib/cn.js';
import { InlineForm, type InlineFormValues } from './InlineForm.js';
import { SkillRunOutput } from './SkillRunOutput.js';

export interface SkillRunDialogProps {
  skill: InstalledSkill;
  /** Backend base URL forwarded to the underlying hook. */
  baseUrl?: string;
  /** Optional Bearer-token getter forwarded to the underlying hook. */
  getToken?: () => Promise<string | null>;
  /** Called when the user dismisses the dialog. */
  onClose: () => void;
  /** Called once after a run produces a non-null record (succeeded OR
   *  failed). The host can use this to refresh run history, surface a
   *  toast, etc. */
  onRunComplete?: (record: SkillRunRecord) => void;
}

export function SkillRunDialog({
  skill,
  baseUrl,
  getToken,
  onClose,
  onRunComplete,
}: SkillRunDialogProps) {
  const fm = skill.loaded.frontmatter;
  const { running, record, error, run, reset } = useSkillRun({ baseUrl, getToken });

  useEffect(() => {
    if (record) onRunComplete?.(record);
  }, [record, onRunComplete]);

  const handleSubmit = async (values: InlineFormValues) => {
    await run(fm.id, values);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className={cn(
          'w-full max-w-lg max-h-[85vh] flex flex-col',
          'rounded-xl border border-border/60 bg-card shadow-2xl overflow-hidden'
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 px-4 py-3 border-b border-border/40 bg-muted/20 shrink-0">
          <div className="min-w-0">
            <h2 className="text-[13px] font-semibold text-foreground">
              {fm.name}
            </h2>
            <p className="text-[11px] text-muted-foreground line-clamp-2">
              {fm.description}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground h-6 w-6 inline-flex items-center justify-center rounded hover:bg-muted/50"
            aria-label="Close"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-4 flex flex-col gap-4">
          <InlineForm
            inputs={fm.inputs ?? []}
            submitting={running}
            submitLabel="Run skill"
            onSubmit={handleSubmit}
            onCancel={
              record || error
                ? () => {
                    reset();
                  }
                : onClose
            }
          />
          {(running || record || error) && (
            <SkillRunOutput record={record} pending={running} error={error} />
          )}
        </div>
      </div>
    </div>
  );
}
