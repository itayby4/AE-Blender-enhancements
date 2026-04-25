// ── @pipefx/skills/marketplace — bundle import ───────────────────────────
// Parse a `.pfxskill` byte stream into a structured `ParsedBundle`. Used
// by the desktop's import dialog (browser-side) to display the
// fingerprint + capability list to the user before forwarding to
// `/api/skills/install` for the actual cryptographic verification.
//
// The split (parse here, verify in backend) is deliberate:
//
//   • Parsing is browser-safe (just JSON + Zod). The desktop can show a
//     consent UI without spinning up Node crypto.
//
//   • Verification requires Ed25519 + the canonical-payload algorithm,
//     both of which live in `domain/signing.ts` (Node-only). The backend
//     is the trust boundary; doing the cryptographic check there means a
//     compromised browser can't fake a signed install.
//
// Returns a tagged result rather than throwing — the import dialog wants
// to render field-level errors (bad manifest, bad base64, missing
// signature) inline, not catch a stack trace.

import type { SkillManifest } from '../contracts/types.js';
import {
  bundleEnvelopeSchema,
  type BundleEnvelopeWire,
} from './bundle-format.js';

// ── Public types ─────────────────────────────────────────────────────────

export interface ParsedResource {
  path: string;
  /** Decoded resource bytes. */
  content: Uint8Array;
}

export interface ParsedBundle {
  manifest: SkillManifest;
  resources: ParsedResource[];
  signing?: {
    /** Hex-encoded signature, ready to forward to `/api/skills/install`. */
    signatureHex: string;
    /** Hex-encoded public key, ready to forward. */
    publicKeyHex: string;
  };
}

export type ImportBundleResult =
  | { ok: true; bundle: ParsedBundle }
  | { ok: false; error: string; issues?: ReadonlyArray<{ path: string; message: string }> };

// ── Public API ───────────────────────────────────────────────────────────

/**
 * Parse a UTF-8 byte stream containing a `.pfxskill` envelope. Validates
 * the envelope shape + the embedded manifest, but does NOT verify the
 * Ed25519 signature — see module header.
 */
export function parseSkillBundle(bytes: Uint8Array): ImportBundleResult {
  let envelope: BundleEnvelopeWire;
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    const json = JSON.parse(text);
    const validation = bundleEnvelopeSchema.safeParse(json);
    if (!validation.success) {
      return {
        ok: false,
        error: 'invalid .pfxskill envelope',
        issues: validation.error.issues.map((i) => ({
          path: i.path.join('.') || '<root>',
          message: i.message,
        })),
      };
    }
    envelope = validation.data;
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? `bundle parse failed: ${error.message}`
          : 'bundle parse failed',
    };
  }

  const resources: ParsedResource[] = [];
  for (const resource of envelope.resources) {
    let content: Uint8Array;
    try {
      content = base64ToBytes(resource.contentBase64);
    } catch (error) {
      return {
        ok: false,
        error: `resource "${resource.path}" has malformed base64: ${
          error instanceof Error ? error.message : String(error)
        }`,
      };
    }
    resources.push({ path: resource.path, content });
  }

  const bundle: ParsedBundle = {
    manifest: envelope.manifest,
    resources,
  };

  if (envelope.signature && envelope.publicKey) {
    bundle.signing = {
      signatureHex: envelope.signature,
      publicKeyHex: envelope.publicKey,
    };
  }

  return { ok: true, bundle };
}

/**
 * Convert a parsed bundle into the `/api/skills/install` request body.
 * The split (parse → install request) keeps the install endpoint a thin
 * pass-through and lets the consent UI mutate the request (e.g. adding
 * a `source: 'shared-link'` discriminator) before forwarding.
 */
export function bundleToInstallRequest(bundle: ParsedBundle): {
  manifest: SkillManifest;
  signature?: string;
  publicKey?: string;
} {
  if (bundle.signing) {
    return {
      manifest: bundle.manifest,
      signature: bundle.signing.signatureHex,
      publicKey: bundle.signing.publicKeyHex,
    };
  }
  return { manifest: bundle.manifest };
}

// ── Internals ────────────────────────────────────────────────────────────

function base64ToBytes(base64: string): Uint8Array {
  // `atob` is universal (Node 16+, every browser). Throws on malformed
  // input, which we surface as a structured error one frame up.
  const binary = atob(base64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}
