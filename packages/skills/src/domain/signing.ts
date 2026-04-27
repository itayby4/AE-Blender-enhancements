// ── @pipefx/skills/domain — Ed25519 signing (Phase 12.13) ────────────────
// Canonical payload + Web-Crypto-backed sign/verify for v2 skill bundles.
// Lives in the domain layer because the canonical-payload algorithm is
// the same in any host (CI tooling, backend install route, future
// browser-side preview). The actual sign/verify primitives delegate to
// `globalThis.crypto.subtle` so this module stays free of Node-only
// imports — Node 22+ and modern browsers support `Ed25519` natively.
//
// Canonical payload format (UTF-8 text, deterministic):
//
//   PFXSKILL/v2
//   skill-md <sha256-hex of SKILL.md UTF-8 bytes>
//   resource <relative-path> <sha256-hex of content>
//   resource <relative-path> <sha256-hex of content>
//   ...
//
// Resources are sorted by `path.localeCompare(other.path)` (matches the
// stable-order guarantee in `marketplace/bundle-v2.ts`). The header line
// pins the schema version — bumping the bundle format flips this string,
// so an old verifier refuses new bundles cleanly. The sidecar
// `pfxskill.json` carries `{ schemaVersion, signature, publicKey }`; this
// module produces / consumes the `signature` + `publicKey` halves.
//
// Out of scope:
//   • Key management. Callers supply Uint8Array key material; how those
//     bytes get into memory (env var, KMS fetch, dev keypair on disk) is
//     a host concern.
//   • Trust roots. The install route has a single hard-coded
//     `TRUSTED_PUBLIC_KEYS` list for now; a real registry lands with
//     the future Store work.
//   • Revocation. Out of scope for this phase per `phase-12-skills-v2.md`
//     §12.13.
//
// References:
//   - phase-12-skills-v2.md §12.13 ("Signing port + ship the built-ins
//     signed")

// ── Public types ─────────────────────────────────────────────────────────

export interface CanonicalPayloadResource {
  /** POSIX-style relative path inside the bundle (matches
   *  `ParsedSkillBundleResource.path`). */
  path: string;
  content: Uint8Array;
}

export interface CanonicalPayloadInput {
  /** SKILL.md source as a UTF-8 string — typically the canonical
   *  re-serialized form from `skill-md-storage.ts` so an installed copy
   *  produces the same hash as the bundle it came from. */
  skillMd: string;
  resources?: ReadonlyArray<CanonicalPayloadResource>;
}

export interface SkillBundleSignature {
  signatureHex: string;
  publicKeyHex: string;
}

export type VerifySignatureResult =
  | { ok: true }
  | { ok: false; error: string };

/** Schema marker baked into the canonical payload. Matches the `v2`
 *  bundle generation in `marketplace/bundle-v2.ts`. */
export const CANONICAL_PAYLOAD_VERSION = 'PFXSKILL/v2' as const;

// ── Public API ───────────────────────────────────────────────────────────

/**
 * Build the canonical payload bytes for a SKILL.md + resource set. The
 * bytes are the input to `signCanonicalPayload` / `verifyCanonicalPayload`
 * and are deterministic for any given input — same inputs always produce
 * byte-equal output, so two builds of the same skill diff cleanly.
 */
export async function buildCanonicalPayload(
  input: CanonicalPayloadInput
): Promise<Uint8Array> {
  const skillMdBytes = utf8.encode(input.skillMd);
  const skillMdHash = await sha256Hex(skillMdBytes);

  const resourceLines: string[] = [];
  if (input.resources && input.resources.length > 0) {
    const sorted = [...input.resources].sort((a, b) =>
      a.path.localeCompare(b.path)
    );
    for (const resource of sorted) {
      const hash = await sha256Hex(resource.content);
      resourceLines.push(`resource ${resource.path} ${hash}`);
    }
  }

  const text =
    `${CANONICAL_PAYLOAD_VERSION}\n` +
    `skill-md ${skillMdHash}\n` +
    (resourceLines.length > 0 ? resourceLines.join('\n') + '\n' : '');
  return utf8.encode(text);
}

/**
 * Sign a canonical payload with an Ed25519 private key. `privateKey` is
 * the raw 32-byte seed (the standard Ed25519 secret-key encoding); the
 * matching public key is exported alongside the signature so verifiers
 * have everything they need without an external lookup.
 */
export async function signCanonicalPayload(
  payload: Uint8Array,
  privateKey: Uint8Array
): Promise<SkillBundleSignature> {
  const subtle = requireSubtle();
  // Web Crypto's Ed25519 expects the private key in PKCS#8 form. Wrap
  // the raw 32-byte seed in the canonical PKCS#8 prefix so callers can
  // hand us the seed directly (which is what `ssh-keygen`-style tooling
  // and most KMS exports produce for Ed25519).
  const pkcs8 = wrapEd25519Seed(privateKey);
  const cryptoKey = await subtle.importKey(
    'pkcs8',
    pkcs8 as unknown as ArrayBuffer,
    { name: 'Ed25519' },
    true,
    ['sign']
  );
  const signature = new Uint8Array(
    await subtle.sign(
      { name: 'Ed25519' },
      cryptoKey,
      payload as unknown as ArrayBuffer
    )
  );
  const publicKey = await derivePublicKey(privateKey);
  return {
    signatureHex: bytesToHex(signature),
    publicKeyHex: bytesToHex(publicKey),
  };
}

/**
 * Verify a canonical-payload signature. Returns a discriminated result
 * so the install route can surface the failure reason without throwing
 * on adversarial input.
 */
export async function verifyCanonicalPayload(
  payload: Uint8Array,
  signature: SkillBundleSignature
): Promise<VerifySignatureResult> {
  const subtle = requireSubtle();
  let signatureBytes: Uint8Array;
  let publicKeyBytes: Uint8Array;
  try {
    signatureBytes = hexToBytes(signature.signatureHex);
  } catch (error) {
    return {
      ok: false,
      error: `signature is not valid hex: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }
  try {
    publicKeyBytes = hexToBytes(signature.publicKeyHex);
  } catch (error) {
    return {
      ok: false,
      error: `publicKey is not valid hex: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }
  if (publicKeyBytes.length !== 32) {
    return {
      ok: false,
      error: `publicKey must be 32 bytes (got ${publicKeyBytes.length})`,
    };
  }
  if (signatureBytes.length !== 64) {
    return {
      ok: false,
      error: `signature must be 64 bytes (got ${signatureBytes.length})`,
    };
  }
  let cryptoKey: MinimalCryptoKey;
  try {
    cryptoKey = await subtle.importKey(
      'raw',
      publicKeyBytes as unknown as ArrayBuffer,
      { name: 'Ed25519' },
      true,
      ['verify']
    );
  } catch (error) {
    return {
      ok: false,
      error: `failed to import public key: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }
  let valid: boolean;
  try {
    valid = await subtle.verify(
      { name: 'Ed25519' },
      cryptoKey,
      signatureBytes as unknown as ArrayBuffer,
      payload as unknown as ArrayBuffer
    );
  } catch (error) {
    return {
      ok: false,
      error: `verify call threw: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }
  if (!valid) {
    return { ok: false, error: 'signature does not match payload' };
  }
  return { ok: true };
}

/**
 * Generate a fresh Ed25519 keypair. Convenience wrapper for tooling
 * (`pnpm nx run skills-builtin:gen-key`). The private key is returned
 * as the raw 32-byte seed so it round-trips through file storage / env
 * vars without re-encoding gymnastics.
 */
export async function generateEd25519Keypair(): Promise<{
  privateKey: Uint8Array;
  publicKey: Uint8Array;
}> {
  const subtle = requireSubtle();
  const pair = await subtle.generateKey({ name: 'Ed25519' }, true, [
    'sign',
    'verify',
  ]);
  // Export the private key in PKCS#8 then strip the prefix to get back
  // the raw 32-byte seed. Symmetric with how `signCanonicalPayload`
  // re-wraps the seed before importing.
  const keyPair = pair as MinimalCryptoKeyPair;
  const pkcs8 = new Uint8Array(
    await subtle.exportKey('pkcs8', keyPair.privateKey)
  );
  const seed = unwrapEd25519Pkcs8(pkcs8);
  const publicRaw = new Uint8Array(
    await subtle.exportKey('raw', keyPair.publicKey)
  );
  return { privateKey: seed, publicKey: publicRaw };
}

// ── Hex helpers (public so test + CI tooling can share them) ─────────────

export function bytesToHex(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 1) {
    // `Uint8Array` index access is `number | undefined` under the
    // strict-noUncheckedIndexedAccess lens; the loop guard rules out
    // undefined but the compiler can't prove it. Default to 0 instead
    // of `!` so we don't pull in a non-null-assertion lint warning.
    const byte = bytes[i] ?? 0;
    out += byte.toString(16).padStart(2, '0');
  }
  return out;
}

export function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) {
    throw new Error(`hex string has odd length: ${hex.length}`);
  }
  if (!/^[0-9a-f]*$/i.test(hex)) {
    throw new Error('hex string contains non-hex characters');
  }
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

// ── Internals ────────────────────────────────────────────────────────────
// Minimal, local Web Crypto type surface. Declaring only what we use lets
// downstream tsconfigs (e.g. `apps/backend/tsconfig.app.json`) skip
// `lib: ["dom"]` without breaking the build — the runtime `crypto.subtle`
// is identical across Node 22+ and modern browsers, only the typings
// vary by environment.

interface MinimalCryptoKey {
  readonly type: 'public' | 'private' | 'secret';
}

interface MinimalCryptoKeyPair {
  readonly publicKey: MinimalCryptoKey;
  readonly privateKey: MinimalCryptoKey;
}

interface MinimalSubtleCrypto {
  importKey(
    format: string,
    keyData: ArrayBuffer | Uint8Array,
    algorithm: { name: string },
    extractable: boolean,
    keyUsages: ReadonlyArray<string>
  ): Promise<MinimalCryptoKey>;
  exportKey(
    format: 'raw' | 'pkcs8' | 'spki',
    key: MinimalCryptoKey
  ): Promise<ArrayBuffer>;
  exportKey(
    format: 'jwk',
    key: MinimalCryptoKey
  ): Promise<{ x?: string; [k: string]: unknown }>;
  sign(
    algorithm: { name: string },
    key: MinimalCryptoKey,
    data: ArrayBuffer | Uint8Array
  ): Promise<ArrayBuffer>;
  verify(
    algorithm: { name: string },
    key: MinimalCryptoKey,
    signature: ArrayBuffer | Uint8Array,
    data: ArrayBuffer | Uint8Array
  ): Promise<boolean>;
  digest(
    algorithm: string,
    data: ArrayBuffer | Uint8Array
  ): Promise<ArrayBuffer>;
  generateKey(
    algorithm: { name: string },
    extractable: boolean,
    keyUsages: ReadonlyArray<string>
  ): Promise<MinimalCryptoKeyPair | MinimalCryptoKey>;
}

const utf8 = new TextEncoder();

function requireSubtle(): MinimalSubtleCrypto {
  const subtle = (
    globalThis as unknown as { crypto?: { subtle?: MinimalSubtleCrypto } }
  ).crypto?.subtle;
  if (!subtle) {
    throw new Error(
      'globalThis.crypto.subtle is unavailable — Ed25519 signing requires Node 22+ or a modern browser'
    );
  }
  return subtle;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const subtle = requireSubtle();
  const digest = new Uint8Array(
    await subtle.digest('SHA-256', bytes as unknown as ArrayBuffer)
  );
  return bytesToHex(digest);
}

async function derivePublicKey(privateKey: Uint8Array): Promise<Uint8Array> {
  const subtle = requireSubtle();
  // Round-trip through PKCS#8 import + JWK export to recover the public
  // key. Web Crypto refuses to export `public` from a `private` JWK, so
  // we import then re-export to a public CryptoKey via `jwk` form.
  const pkcs8 = wrapEd25519Seed(privateKey);
  const privateCryptoKey = await subtle.importKey(
    'pkcs8',
    pkcs8 as unknown as ArrayBuffer,
    { name: 'Ed25519' },
    true,
    ['sign']
  );
  const jwk = await subtle.exportKey('jwk', privateCryptoKey);
  if (!jwk.x) {
    throw new Error('exported Ed25519 JWK is missing the public component');
  }
  return base64UrlToBytes(jwk.x);
}

// PKCS#8 wrapper for an Ed25519 raw seed. The 16-byte prefix encodes:
//   SEQUENCE(48) {
//     INTEGER(1) 0
//     SEQUENCE(5) { OID 1.3.101.112 (Ed25519) }
//     OCTET STRING(34) {
//       OCTET STRING(32) { <seed> }
//     }
//   }
// Documented in RFC 8410 §7.
const ED25519_PKCS8_PREFIX = new Uint8Array([
  0x30, 0x2e,
  0x02, 0x01, 0x00,
  0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70,
  0x04, 0x22, 0x04, 0x20,
]);

function wrapEd25519Seed(seed: Uint8Array): Uint8Array {
  if (seed.length !== 32) {
    throw new Error(`Ed25519 seed must be 32 bytes (got ${seed.length})`);
  }
  const out = new Uint8Array(ED25519_PKCS8_PREFIX.length + 32);
  out.set(ED25519_PKCS8_PREFIX, 0);
  out.set(seed, ED25519_PKCS8_PREFIX.length);
  return out;
}

function unwrapEd25519Pkcs8(pkcs8: Uint8Array): Uint8Array {
  if (pkcs8.length < ED25519_PKCS8_PREFIX.length + 32) {
    throw new Error(
      `Ed25519 PKCS#8 too short: ${pkcs8.length} (need at least ${ED25519_PKCS8_PREFIX.length + 32})`
    );
  }
  // The prefix is fixed for raw-seed keys; pull the trailing 32 bytes.
  return pkcs8.slice(pkcs8.length - 32);
}

function base64UrlToBytes(b64url: string): Uint8Array {
  // JWK uses base64url (no padding, `-`/`_` substitutions). Convert to
  // standard base64 then decode via atob for browser-safety.
  const padded = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const padLen = (4 - (padded.length % 4)) % 4;
  const final = padded + '='.repeat(padLen);
  if (typeof atob === 'function') {
    const bin = atob(final);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
    return out;
  }
  // Node fallback (older runtimes); modern Node ships atob globally.
  // Casting through `unknown` keeps the type-checker honest about Buffer
  // not being declared in the domain layer's lib.
  const buf = (
    globalThis as unknown as { Buffer?: { from(s: string, e: string): Uint8Array } }
  ).Buffer?.from(final, 'base64');
  if (!buf) {
    throw new Error('no base64 decoder available in this runtime');
  }
  return new Uint8Array(buf);
}
