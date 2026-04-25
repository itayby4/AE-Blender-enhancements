// ── @pipefx/skills/marketplace — .pfxskill envelope ──────────────────────
// Wire format for skill share/import. A `.pfxskill` is a single UTF-8
// JSON file (extension by convention, content sniffable by the
// `schemaVersion` discriminator). Choosing JSON over zip keeps the
// dependency footprint zero, lets users inspect bundles with `cat` or
// `jq`, and matches the on-the-wire shape `/api/skills/install` already
// accepts — the bundle is essentially that payload plus `resources`.
//
// Resources are base64-encoded so binary assets (icons, sample data)
// round-trip through the same JSON envelope. We could move to a zip
// container later if we ever ship multi-megabyte skills, but at v1 every
// skill we expect to publish stays well under 100 KB.
//
// What this module does NOT do:
//
//   • Verify Ed25519 signatures. That requires `node:crypto`, which we
//     deliberately keep out of this layer so browser consumers (the
//     desktop's import dialog) can parse + display fingerprints + the
//     capability list to the user without dragging in a Node runtime.
//     The actual verify happens server-side at `/api/skills/install`,
//     which is also where it's enforced as a trust boundary.
//
//   • Persist bundles. Storage is the SkillStore's job (Phase 7.6). The
//     marketplace produces and consumes byte streams; whether they go to
//     disk, the network, or stay in memory is the caller's choice.

import { z } from 'zod';

import { manifestSchema } from '../domain/manifest-schema.js';

// ── Bundle resource ──────────────────────────────────────────────────────
// A resource is `{ path, contentBase64 }`. The path is sorted before
// signing (see signing.ts), so the order resources appear in the bundle
// does not affect the canonical signature payload — meaning a re-export
// with sorted paths produces an identical signature, which is convenient
// for diffing.

const bundleResourceSchema = z.object({
  /** POSIX-style relative path inside the bundle (e.g. `icon.svg`). */
  path: z
    .string()
    .min(1)
    .max(512)
    .regex(/^[^\\/][^\\]*$/, {
      message: 'resource path must be relative + POSIX-style (no backslashes, no leading slash)',
    })
    .refine((p) => !p.includes('..'), {
      message: 'resource path must not contain ".." segments',
    }),
  /** Base64-encoded content. Decoded by `parseSkillBundle`. */
  contentBase64: z.string().min(0).max(8 * 1024 * 1024 * 4 / 3), // ~8 MB raw cap
});

export type BundleResourceWire = z.infer<typeof bundleResourceSchema>;

// ── Envelope ─────────────────────────────────────────────────────────────
// `signature` and `publicKey` are hex-encoded so the bundle stays plain
// JSON (no base64 needed for the cryptographic material — it's small).
// They MUST be both present or both absent; mixed presence is rejected
// loudly because it's always an integration bug, not a partial-trust use
// case.

const hexSchema = z
  .string()
  .min(1)
  .regex(/^[0-9a-f]+$/i, { message: 'must be hex-encoded' });

export const bundleEnvelopeSchema = z
  .object({
    /** On-the-wire schema version; bumps on incompatible changes. */
    schemaVersion: z.literal(1),
    manifest: manifestSchema,
    resources: z.array(bundleResourceSchema).max(256).default([]),
    /** Hex-encoded Ed25519 signature over the canonical payload. */
    signature: hexSchema.optional(),
    /** Hex-encoded Ed25519 public key (32 bytes = 64 hex chars). */
    publicKey: hexSchema
      .length(64, { message: 'publicKey must be 64 hex chars (32-byte Ed25519 key)' })
      .optional(),
  })
  .refine(
    (env) =>
      (env.signature === undefined) === (env.publicKey === undefined),
    {
      message: 'signature and publicKey must both be provided, or both omitted',
      path: ['signature'],
    }
  );

export type BundleEnvelopeWire = z.infer<typeof bundleEnvelopeSchema>;

/** Current envelope version. Bump on incompatible wire changes. */
export const BUNDLE_SCHEMA_VERSION = 1 as const;
