// ── BundledSkillLauncher ─────────────────────────────────────────────────
// Fires `POST /api/skills/<id>/run` for a `component`-mode skill, then
// mounts the resulting React module via `BundledSkillHost`. The skill
// itself (the component) drives the workflow — the launcher is just glue
// that swaps an inline-rendered dashboard for a runner-minted mount.
//
// Used by the desktop's Subtitles / Audio Sync / Autopod nav-rail entries
// (12.10/12.11). The same code path is reachable from the command palette
// via `/<trigger>` once the palette wires `runSkill` into its actions.

import { useEffect } from 'react';
import { Loader2 } from 'lucide-react';

import { getAccessToken } from '@pipefx/auth/ui';
import { BundledSkillHost, useSkillRun } from '@pipefx/skills/ui';

import { bundledSkillRegistry } from './bundled-skill-registry.js';

export interface BundledSkillLauncherProps {
  skillId: string;
}

export function BundledSkillLauncher({ skillId }: BundledSkillLauncherProps) {
  const { running, record, error, run } = useSkillRun({
    getToken: getAccessToken,
  });

  useEffect(() => {
    void run(skillId, {});
  }, [run, skillId]);

  if (running || (!record && !error)) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Launching {skillId}…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="rounded border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive max-w-md">
          Failed to launch <code className="font-mono">{skillId}</code>:{' '}
          {error}
        </div>
      </div>
    );
  }

  const mountInstruction = record?.mountInstruction;
  if (!mountInstruction) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="rounded border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive max-w-md">
          Skill <code className="font-mono">{skillId}</code> did not produce a
          mount instruction (mode is{' '}
          <code className="font-mono">{record?.mode ?? 'unknown'}</code>).
        </div>
      </div>
    );
  }

  return (
    <BundledSkillHost
      mountInstruction={mountInstruction}
      registry={bundledSkillRegistry}
      getToken={getAccessToken}
    />
  );
}
