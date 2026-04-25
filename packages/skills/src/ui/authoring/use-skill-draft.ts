// ── @pipefx/skills/ui — useSkillDraft hook ───────────────────────────────
// React adapter around the pure draft helpers in `./draft.ts`. Owns the
// in-memory draft state, computes a memoized validation snapshot, and
// tracks a `dirty` flag so consuming pages can prompt before navigating
// away with unsaved changes.
//
// Intentionally NOT a global store. Each authoring surface gets its own
// hook instance — the page is a single-document editor, and embedding the
// draft in component state keeps SSR/test setup trivial.

import { useCallback, useMemo, useRef, useState } from 'react';
import type { SkillManifest } from '../../contracts/types.js';
import {
  draftToManifestInput,
  emptyDraft,
  emptyDraftCapability,
  emptyDraftInput,
  manifestToDraft,
  validateDraft,
  type DraftCapability,
  type DraftInput,
  type DraftValidation,
  type SkillDraft,
} from './draft.js';

export interface UseSkillDraftOptions {
  /** Hydrate the draft from an existing manifest (edit mode). When omitted
   *  the draft starts empty (new-skill mode). */
  initial?: SkillManifest;
}

export interface UseSkillDraftResult {
  draft: SkillDraft;
  validation: DraftValidation;
  /** True iff the user has modified the draft since it was loaded/reset.
   *  Pages should warn on navigation when this is true. */
  dirty: boolean;
  /** Replace the entire draft. Used for "load from manifest" or
   *  programmatic resets. */
  setDraft: (next: SkillDraft) => void;
  /** Patch top-level identity/prompt fields. */
  setField: <K extends keyof SkillDraft>(key: K, value: SkillDraft[K]) => void;
  // Inputs
  addInput: () => void;
  updateInput: (rowId: string, patch: Partial<DraftInput>) => void;
  removeInput: (rowId: string) => void;
  moveInput: (rowId: string, direction: -1 | 1) => void;
  // Capabilities
  addCapability: (preset?: { connectorId?: string; toolName?: string }) => void;
  updateCapability: (rowId: string, patch: Partial<DraftCapability>) => void;
  removeCapability: (rowId: string) => void;
  // Lifecycle
  reset: () => void;
  /** Discard current draft and re-hydrate from a manifest (e.g. switching
   *  which skill to edit). Resets the dirty flag. */
  loadManifest: (manifest: SkillManifest) => void;
  /** Snapshot of the unvalidated manifest input — useful for export/save
   *  flows that want to round-trip through the schema themselves. */
  toManifestInput: () => unknown;
}

export function useSkillDraft(
  options: UseSkillDraftOptions = {}
): UseSkillDraftResult {
  // Compute the seed once. We want re-renders triggered by parent state to
  // keep the draft in place, not snap back to `initial` on every render.
  const seedRef = useRef<SkillDraft>(
    options.initial ? manifestToDraft(options.initial) : emptyDraft()
  );
  const [draft, setDraftState] = useState<SkillDraft>(seedRef.current);
  const [dirty, setDirty] = useState(false);

  const validation = useMemo(() => validateDraft(draft), [draft]);

  const setDraft = useCallback((next: SkillDraft) => {
    setDraftState(next);
    setDirty(true);
  }, []);

  const setField = useCallback(
    <K extends keyof SkillDraft>(key: K, value: SkillDraft[K]) => {
      setDraftState((prev) => ({ ...prev, [key]: value }));
      setDirty(true);
    },
    []
  );

  // ── Input list helpers ─────────────────────────────────────────────────

  const addInput = useCallback(() => {
    setDraftState((prev) => ({ ...prev, inputs: [...prev.inputs, emptyDraftInput()] }));
    setDirty(true);
  }, []);

  const updateInput = useCallback(
    (rowId: string, patch: Partial<DraftInput>) => {
      setDraftState((prev) => ({
        ...prev,
        inputs: prev.inputs.map((i) =>
          i.rowId === rowId ? { ...i, ...patch, rowId: i.rowId } : i
        ),
      }));
      setDirty(true);
    },
    []
  );

  const removeInput = useCallback((rowId: string) => {
    setDraftState((prev) => ({
      ...prev,
      inputs: prev.inputs.filter((i) => i.rowId !== rowId),
    }));
    setDirty(true);
  }, []);

  const moveInput = useCallback((rowId: string, direction: -1 | 1) => {
    setDraftState((prev) => {
      const idx = prev.inputs.findIndex((i) => i.rowId === rowId);
      if (idx === -1) return prev;
      const target = idx + direction;
      if (target < 0 || target >= prev.inputs.length) return prev;
      const next = [...prev.inputs];
      const [moved] = next.splice(idx, 1);
      next.splice(target, 0, moved);
      return { ...prev, inputs: next };
    });
    setDirty(true);
  }, []);

  // ── Capability helpers ─────────────────────────────────────────────────

  const addCapability = useCallback<UseSkillDraftResult['addCapability']>(
    (preset) => {
      setDraftState((prev) => {
        const next = emptyDraftCapability();
        if (preset?.connectorId) next.connectorId = preset.connectorId;
        if (preset?.toolName) next.toolName = preset.toolName;
        return { ...prev, capabilities: [...prev.capabilities, next] };
      });
      setDirty(true);
    },
    []
  );

  const updateCapability = useCallback(
    (rowId: string, patch: Partial<DraftCapability>) => {
      setDraftState((prev) => ({
        ...prev,
        capabilities: prev.capabilities.map((c) =>
          c.rowId === rowId ? { ...c, ...patch, rowId: c.rowId } : c
        ),
      }));
      setDirty(true);
    },
    []
  );

  const removeCapability = useCallback((rowId: string) => {
    setDraftState((prev) => ({
      ...prev,
      capabilities: prev.capabilities.filter((c) => c.rowId !== rowId),
    }));
    setDirty(true);
  }, []);

  // ── Lifecycle ──────────────────────────────────────────────────────────

  const reset = useCallback(() => {
    setDraftState(seedRef.current);
    setDirty(false);
  }, []);

  const loadManifest = useCallback((manifest: SkillManifest) => {
    const next = manifestToDraft(manifest);
    seedRef.current = next;
    setDraftState(next);
    setDirty(false);
  }, []);

  const toManifestInput = useCallback(
    () => draftToManifestInput(draft),
    [draft]
  );

  return {
    draft,
    validation,
    dirty,
    setDraft,
    setField,
    addInput,
    updateInput,
    removeInput,
    moveInput,
    addCapability,
    updateCapability,
    removeCapability,
    reset,
    loadManifest,
    toManifestInput,
  };
}
