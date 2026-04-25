// ── @pipefx/skills/domain — SKILL.md frontmatter schema ──────────────────
// Runtime gate for the v2 (Phase 12) Markdown-based skill format. Mirrors
// the role of `manifest-schema.ts` for v1 JSON manifests: anything that
// arrived from disk, a bundle, or the network goes through `parseFrontmatter`
// before the rest of the system trusts it.
//
// Kept separate from `manifest-schema.ts` because the shapes diverge —
// merging them would force one schema to bend around the other's quirks.
// A small amount of duplication (the id regex, the input-name regex) is
// acceptable given the schemas are versioned independently.

import { z } from 'zod';

import type {
  SkillBundledUiManifest,
  SkillFrontmatter,
  SkillFrontmatterInput,
  SkillFrontmatterRequires,
  SkillFrontmatterScripts,
} from '../contracts/skill-md.js';

// ── Identity ─────────────────────────────────────────────────────────────
// Same charset rule as v1: alphanumeric with optional . _ - separators,
// no leading/trailing separator. Skill ids are filesystem path segments
// in v2 (`<root>/<id>/SKILL.md`), so the constraint is load-bearing.

const skillIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-z0-9]([a-z0-9._-]*[a-z0-9])?$/i, {
    message:
      'skill id must be alphanumeric with optional . _ - separators (no leading/trailing separator)',
  });

const inputIdSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z_][A-Za-z0-9_]*$/, {
    message: 'input id must be a valid identifier ({{id}} substitution)',
  });

// Loose semver with optional pre-release / build metadata. Optional in v2.
const semverSchema = z
  .string()
  .regex(/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/, {
    message: 'version must be semver (MAJOR.MINOR.PATCH with optional suffix)',
  });

// ── Inputs ───────────────────────────────────────────────────────────────
// v2 widens the typeset (clip-ref, file). Defaults are validated against
// the declared type; enum default must be one of `options[]`.

const inputBase = z.object({
  id: inputIdSchema,
  label: z.string().max(128).optional(),
  description: z.string().max(512).optional(),
  required: z.boolean().optional(),
});

const stringInput = inputBase.extend({
  type: z.literal('string'),
  default: z.string().optional(),
  options: z.undefined().optional(),
});

const numberInput = inputBase.extend({
  type: z.literal('number'),
  default: z.number().optional(),
  options: z.undefined().optional(),
});

const booleanInput = inputBase.extend({
  type: z.literal('boolean'),
  default: z.boolean().optional(),
  options: z.undefined().optional(),
});

const enumInput = inputBase
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

// `clip-ref` and `file` accept no default in YAML (the picker UI fills it
// in at runtime). Allowing `default` here would be a foot-gun.
const clipRefInput = inputBase.extend({
  type: z.literal('clip-ref'),
  default: z.undefined().optional(),
  options: z.undefined().optional(),
});

const fileInput = inputBase.extend({
  type: z.literal('file'),
  default: z.undefined().optional(),
  options: z.undefined().optional(),
});

const inputSchema: z.ZodType<SkillFrontmatterInput> = z.union([
  stringInput,
  numberInput,
  booleanInput,
  enumInput,
  clipRefInput,
  fileInput,
]) as unknown as z.ZodType<SkillFrontmatterInput>;

// ── Requirements ─────────────────────────────────────────────────────────

const requiresSchema: z.ZodType<SkillFrontmatterRequires> = z.object({
  tools: z.array(z.string().min(1)).optional(),
  capabilities: z.array(z.string().min(1)).optional(),
});

// ── Scripts ──────────────────────────────────────────────────────────────
// `entry` is a relative path inside the skill directory; the loader is
// responsible for resolving + sandboxing it. Reject `..` segments and
// absolute paths up-front.

const relativePath = z
  .string()
  .min(1)
  .max(512)
  .refine((p) => !/^[\\/]/.test(p), {
    message: 'must be a relative path (no leading slash)',
  })
  .refine((p) => !p.split(/[\\/]/).includes('..'), {
    message: 'must not contain ".." segments',
  });

const scriptsSchema: z.ZodType<SkillFrontmatterScripts> = z.object({
  entry: relativePath,
  interpreter: z.string().min(1).max(64).optional(),
});

// ── Bundled UI manifest ──────────────────────────────────────────────────

const bundledUiSchema: z.ZodType<SkillBundledUiManifest> = z.object({
  entry: relativePath,
  mount: z.enum(['full-screen', 'sidebar', 'modal']).optional(),
});

// ── Frontmatter (top level) ──────────────────────────────────────────────
// Cross-field rule: `ui: bundled` requires `bundledUi`. Inputs must have
// unique ids (mirrors v1's duplicate-name check — the substitution engine
// can't disambiguate two `{{id}}` references to the same name).

export const frontmatterSchema = z
  .object({
    id: skillIdSchema,
    name: z.string().min(1).max(128),
    description: z.string().min(1).max(2048),
    category: z.string().min(1).max(64).optional(),
    icon: z.string().min(1).max(64).optional(),
    triggers: z.array(z.string().min(1).max(128)).max(64).optional(),
    inputs: z
      .array(inputSchema)
      .max(64)
      .superRefine((inputs, ctx) => {
        const seen = new Set<string>();
        for (const [i, input] of inputs.entries()) {
          if (seen.has(input.id)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `duplicate input id "${input.id}"`,
              path: [i, 'id'],
            });
          }
          seen.add(input.id);
        }
      })
      .optional(),
    requires: requiresSchema.optional(),
    scripts: scriptsSchema.optional(),
    ui: z.enum(['inline', 'bundled']).optional(),
    bundledUi: bundledUiSchema.optional(),
    version: semverSchema.optional(),
  })
  .superRefine((fm, ctx) => {
    if (fm.ui === 'bundled' && !fm.bundledUi) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'ui: bundled requires a `bundledUi` manifest',
        path: ['bundledUi'],
      });
    }
    if (fm.ui !== 'bundled' && fm.bundledUi) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: '`bundledUi` is only valid when ui: bundled',
        path: ['bundledUi'],
      });
    }
  });

// ── Public API ───────────────────────────────────────────────────────────

export type FrontmatterParseResult =
  | { ok: true; frontmatter: SkillFrontmatter }
  | { ok: false; error: z.ZodError };

/**
 * Validate untrusted frontmatter input. The parser (`parseSkillMd`) calls
 * this after splitting + YAML-decoding the SKILL.md source.
 */
export function parseFrontmatter(input: unknown): FrontmatterParseResult {
  const result = frontmatterSchema.safeParse(input);
  if (result.success) {
    return { ok: true, frontmatter: result.data as SkillFrontmatter };
  }
  return { ok: false, error: result.error };
}

/** Throwing variant — handy in tests and trusted-source paths. */
export function parseFrontmatterOrThrow(input: unknown): SkillFrontmatter {
  const result = parseFrontmatter(input);
  if (!result.ok) {
    throw new Error(
      `invalid skill frontmatter: ${result.error.issues
        .map((i) => `${i.path.join('.') || '<root>'}: ${i.message}`)
        .join('; ')}`
    );
  }
  return result.frontmatter;
}
