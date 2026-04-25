// ── @pipefx/skills/backend/routes/skills ─────────────────────────────────
// REST shell over the SkillStore + signature-verify pipeline.
//
//   GET    /api/skills                 → list installed skills
//   GET    /api/skills/availability    → current capability-matcher snapshot
//   GET    /api/skills/:id             → single installed skill
//   POST   /api/skills/install         → install a (possibly signed) bundle
//   DELETE /api/skills/:id             → uninstall
//
// Install accepts either:
//
//   { manifest, signature?, publicKey?, source? }
//
// where `signature` and `publicKey` are hex-encoded. When both are present
// the route verifies via Ed25519 before persisting; when both are absent
// the install proceeds as `signed: false` (local development / authoring
// flow). Mixed presence is rejected — half a signature is always an
// integration bug, not a partial-trust use case.

import type { CapabilityMatcher, SkillStore } from '../../contracts/api.js';
import type {
  InstalledSkill,
  SkillManifest,
} from '../../contracts/types.js';
import { parseManifest } from '../../domain/manifest-schema.js';
import { fingerprintPublicKey, verifySkill } from '../../domain/signing.js';
import {
  jsonError,
  jsonResponse,
  readBody,
  type RouterLike,
} from '../internal/http.js';

export interface SkillRouteDeps {
  store: SkillStore;
  matcher: CapabilityMatcher;
}

export function registerSkillRoutes(router: RouterLike, deps: SkillRouteDeps) {
  const { store, matcher } = deps;

  // GET /api/skills — list installed
  router.get('/api/skills', async (_req, res) => {
    try {
      jsonResponse(res, store.list());
    } catch (err) {
      jsonError(res, err);
    }
  });

  // GET /api/skills/availability — capability-matcher snapshot
  router.get('/api/skills/availability', async (_req, res) => {
    try {
      jsonResponse(res, matcher.snapshot());
    } catch (err) {
      jsonError(res, err);
    }
  });

  // POST /api/skills/install
  router.post('/api/skills/install', async (req, res) => {
    try {
      const body = await readBody(req);
      const payload = JSON.parse(body) as InstallRequest;

      const parsed = parseManifest(payload.manifest);
      if (!parsed.ok) {
        jsonResponse(
          res,
          { error: 'invalid manifest', issues: parsed.error.issues },
          400
        );
        return;
      }
      const manifest: SkillManifest = parsed.manifest;

      const signatureHex = payload.signature?.trim();
      const publicKeyHex = payload.publicKey?.trim();
      if (Boolean(signatureHex) !== Boolean(publicKeyHex)) {
        jsonResponse(
          res,
          {
            error:
              'signature and publicKey must both be provided, or both omitted',
          },
          400
        );
        return;
      }

      let signed = false;
      let fingerprint: string | undefined;
      if (signatureHex && publicKeyHex) {
        let signatureBytes: Uint8Array;
        let publicKeyBytes: Uint8Array;
        try {
          signatureBytes = hexToBytes(signatureHex);
          publicKeyBytes = hexToBytes(publicKeyHex);
        } catch (error) {
          jsonResponse(
            res,
            {
              error: `signature/publicKey must be hex-encoded: ${
                error instanceof Error ? error.message : String(error)
              }`,
            },
            400
          );
          return;
        }
        const ok = verifySkill({ manifest }, signatureBytes, publicKeyBytes);
        if (!ok) {
          jsonResponse(res, { error: 'signature verification failed' }, 400);
          return;
        }
        signed = true;
        fingerprint = fingerprintPublicKey(publicKeyBytes);
      }

      const record = store.install(manifest, {
        source: payload.source ?? 'local',
        signed,
        fingerprint,
      });
      jsonResponse(res, record, 201);
    } catch (err) {
      jsonError(res, err);
    }
  });

  // GET /api/skills/:id and DELETE /api/skills/:id share the prefix.
  // GET first; the prefix flag widens it to anything under /api/skills/.

  router.get('/api/skills/', async (req, res) => {
    try {
      const id = extractIdFromPath(req.url);
      // /availability is served by the explicit non-prefix route above; the
      // matcher already returned via that handler. If we get here with the
      // literal "availability" segment it means the explicit route didn't
      // match (e.g. trailing slash) — surface a clear error rather than
      // treating it as an actual skill id.
      if (!id || id === 'availability' || id === 'install') {
        jsonResponse(res, { error: 'skill id required' }, 400);
        return;
      }
      const record = store.get(id);
      if (!record) {
        jsonResponse(res, { error: 'skill not found' }, 404);
        return;
      }
      jsonResponse(res, record);
    } catch (err) {
      jsonError(res, err);
    }
  }, true);

  router.delete('/api/skills/', async (req, res) => {
    try {
      const id = extractIdFromPath(req.url);
      if (!id) {
        jsonResponse(res, { error: 'skill id required' }, 400);
        return;
      }
      const removed = store.uninstall(id);
      if (!removed) {
        jsonResponse(res, { error: 'skill not found' }, 404);
        return;
      }
      jsonResponse(res, { success: true });
    } catch (err) {
      jsonError(res, err);
    }
  }, true);
}

// ── Wire types ───────────────────────────────────────────────────────────

interface InstallRequest {
  manifest: unknown;
  /** Hex-encoded Ed25519 signature over the canonical manifest payload. */
  signature?: string;
  /** Hex-encoded Ed25519 public key — 32 bytes = 64 hex chars. */
  publicKey?: string;
  source?: InstalledSkill['source'];
}

// ── Helpers ──────────────────────────────────────────────────────────────

function extractIdFromPath(url: string | undefined): string | null {
  if (!url) return null;
  const tail = url.split('?')[0].replace('/api/skills/', '');
  if (!tail) return null;
  // Ignore deeper paths — we don't have nested skill routes (yet).
  return tail.split('/')[0] || null;
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/\s+/g, '');
  if (clean.length % 2 !== 0) {
    throw new Error('hex string must have even length');
  }
  if (!/^[0-9a-f]*$/i.test(clean)) {
    throw new Error('hex string contains non-hex characters');
  }
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = parseInt(clean.substr(i * 2, 2), 16);
  }
  return out;
}
