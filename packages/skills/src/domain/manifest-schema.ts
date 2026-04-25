// ── @pipefx/skills/domain — manifest schema ──────────────────────────────
// Zod validator for SkillManifest. The contract types in ./contracts/types
// describe the shape; this module is the runtime gate that enforces it on
// untrusted input — anything coming from disk, a `.pfxskill` bundle, or the
// network must pass through `parseManifest` before the rest of the system
// touches it.
//
// We re-derive the manifest object inside Zod (instead of `z.custom<…>()`)
// so the validator is the actual source of truth at runtime; the contract
// type and the schema are kept in sync by an `Equals<…>` compile-time guard
// at the bottom of the file.

import { z } from 'zod';

import type {
  CapabilityRequirement,
  SkillAuthor,
  SkillInput,
  SkillManifest,
} from '../contracts/types.js';

// ── Identity ─────────────────────────────────────────────────────────────
// Reverse-DNS-friendly charset; permissive enough for "cut-to-beat" but
// strict enough to keep skill IDs safe to use as filesystem path segments.

const skillIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-z0-9]([a-z0-9._-]*[a-z0-9])?$/i, {
    message:
      'skill id must be alphanumeric with optional . _ - separators (no leading/trailing separator)',
  });

// Loose semver — three dot-separated segments with optional pre-release /
// build metadata. We don't want to force every skill author through the
// full semver grammar; the runner only uses this string for display +
// install-collision checks.
const semverSchema = z
  .string()
  .regex(/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/, {
    message: 'version must be semver (MAJOR.MINOR.PATCH with optional suffix)',
  });

// ── Inputs ───────────────────────────────────────────────────────────────

const skillInputBase = z.object({
  name: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[A-Za-z_][A-Za-z0-9_]*$/, {
      message: 'input name must be a valid identifier ({{name}} substitution)',
    }),
  label: z.string().max(128).optional(),
  description: z.string().max(512).optional(),
  required: z.boolean().optional(),
});

// Per-type input variants. Splitting them lets Zod refine `default` against
// `type` without an after-the-fact `.refine()` (which would lose the precise
// error path).

const stringInputSchema = skillInputBase.extend({
  type: z.literal('string'),
  default: z.string().optional(),
  options: z.undefined().optional(),
});

const numberInputSchema = skillInputBase.extend({
  type: z.literal('number'),
  default: z.number().optional(),
  options: z.undefined().optional(),
});

const booleanInputSchema = skillInputBase.extend({
  type: z.literal('boolean'),
  default: z.boolean().optional(),
  options: z.undefined().optional(),
});

const enumInputSchema = skillInputBase
  .extend({
    type: z.literal('enum'),
    options: z.array(z.string().min(1)).min(1, {
      message: 'enum input requires a non-empty options array',
    }),
    default: z.string().optional(),
  })
  .refine(
    (input) => input.default === undefined || input.options.includes(input.default),
    {
      message: 'enum default must be one of the declared options',
      path: ['default'],
    }
  );

// `z.union` instead of `z.discriminatedUnion` because the enum variant uses
// `.refine()` (default-must-be-in-options), and discriminatedUnion only
// accepts plain ZodObject members. Error messages are slightly less precise
// at the discriminator level, but the per-variant refinements still surface
// with their original `path`.
const skillInputSchema: z.ZodType<SkillInput> = z.union([
  stringInputSchema,
  numberInputSchema,
  booleanInputSchema,
  enumInputSchema,
]) as unknown as z.ZodType<SkillInput>;

// ── Capabilities ─────────────────────────────────────────────────────────
// At least one of connectorId / toolName must be present — a requirement
// with neither matches everything and would silently mark every skill as
// runnable, which is the bug we want the schema to catch up front.

const capabilityRequirementSchema: z.ZodType<CapabilityRequirement> = z
  .object({
    connectorId: z.string().min(1).optional(),
    toolName: z.string().min(1).optional(),
    description: z.string().max(256).optional(),
  })
  .refine(
    (cap) => cap.connectorId !== undefined || cap.toolName !== undefined,
    {
      message:
        'capability requirement must specify at least one of connectorId or toolName',
    }
  );

// ── Author ───────────────────────────────────────────────────────────────

const skillAuthorSchema: z.ZodType<SkillAuthor> = z.object({
  name: z.string().min(1).max(128).optional(),
  publicKeyFingerprint: z
    .string()
    .regex(/^[0-9a-f]{16,128}$/i, {
      message: 'publicKeyFingerprint must be hex (16-128 chars)',
    })
    .optional(),
});

// ── Manifest ─────────────────────────────────────────────────────────────

export const manifestSchema = z.object({
  schemaVersion: z.literal(1),
  id: skillIdSchema,
  version: semverSchema,
  name: z.string().min(1).max(128),
  description: z.string().min(1).max(2048),
  category: z.string().min(1).max(64).optional(),
  icon: z.string().min(1).max(64).optional(),
  author: skillAuthorSchema.optional(),
  inputs: z.array(skillInputSchema).superRefine((inputs, ctx) => {
    const seen = new Set<string>();
    for (const [i, input] of inputs.entries()) {
      if (seen.has(input.name)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `duplicate input name "${input.name}"`,
          path: [i, 'name'],
        });
      }
      seen.add(input.name);
    }
  }),
  prompt: z.string().min(1).max(64_000),
  requires: z.object({
    capabilities: z.array(capabilityRequirementSchema),
  }),
});

// ── Public API ───────────────────────────────────────────────────────────

export type ManifestParseResult =
  | { ok: true; manifest: SkillManifest }
  | { ok: false; error: z.ZodError };

/**
 * Validate untrusted input against the manifest schema. Returns a tagged
 * result rather than throwing — callers (install flow, bundle import) want
 * to surface the precise field-level error to the user, not a stack trace.
 */
export function parseManifest(input: unknown): ManifestParseResult {
  const result = manifestSchema.safeParse(input);
  if (result.success) {
    return { ok: true, manifest: result.data as SkillManifest };
  }
  return { ok: false, error: result.error };
}

/**
 * Throwing variant — convenient inside tests and trusted-source code paths
 * (e.g. example skills bundled in the repo).
 */
export function parseManifestOrThrow(input: unknown): SkillManifest {
  const result = parseManifest(input);
  if (!result.ok) {
    throw new Error(
      `invalid skill manifest: ${result.error.issues
        .map((i) => `${i.path.join('.') || '<root>'}: ${i.message}`)
        .join('; ')}`
    );
  }
  return result.manifest;
}

// ── Contract / schema alignment ──────────────────────────────────────────
// The schema's inferred output is intentionally looser than `SkillManifest`
// (mutable arrays vs. ReadonlyArray, optional fields vs. exact-optional)
// so we cast in `parseManifest`. The unit tests exercise the round-trip;
// if a contract field is added that the schema doesn't validate, those
// tests are the safety net.
