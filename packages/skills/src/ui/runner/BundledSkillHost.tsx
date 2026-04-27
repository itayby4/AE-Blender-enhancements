// ── @pipefx/skills/ui — BundledSkillHost ─────────────────────────────────
// Hosts a `component`-mode skill. Resolves the `mountInstruction.entry`
// against a registry populated by `@pipefx/skills-builtin` (Phase 12.9)
// and renders the matching React module.
//
// The runtime context the component receives — brain handle, tool
// registry, output sink — is intentionally NOT serialized into
// `SkillMountInstruction`. The host injects it as props at mount time.

import { type ComponentType, type ReactNode } from 'react';

import type {
  SkillMountInstruction,
} from '../../contracts/api.js';

/** Props passed to a bundled-UI skill component at mount. The runtime
 *  context (brain handle, tool registry, etc.) is host-injected and
 *  layered on top of the form values from the run request. */
export interface BundledSkillProps {
  runId: string;
  skillId: string;
  inputs: Readonly<Record<string, string | number | boolean>>;
  onComplete?: () => void;
  /** Bearer-token getter for backend calls the bundled component makes
   *  on its own (e.g. Subtitles posting `/api/subtitles/generate`). The
   *  host wires this from its own auth layer; components forward the
   *  token in `Authorization: Bearer <token>` headers, or skip the
   *  header when the getter returns null. Optional so component-mode
   *  skills hosted in unauthenticated contexts (tests, Storybook) still
   *  type-check. */
  getToken?: () => Promise<string | null>;
}

export type BundledSkillComponent = ComponentType<BundledSkillProps>;

/** Registry shape — keys are the `bundledUi.entry` paths normalized to
 *  POSIX. Built-in skills register at desktop boot via
 *  `registerBuiltInSkills()` (Phase 12.9). */
export interface BundledSkillRegistry {
  resolve(entry: string): BundledSkillComponent | null;
}

export interface BundledSkillHostProps {
  mountInstruction: SkillMountInstruction;
  registry: BundledSkillRegistry;
  onComplete?: () => void;
  /** Bearer-token getter forwarded to the mounted component. See
   *  `BundledSkillProps.getToken`. */
  getToken?: () => Promise<string | null>;
  /** Optional fallback when the registry has no match. Lets the host
   *  render its own "Unknown skill component" surface if it prefers. */
  fallback?: (entry: string) => ReactNode;
}

export function BundledSkillHost({
  mountInstruction,
  registry,
  onComplete,
  getToken,
  fallback,
}: BundledSkillHostProps) {
  const Component = registry.resolve(mountInstruction.entry);
  if (!Component) {
    if (fallback) return <>{fallback(mountInstruction.entry)}</>;
    return (
      <div className="rounded border border-destructive/40 bg-destructive/10 p-3 text-[12px] text-destructive">
        No bundled component registered for{' '}
        <code className="font-mono">{mountInstruction.entry}</code>.
      </div>
    );
  }
  return (
    <Component
      runId={mountInstruction.runId}
      skillId={mountInstruction.skillId}
      inputs={mountInstruction.inputs}
      onComplete={onComplete}
      getToken={getToken}
    />
  );
}

/** Tiny in-memory registry for hosts that don't have their own. The
 *  desktop wires its own registry against `@pipefx/skills-builtin`;
 *  tests and ad-hoc embeds can use this. */
export function createBundledSkillRegistry(
  initial?: Readonly<Record<string, BundledSkillComponent>>
): BundledSkillRegistry & {
  register(entry: string, component: BundledSkillComponent): void;
} {
  const map = new Map<string, BundledSkillComponent>(
    initial ? Object.entries(initial) : []
  );
  return {
    resolve: (entry) => map.get(entry) ?? null,
    register: (entry, component) => {
      map.set(entry, component);
    },
  };
}
