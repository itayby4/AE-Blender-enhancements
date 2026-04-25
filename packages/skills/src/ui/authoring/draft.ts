// ── @pipefx/skills/ui — authoring draft helpers ──────────────────────────
// Pure, framework-free helpers backing `useSkillDraft`. The hook is a thin
// React adapter around these — the logic lives here so it stays unit-testable
// without a DOM environment. Anything that touches React (useState, hooks)
// belongs in `use-skill-draft.ts`; anything else belongs here.
//
// A "draft" is an in-progress manifest. It's allowed to be partial and
// invalid — the user is still typing. We round-trip it through the manifest
// schema on demand to produce a `DraftValidation` snapshot, but we never
// throw on bad input the way a published skill would.

import type {
  CapabilityRequirement,
  SkillInput,
  SkillInputType,
  SkillManifest,
} from '../../contracts/types.js';
import { parseManifest } from '../../domain/manifest-schema.js';

// ── Draft shape ──────────────────────────────────────────────────────────
// We deliberately don't reuse `Partial<SkillManifest>` — the input type union
// makes partial inputs awkward to express, and a draft has a few fields
// (like a free-form `enumOptionsRaw` string) that aren't in the published
// shape. Conversion happens at `draftToManifestInput`.

export interface DraftInput {
  /** Stable client-side row id so React reconciles correctly when the user
   *  reorders or deletes inputs. Never persisted. */
  rowId: string;
  name: string;
  type: SkillInputType;
  label: string;
  description: string;
  required: boolean;
  /** String form of the default — coerced to the declared `type` at
   *  serialization time. Keeping it as a string lets users freely toggle
   *  type without losing what they typed. */
  defaultRaw: string;
  /** Comma- or newline-separated enum options. Only meaningful when
   *  `type === 'enum'`. */
  optionsRaw: string;
}

export interface DraftCapability {
  rowId: string;
  connectorId: string;
  toolName: string;
  description: string;
}

export interface SkillDraft {
  id: string;
  version: string;
  name: string;
  description: string;
  category: string;
  icon: string;
  authorName: string;
  inputs: DraftInput[];
  prompt: string;
  capabilities: DraftCapability[];
}

export interface DraftValidation {
  ok: boolean;
  /** Field-level error map. Keys are dotted paths into the draft
   *  ("inputs.2.name", "id", "capabilities.0.toolName"). */
  errors: Record<string, string>;
  /** Fully-validated manifest when `ok === true`, otherwise undefined. */
  manifest?: SkillManifest;
}

// ── Constructors ─────────────────────────────────────────────────────────

let rowIdCounter = 0;
function makeRowId(prefix: string): string {
  rowIdCounter += 1;
  return `${prefix}-${rowIdCounter}`;
}

export function emptyDraft(): SkillDraft {
  return {
    id: '',
    version: '0.1.0',
    name: '',
    description: '',
    category: '',
    icon: '',
    authorName: '',
    inputs: [],
    prompt: '',
    capabilities: [],
  };
}

export function emptyDraftInput(): DraftInput {
  return {
    rowId: makeRowId('input'),
    name: '',
    type: 'string',
    label: '',
    description: '',
    required: false,
    defaultRaw: '',
    optionsRaw: '',
  };
}

export function emptyDraftCapability(): DraftCapability {
  return {
    rowId: makeRowId('cap'),
    connectorId: '',
    toolName: '',
    description: '',
  };
}

/**
 * Hydrate a draft from a published manifest — used when the authoring UI
 * is opened to edit an existing skill. Round-trips cleanly through
 * `draftToManifestInput` if the user makes no changes.
 */
export function manifestToDraft(manifest: SkillManifest): SkillDraft {
  return {
    id: manifest.id,
    version: manifest.version,
    name: manifest.name,
    description: manifest.description,
    category: manifest.category ?? '',
    icon: manifest.icon ?? '',
    authorName: manifest.author?.name ?? '',
    inputs: manifest.inputs.map((i) => ({
      rowId: makeRowId('input'),
      name: i.name,
      type: i.type,
      label: i.label ?? '',
      description: i.description ?? '',
      required: i.required ?? false,
      defaultRaw: i.default === undefined ? '' : String(i.default),
      optionsRaw: i.options ? i.options.join('\n') : '',
    })),
    prompt: manifest.prompt,
    capabilities: manifest.requires.capabilities.map((c) => ({
      rowId: makeRowId('cap'),
      connectorId: c.connectorId ?? '',
      toolName: c.toolName ?? '',
      description: c.description ?? '',
    })),
  };
}

// ── Serialization ────────────────────────────────────────────────────────
// The draft → manifest path is deliberately tolerant: empty strings drop
// optional fields, and the type-specific default coercion mirrors what the
// `SkillRunner` component does on submit, so the same value the author saw
// in their preview is what runs at execution.

function coerceDefault(
  raw: string,
  type: SkillInputType
): string | number | boolean | undefined {
  if (raw === '') return undefined;
  if (type === 'number') {
    const n = Number(raw);
    return Number.isFinite(n) ? n : undefined;
  }
  if (type === 'boolean') {
    const lowered = raw.trim().toLowerCase();
    if (lowered === 'true' || lowered === '1' || lowered === 'yes') return true;
    if (lowered === 'false' || lowered === '0' || lowered === 'no') return false;
    return undefined;
  }
  return raw;
}

function parseOptions(raw: string): string[] {
  return raw
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function draftInputToManifestInput(d: DraftInput): unknown {
  const base: Record<string, unknown> = {
    name: d.name,
    type: d.type,
  };
  if (d.label.trim()) base.label = d.label.trim();
  if (d.description.trim()) base.description = d.description.trim();
  if (d.required) base.required = true;
  const def = coerceDefault(d.defaultRaw, d.type);
  if (def !== undefined) base.default = def;
  if (d.type === 'enum') {
    const options = parseOptions(d.optionsRaw);
    base.options = options;
  }
  return base;
}

function draftCapabilityToManifestCap(d: DraftCapability): CapabilityRequirement {
  const out: { connectorId?: string; toolName?: string; description?: string } = {};
  if (d.connectorId.trim()) out.connectorId = d.connectorId.trim();
  if (d.toolName.trim()) out.toolName = d.toolName.trim();
  if (d.description.trim()) out.description = d.description.trim();
  return out;
}

/**
 * Convert a draft to the unvalidated object that goes into `parseManifest`.
 * Returns `unknown` because the result may still fail validation (empty id,
 * malformed semver, etc.) — that's the point: we want the schema to be the
 * authoritative gate, not a series of ad-hoc checks here.
 */
export function draftToManifestInput(draft: SkillDraft): unknown {
  const out: Record<string, unknown> = {
    schemaVersion: 1,
    id: draft.id,
    version: draft.version,
    name: draft.name,
    description: draft.description,
    inputs: draft.inputs.map(draftInputToManifestInput),
    prompt: draft.prompt,
    requires: {
      capabilities: draft.capabilities.map(draftCapabilityToManifestCap),
    },
  };
  if (draft.category.trim()) out.category = draft.category.trim();
  if (draft.icon.trim()) out.icon = draft.icon.trim();
  if (draft.authorName.trim()) {
    out.author = { name: draft.authorName.trim() };
  }
  return out;
}

// ── Validation ───────────────────────────────────────────────────────────

/**
 * Validate the draft against the canonical Zod schema and return a
 * field-level error map keyed by dotted path. Every form field maps onto
 * one of these paths so the UI can surface inline messages without
 * re-implementing schema rules.
 */
export function validateDraft(draft: SkillDraft): DraftValidation {
  const result = parseManifest(draftToManifestInput(draft));
  if (result.ok) {
    return { ok: true, errors: {}, manifest: result.manifest };
  }
  const errors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const path = issue.path.length ? issue.path.join('.') : '<root>';
    // First error per path wins — the first one is usually the most
    // actionable (later issues are often consequences of the first).
    if (!errors[path]) errors[path] = issue.message;
  }
  return { ok: false, errors };
}

// ── Variable extraction ──────────────────────────────────────────────────
// Pulls `{{variable}}` references out of a prompt string. Used by the
// editor's autocomplete provider and by `TemplatePreview` to flag
// references that don't correspond to a declared input.

const VAR_PATTERN = /\{\{\s*(?:#(?:if|unless)\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g;

export interface ExtractedVariable {
  name: string;
  /** True when the prompt references it but no input declares it. */
  undeclared: boolean;
}

export function extractTemplateVariables(
  prompt: string,
  declaredInputs: ReadonlyArray<{ name: string }>
): ExtractedVariable[] {
  const declared = new Set(declaredInputs.map((i) => i.name));
  const seen = new Set<string>();
  const out: ExtractedVariable[] = [];
  let match: RegExpExecArray | null;
  // Reset lastIndex defensively — VAR_PATTERN is a module-level regex with
  // the /g flag, so a stray reuse from elsewhere could leave it dirty.
  VAR_PATTERN.lastIndex = 0;
  while ((match = VAR_PATTERN.exec(prompt)) !== null) {
    const name = match[1];
    if (seen.has(name)) continue;
    seen.add(name);
    out.push({ name, undeclared: !declared.has(name) });
  }
  return out;
}

// ── Sample-input synthesis ───────────────────────────────────────────────
// `TemplatePreview` needs concrete values to feed into the renderer. We
// synthesize sensible placeholders so authors see real output without
// having to fill in every field by hand. The user can override individual
// values via a sample-values map.

export function synthesizeSampleValues(
  inputs: ReadonlyArray<SkillInput>,
  overrides: Readonly<Record<string, string | number | boolean>> = {}
): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const input of inputs) {
    if (Object.prototype.hasOwnProperty.call(overrides, input.name)) {
      out[input.name] = overrides[input.name];
      continue;
    }
    if (input.default !== undefined) {
      out[input.name] = input.default;
      continue;
    }
    if (input.type === 'boolean') out[input.name] = false;
    else if (input.type === 'number') out[input.name] = 0;
    else if (input.type === 'enum') out[input.name] = input.options?.[0] ?? '';
    else out[input.name] = `<${input.name}>`;
  }
  return out;
}
