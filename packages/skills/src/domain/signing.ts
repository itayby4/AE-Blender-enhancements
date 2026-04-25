// ── @pipefx/skills/domain — Ed25519 signing ──────────────────────────────
// Sign and verify a skill bundle. The signature covers:
//
//   1. The full SkillManifest (canonical-JSON serialized — see canonicalJSON
//      below). This INCLUDES `requires.capabilities`. The phase-07 doc lists
//      capabilities as "not signed" because the install flow re-displays
//      them for the user to consent to; we sign them anyway as defense in
//      depth so a tampered bundle can't quietly swap requirements past a
//      cached install. The user-facing consent prompt is unchanged.
//
//   2. Bundled resources, hashed by content (sha256, hex). Resources are
//      sorted by path before hashing so the signature is order-independent
//      across however the caller assembled the bundle.
//
// What signing does NOT do:
//
//   • It does NOT prove the author is trustworthy. It only proves the
//     bundle was produced by whoever holds the private key matching the
//     embedded public key. There is no global trust root in v1; the user
//     evaluates trust at install time via the fingerprint + capability list.
//
//   • It does NOT defend against prompt injection from skill INPUTS at run
//     time. That is the brain-loop's job (input sanitization). Signing only
//     verifies that the prompt TEMPLATE the user reviewed at install is the
//     same one the runner executes.
//
// Algorithm: Ed25519 (RFC 8032). Chosen because (a) deterministic — same
// payload + key always yields the same signature, which makes signatures
// reproducible across machines, and (b) the private + public keys are 32
// raw bytes each, so storage and fingerprinting are trivial.

import {
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  type KeyObject,
  sign as cryptoSign,
  verify as cryptoVerify,
} from 'node:crypto';

import type { SkillManifest } from '../contracts/types.js';

// ── Public types ─────────────────────────────────────────────────────────

export interface SkillKeyPair {
  /** Raw 32-byte Ed25519 public key. */
  publicKey: Uint8Array;
  /** Raw 32-byte Ed25519 private key (the seed; the public key is derived
   *  from it). Treat as a secret — never persist alongside a `.pfxskill`. */
  privateKey: Uint8Array;
}

export interface SignableResource {
  /** POSIX-style relative path inside the bundle. Sorted lexicographically
   *  before signing, so the order the caller passes them in does not
   *  matter. Duplicate paths are rejected. */
  path: string;
  content: Uint8Array;
}

export interface SignablePayload {
  manifest: SkillManifest;
  resources?: ReadonlyArray<SignableResource>;
}

// ── Key generation + (de)serialization ───────────────────────────────────

export function generateSkillKeyPair(): SkillKeyPair {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  return {
    publicKey: publicKeyToBytes(publicKey),
    privateKey: privateKeyToBytes(privateKey),
  };
}

/**
 * Hex-encoded SHA-256 of the raw 32-byte public key. Stable across runs,
 * machines, and languages — anyone with the public key can reproduce it.
 *
 * Matches the manifest schema's `publicKeyFingerprint` regex
 * (`/^[0-9a-f]{16,128}$/i`). The user-facing "this skill is signed by …"
 * dialog truncates further for display; the full hex is kept on disk so
 * comparison stays unambiguous.
 */
export function fingerprintPublicKey(publicKey: Uint8Array): string {
  if (publicKey.byteLength !== 32) {
    throw new Error(
      `Ed25519 public key must be 32 bytes, got ${publicKey.byteLength}`
    );
  }
  return createHash('sha256').update(publicKey).digest('hex');
}

// ── Signing + verification ───────────────────────────────────────────────

/**
 * Produce an Ed25519 signature over the canonical payload bytes. Returns a
 * raw 64-byte signature (RFC 8032).
 */
export function signSkill(
  payload: SignablePayload,
  privateKey: Uint8Array
): Uint8Array {
  const bytes = canonicalPayloadBytes(payload);
  const key = privateKeyFromBytes(privateKey);
  return new Uint8Array(cryptoSign(null, Buffer.from(bytes), key));
}

/**
 * Verify an Ed25519 signature against the canonical payload + public key.
 * Returns false on any failure (bad signature, wrong key, malformed input)
 * rather than throwing — install flows want a single boolean to gate on.
 */
export function verifySkill(
  payload: SignablePayload,
  signature: Uint8Array,
  publicKey: Uint8Array
): boolean {
  try {
    const bytes = canonicalPayloadBytes(payload);
    const key = publicKeyFromBytes(publicKey);
    return cryptoVerify(
      null,
      Buffer.from(bytes),
      key,
      Buffer.from(signature)
    );
  } catch {
    // Any error from key parsing, length validation, or the underlying
    // verify call is treated as a failed signature.
    return false;
  }
}

// ── Canonical serialization (exported for tests + tooling) ───────────────

/**
 * Build the byte string an Ed25519 signature is computed over. Two inputs
 * that the user sees as equivalent must produce identical bytes:
 *
 *   • Object keys are sorted (so `{a, b}` and `{b, a}` are the same).
 *   • `undefined` properties are stripped (matching JSON's behavior).
 *   • Resources are sorted by path and reduced to `{path, sha256}` so a
 *     huge binary asset doesn't bloat the signed payload.
 *
 * Exported so tooling (debugger, "show me what was signed" diagnostics)
 * and the test suite can reproduce the exact bytes the algorithm sees.
 */
export function canonicalPayloadBytes(payload: SignablePayload): Uint8Array {
  const resources = (payload.resources ?? [])
    .slice()
    .sort(comparePaths)
    .map((resource, index, sorted) => {
      if (index > 0 && sorted[index - 1].path === resource.path) {
        throw new Error(
          `duplicate resource path in signable payload: ${resource.path}`
        );
      }
      return { path: resource.path, sha256: hashHex(resource.content) };
    });
  const canonical = {
    manifest: payload.manifest,
    resources,
  };
  return new TextEncoder().encode(canonicalJSON(canonical));
}

// ── Internals ────────────────────────────────────────────────────────────

function canonicalJSON(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'boolean' || typeof value === 'number') {
    if (typeof value === 'number' && !Number.isFinite(value)) {
      throw new Error(`canonical JSON cannot encode non-finite number: ${value}`);
    }
    return JSON.stringify(value);
  }
  if (typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return '[' + value.map(canonicalJSON).join(',') + ']';
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj)
      .filter((k) => obj[k] !== undefined)
      .sort();
    return (
      '{' +
      keys
        .map((k) => JSON.stringify(k) + ':' + canonicalJSON(obj[k]))
        .join(',') +
      '}'
    );
  }
  throw new Error(`canonical JSON cannot encode value of type ${typeof value}`);
}

function comparePaths(a: SignableResource, b: SignableResource): number {
  if (a.path < b.path) return -1;
  if (a.path > b.path) return 1;
  return 0;
}

function hashHex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

// Node's crypto API works in KeyObjects, but on the wire we want raw 32-byte
// keys (the natural Ed25519 representation). JWK is the supported bridge —
// import/export with `format: 'jwk'` round-trips cleanly on every Node 20+
// release.

function publicKeyFromBytes(bytes: Uint8Array): KeyObject {
  if (bytes.byteLength !== 32) {
    throw new Error(
      `Ed25519 public key must be 32 bytes, got ${bytes.byteLength}`
    );
  }
  return createPublicKey({
    key: { kty: 'OKP', crv: 'Ed25519', x: base64url(bytes) },
    format: 'jwk',
  });
}

function publicKeyToBytes(key: KeyObject): Uint8Array {
  const jwk = key.export({ format: 'jwk' }) as { x?: string };
  if (!jwk.x) throw new Error('Ed25519 public key JWK missing "x"');
  return base64urlDecode(jwk.x);
}

function privateKeyFromBytes(bytes: Uint8Array): KeyObject {
  if (bytes.byteLength !== 32) {
    throw new Error(
      `Ed25519 private key must be 32 bytes, got ${bytes.byteLength}`
    );
  }
  // The public-key half of an Ed25519 keypair is derived from the private
  // seed, but Node's JWK importer wants both halves explicitly. Derive the
  // public half by importing the seed once via PKCS#8, exporting JWK, and
  // re-importing with both fields. This is the ergonomic price of staying
  // on Node's built-in crypto instead of pulling in a userland Ed25519 lib.
  const pkcs8 = encodeEd25519Pkcs8(bytes);
  const tmp = createPrivateKey({ key: pkcs8, format: 'der', type: 'pkcs8' });
  const jwk = tmp.export({ format: 'jwk' }) as { x?: string; d?: string };
  if (!jwk.x || !jwk.d) {
    throw new Error('Ed25519 private key JWK missing "x" or "d"');
  }
  return createPrivateKey({
    key: { kty: 'OKP', crv: 'Ed25519', x: jwk.x, d: jwk.d },
    format: 'jwk',
  });
}

function privateKeyToBytes(key: KeyObject): Uint8Array {
  const jwk = key.export({ format: 'jwk' }) as { d?: string };
  if (!jwk.d) throw new Error('Ed25519 private key JWK missing "d"');
  return base64urlDecode(jwk.d);
}

// PKCS#8 wrapping for an Ed25519 seed. Constant 16-byte prefix per
// RFC 8410 §7 (PrivateKeyInfo + AlgorithmIdentifier(id-Ed25519) + the
// inner OCTET STRING wrapping the 32-byte seed).
const ED25519_PKCS8_PREFIX = Buffer.from([
  0x30, 0x2e, // SEQUENCE, 46 bytes
  0x02, 0x01, 0x00, // INTEGER 0  (version)
  0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, // AlgorithmIdentifier: 1.3.101.112
  0x04, 0x22, 0x04, 0x20, // OCTET STRING (34) wrapping OCTET STRING (32)
]);

function encodeEd25519Pkcs8(seed: Uint8Array): Buffer {
  return Buffer.concat([ED25519_PKCS8_PREFIX, Buffer.from(seed)]);
}

function base64url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64url');
}

function base64urlDecode(s: string): Uint8Array {
  return new Uint8Array(Buffer.from(s, 'base64url'));
}
