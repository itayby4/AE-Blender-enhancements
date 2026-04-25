// ── @pipefx/skills/marketplace — bundle export ───────────────────────────
// Serialize a manifest + (optional) resources + (optional) signature into
// the .pfxskill JSON envelope. Produces UTF-8 bytes ready to write to
// disk, attach to email, or stream over HTTP — the choice is the caller's.
//
// Two intentional non-features:
//
//   • We do NOT sign here. Signing requires a private key — a secret the
//     marketplace layer should never see. Authoring tooling generates
//     the signature via `signSkill` (in `domain/signing.ts`, Node-only)
//     and then passes the resulting bytes here. Keeping the boundary
//     explicit makes the trust path easy to audit.
//
//   • We do NOT pretty-print. Bundles are machine-to-machine; saving a
//     few KB across thousands of installs adds up. If you need to inspect
//     one, pipe through `jq .`.

import type { SkillManifest } from '../contracts/types.js';
import {
  BUNDLE_SCHEMA_VERSION,
  type BundleEnvelopeWire,
} from './bundle-format.js';

// ── Public types ─────────────────────────────────────────────────────────

export interface ExportableResource {
  path: string;
  /** Raw resource bytes. Encoded as base64 inside the envelope. */
  content: Uint8Array;
}

export interface ExportSkillBundleInput {
  manifest: SkillManifest;
  resources?: ReadonlyArray<ExportableResource>;
  /** Optional cryptographic envelope. Both fields must be present or both
   *  absent — the schema validates that contract on import. */
  signing?: {
    /** Raw 64-byte Ed25519 signature (from `signSkill`). */
    signature: Uint8Array;
    /** Raw 32-byte Ed25519 public key. */
    publicKey: Uint8Array;
  };
}

// ── Public API ───────────────────────────────────────────────────────────

/**
 * Serialize a skill into the canonical .pfxskill envelope. Returns
 * UTF-8-encoded JSON bytes — write directly to disk or POST as-is.
 */
export function exportSkillBundle(
  input: ExportSkillBundleInput
): Uint8Array {
  const envelope = buildEnvelope(input);
  const json = JSON.stringify(envelope);
  return new TextEncoder().encode(json);
}

/**
 * Same as `exportSkillBundle` but returns the in-memory envelope object
 * — useful when the caller wants to mutate or inspect the structure
 * before serializing (e.g. to add a custom resource manifest comment).
 */
export function buildSkillBundleEnvelope(
  input: ExportSkillBundleInput
): BundleEnvelopeWire {
  return buildEnvelope(input);
}

// ── Internals ────────────────────────────────────────────────────────────

function buildEnvelope(input: ExportSkillBundleInput): BundleEnvelopeWire {
  const resources = (input.resources ?? []).map((resource) => ({
    path: resource.path,
    contentBase64: bytesToBase64(resource.content),
  }));

  // The Zod-inferred envelope shape uses mutable arrays (zod's default)
  // while `SkillManifest` declares its arrays as `readonly`. We're handing
  // off a valid manifest as-is — same cast pattern manifest-schema.ts uses
  // when narrowing the parsed result back to the contract type.
  const envelope: BundleEnvelopeWire = {
    schemaVersion: BUNDLE_SCHEMA_VERSION,
    manifest: input.manifest as BundleEnvelopeWire['manifest'],
    resources,
  };

  if (input.signing) {
    envelope.signature = bytesToHex(input.signing.signature);
    envelope.publicKey = bytesToHex(input.signing.publicKey);
  }

  return envelope;
}

// Browser-friendly base64. Node also supports `btoa` on string-of-bytes,
// but going through binary string for compat with browsers that haven't
// adopted the `Uint8Array.toBase64()` proposal yet.
function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  // Chunk to avoid blowing the call stack on large resources — 64 KB is
  // well below every runtime's String.fromCharCode arg limit.
  const chunkSize = 0x10000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...slice);
  }
  // `btoa` is universal (Node 16+, every browser).
  return btoa(binary);
}

function bytesToHex(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 1) {
    out += bytes[i].toString(16).padStart(2, '0');
  }
  return out;
}
