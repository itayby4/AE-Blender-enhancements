// ── @pipefx/skills/backend/routes/skills ─────────────────────────────────
// REST shell over the SkillStore + capability-matcher.
//
//   GET    /api/skills                 → list installed skills
//   GET    /api/skills/availability    → current capability-matcher snapshot
//   GET    /api/skills/:id             → single installed skill
//   POST   /api/skills/install         → install a `.pfxskill` v2 (zip) bundle
//   DELETE /api/skills/:id             → uninstall (user-root only)
//
// Install payload — v2 wire format:
//
//   { bundleBase64: string, source?: SkillSource }
//
// `source` defaults to `'bundle'`; the install route forbids `'builtin'`
// (built-ins are populated by the desktop bundle, not over HTTP) and
// rejects unknown values. Signature verification is the 12.13 seam — for
// now every install completes as `signed: false`.
//
// Both install and uninstall publish on the shared event bus
// (`skills.installed` / `skills.uninstalled`) so the capability-matcher
// recomputes the availability snapshot.

import { existsSync, readFileSync } from 'node:fs';
import * as path from 'node:path';

import type { EventBus } from '@pipefx/event-bus';

import type {
  CapabilityMatcher,
  InstalledSkill,
  SkillSource,
  SkillStore,
} from '../../contracts/api.js';
import type { SkillEventMap } from '../../contracts/events.js';
import { parseSkillMd } from '../../domain/skill-md-parser.js';
import {
  renderScaffoldTemplate,
  type SkillScaffoldMode,
} from '../../domain/scaffold-templates.js';
import {
  parseSkillBundleV2,
  verifySkillBundle,
} from '../../marketplace/bundle-v2.js';
import {
  jsonError,
  jsonResponse,
  readBody,
  type RouterLike,
} from '../internal/http.js';

export interface RegisterSkillRoutesDeps {
  readonly store: SkillStore;
  readonly matcher: Pick<CapabilityMatcher, 'snapshot'>;
  readonly bus: EventBus<SkillEventMap>;
  readonly now?: () => number;
  /** Hex-encoded Ed25519 public keys whose signatures count as trusted.
   *  Bundles signed by a key outside this set still install — they just
   *  land with `signed: false` so the library shield badge doesn't light
   *  up. Phase 12.13 ships with the project key only; a real registry
   *  lands with the future Store. */
  readonly trustedPublicKeys?: ReadonlyArray<string>;
}

const VALID_SOURCES: ReadonlyArray<SkillSource> = [
  'local',
  'bundle',
  'remote',
];

export function registerSkillRoutes(
  router: RouterLike,
  deps: RegisterSkillRoutesDeps
): void {
  const { store, matcher, bus } = deps;
  const now = deps.now ?? Date.now;
  const trustedKeys = new Set(
    (deps.trustedPublicKeys ?? []).map((k) => k.toLowerCase())
  );

  router.get('/api/skills', async (_req, res) => {
    try {
      jsonResponse(res, store.list());
    } catch (err) {
      jsonError(res, err);
    }
  });

  router.get('/api/skills/availability', async (_req, res) => {
    try {
      jsonResponse(res, matcher.snapshot());
    } catch (err) {
      jsonError(res, err);
    }
  });

  // ── Authoring (Phase 12.12) ───────────────────────────────────────────
  // Scaffold a new local skill from a template and persist it via
  // `store.install`. The dialog only lets the user pick `prompt` or
  // `script` — bundled-UI skills require workspace-source code.

  router.post('/api/skills/scaffold', async (req, res) => {
    try {
      const body = await readBody(req);
      const payload = body
        ? (JSON.parse(body) as ScaffoldPayload)
        : ({} as ScaffoldPayload);
      const validation = validateScaffoldPayload(payload);
      if (!validation.ok) {
        jsonResponse(res, { error: validation.error }, 400);
        return;
      }
      const { id: skillId, mode } = validation;
      if (store.get(skillId)) {
        jsonResponse(
          res,
          { error: `a skill with id "${skillId}" already exists` },
          409
        );
        return;
      }
      const scaffolded = renderScaffoldTemplate(mode, {
        id: skillId,
        name: payload.name,
        description: payload.description,
        category: payload.category,
        icon: payload.icon,
      });
      const resources = scaffolded.resources.map((resource) => ({
        path: resource.path,
        content: new TextEncoder().encode(resource.content),
      }));
      const record = store.install(scaffolded.loaded, {
        source: 'local',
        signed: false,
        resources,
      });
      void bus.publish('skills.installed', {
        skillId: record.loaded.frontmatter.id,
        version: record.loaded.frontmatter.version,
        source: record.source,
        signed: record.signed,
        installedAt: record.installedAt,
      });
      jsonResponse(res, record, 201);
    } catch (err) {
      jsonError(res, err);
    }
  });

  // GET  /api/skills/source/<id>  — read raw SKILL.md text
  // POST /api/skills/source       — { skillId, source } overwrite
  router.get(
    '/api/skills/source/',
    async (req, res) => {
      try {
        const id = extractTrailingId(req.url, '/api/skills/source/');
        if (!id) {
          jsonResponse(res, { error: 'skill id required' }, 400);
          return;
        }
        const result = readSkillSource(store, id);
        if (!result.ok) {
          jsonResponse(res, { error: result.error }, result.status);
          return;
        }
        jsonResponse(res, { skillId: id, source: result.source });
      } catch (err) {
        jsonError(res, err);
      }
    },
    true
  );

  // ── Install from raw SKILL.md text (Phase 12.14) ──────────────────────
  // Used by the chat-driven creator: the brain authors a complete SKILL.md
  // and hands it back as a string. Distinct from `/install` (zip bundle)
  // and `/scaffold` (template generation from id+mode). The route validates
  // the frontmatter via the same parser the loader uses, refuses to clobber
  // an existing skill (would silently overwrite the user's work), and lands
  // a `signed: false` install with `source: 'local'` so it shows up in the
  // library next to dialog-scaffolded skills.

  router.post('/api/skills/install-text', async (req, res) => {
    try {
      const body = await readBody(req);
      const payload = body
        ? (JSON.parse(body) as InstallTextPayload)
        : ({} as InstallTextPayload);
      if (!payload.skillMd || typeof payload.skillMd !== 'string') {
        jsonResponse(res, { error: 'skillMd is required' }, 400);
        return;
      }
      const parsed = parseSkillMd(payload.skillMd);
      if (!parsed.ok) {
        jsonResponse(res, { error: parsed.error.message }, 400);
        return;
      }
      const skillId = parsed.loaded.frontmatter.id;
      if (store.get(skillId)) {
        jsonResponse(
          res,
          {
            error: `a skill with id "${skillId}" already exists — use POST /api/skills/source to update it`,
          },
          409
        );
        return;
      }
      const record = store.install(parsed.loaded, {
        source: 'local',
        signed: false,
      });
      void bus.publish('skills.installed', {
        skillId: record.loaded.frontmatter.id,
        version: record.loaded.frontmatter.version,
        source: record.source,
        signed: record.signed,
        installedAt: record.installedAt,
      });
      jsonResponse(res, record, 201);
    } catch (err) {
      jsonError(res, err);
    }
  });

  router.post('/api/skills/source', async (req, res) => {
    try {
      const body = await readBody(req);
      const payload = body
        ? (JSON.parse(body) as SourcePayload)
        : ({} as SourcePayload);
      if (!payload.skillId || typeof payload.skillId !== 'string') {
        jsonResponse(res, { error: 'skillId is required' }, 400);
        return;
      }
      if (!payload.source || typeof payload.source !== 'string') {
        jsonResponse(res, { error: 'source is required' }, 400);
        return;
      }
      const existing = store.get(payload.skillId);
      if (!existing) {
        jsonResponse(res, { error: 'skill not found' }, 404);
        return;
      }
      if (existing.source === 'builtin') {
        jsonResponse(
          res,
          { error: 'built-in skills are immutable — clone before editing' },
          403
        );
        return;
      }
      const parsed = parseSkillMd(payload.source);
      if (!parsed.ok) {
        jsonResponse(res, { error: parsed.error.message }, 400);
        return;
      }
      if (parsed.loaded.frontmatter.id !== payload.skillId) {
        jsonResponse(
          res,
          {
            error: `frontmatter id "${parsed.loaded.frontmatter.id}" does not match path id "${payload.skillId}"`,
          },
          400
        );
        return;
      }
      const record = store.install(parsed.loaded, {
        source: existing.source,
        signed: false,
      });
      void bus.publish('skills.installed', {
        skillId: record.loaded.frontmatter.id,
        version: record.loaded.frontmatter.version,
        source: record.source,
        signed: record.signed,
        installedAt: record.installedAt,
      });
      jsonResponse(res, record);
    } catch (err) {
      jsonError(res, err);
    }
  });

  router.post('/api/skills/install', async (req, res) => {
    try {
      const body = await readBody(req);
      const payload = body ? (JSON.parse(body) as InstallPayload) : ({} as InstallPayload);
      if (!payload.bundleBase64 || typeof payload.bundleBase64 !== 'string') {
        jsonResponse(res, { error: 'bundleBase64 is required' }, 400);
        return;
      }

      let bundleBytes: Uint8Array;
      try {
        bundleBytes = decodeBase64(payload.bundleBase64);
      } catch (error) {
        jsonResponse(
          res,
          {
            error: `bundleBase64 is not valid base64: ${
              error instanceof Error ? error.message : String(error)
            }`,
          },
          400
        );
        return;
      }

      const parsed = parseSkillBundleV2(bundleBytes);
      if (!parsed.ok) {
        jsonResponse(res, { error: parsed.error }, 400);
        return;
      }

      const source = (payload.source ?? 'bundle') as SkillSource;
      if (source === 'builtin') {
        jsonResponse(
          res,
          { error: 'cannot install with source: "builtin"' },
          400
        );
        return;
      }
      if (!VALID_SOURCES.includes(source)) {
        jsonResponse(res, { error: `invalid source: ${source}` }, 400);
        return;
      }

      // Verify the embedded signing sidecar (Phase 12.13). A bundle is
      // marked `signed: true` only when the signature is well-formed AND
      // the public key sits in the trusted set. A *corrupt* signature
      // (verifier rejects the payload) is treated as a hard failure —
      // surfacing the wrong status would silently launder a tampered
      // bundle past the shield badge. An *untrusted* signature is
      // permissive: the bundle installs but lands with `signed: false`.
      let signed = false;
      let fingerprint: string | undefined;
      if (parsed.bundle.signing) {
        const verifyResult = await verifySkillBundle(parsed.bundle);
        if (!verifyResult.ok) {
          jsonResponse(
            res,
            { error: `bundle signature is invalid: ${verifyResult.error}` },
            400
          );
          return;
        }
        const publicKey = parsed.bundle.signing.publicKeyHex.toLowerCase();
        signed = trustedKeys.has(publicKey);
        fingerprint = publicKey;
      }

      const record = store.install(parsed.bundle.loaded, {
        source,
        signed,
        ...(fingerprint ? { fingerprint } : {}),
        resources: parsed.bundle.resources,
      });

      void bus.publish('skills.installed', {
        skillId: record.loaded.frontmatter.id,
        version: record.loaded.frontmatter.version,
        source: record.source,
        signed: record.signed,
        installedAt: record.installedAt,
      });

      jsonResponse(res, record, 201);
    } catch (err) {
      jsonError(res, err);
    }
  });

  // Prefix-match GET / DELETE — the explicit /availability route above
  // takes precedence so it doesn't get swallowed by these.
  router.get(
    '/api/skills/',
    async (req, res) => {
      try {
        const id = extractIdFromPath(req.url);
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
    },
    true
  );

  router.delete(
    '/api/skills/',
    async (req, res) => {
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
        void bus.publish('skills.uninstalled', {
          skillId: id,
          uninstalledAt: now(),
        });
        jsonResponse(res, { success: true });
      } catch (err) {
        jsonError(res, err);
      }
    },
    true
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────

interface InstallPayload {
  bundleBase64?: string;
  source?: string;
}

interface ScaffoldPayload {
  id?: string;
  name?: string;
  description?: string;
  category?: string;
  icon?: string;
  mode?: SkillScaffoldMode;
}

interface SourcePayload {
  skillId?: string;
  source?: string;
}

interface InstallTextPayload {
  skillMd?: string;
}

const SCAFFOLD_ID_PATTERN = /^[a-z0-9]([a-z0-9._-]*[a-z0-9])?$/i;

type ScaffoldValidation =
  | { ok: true; id: string; mode: SkillScaffoldMode }
  | { ok: false; error: string };

function validateScaffoldPayload(payload: ScaffoldPayload): ScaffoldValidation {
  if (!payload.id || typeof payload.id !== 'string') {
    return { ok: false, error: 'id is required' };
  }
  if (!SCAFFOLD_ID_PATTERN.test(payload.id)) {
    return {
      ok: false,
      error: `invalid skill id "${payload.id}" — must match /^[a-z0-9]([a-z0-9._-]*[a-z0-9])?$/i`,
    };
  }
  if (!payload.mode || (payload.mode !== 'prompt' && payload.mode !== 'script')) {
    return { ok: false, error: 'mode must be "prompt" or "script"' };
  }
  return { ok: true, id: payload.id, mode: payload.mode };
}

interface ReadSkillSourceOk {
  ok: true;
  source: string;
}
interface ReadSkillSourceErr {
  ok: false;
  status: number;
  error: string;
}

function readSkillSource(
  store: SkillStore,
  id: string
): ReadSkillSourceOk | ReadSkillSourceErr {
  const record: InstalledSkill | null = store.get(id);
  if (!record) {
    return { ok: false, status: 404, error: 'skill not found' };
  }
  const skillMdPath = path.join(record.installPath, 'SKILL.md');
  if (!existsSync(skillMdPath)) {
    return {
      ok: false,
      status: 500,
      error: `SKILL.md missing on disk for "${id}"`,
    };
  }
  return { ok: true, source: readFileSync(skillMdPath, 'utf-8') };
}

function extractTrailingId(
  url: string | undefined,
  prefix: string
): string | null {
  if (!url) return null;
  const tail = url.split('?')[0]?.replace(prefix, '') ?? '';
  if (!tail) return null;
  const first = tail.split('/')[0];
  return first ? decodeURIComponent(first) : null;
}

function extractIdFromPath(url: string | undefined): string | null {
  if (!url) return null;
  const tail = url.split('?')[0]?.replace('/api/skills/', '') ?? '';
  if (!tail) return null;
  const first = tail.split('/')[0];
  return first ? first : null;
}

function decodeBase64(b64: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    const buf = Buffer.from(b64, 'base64');
    return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  }
  // Browser fallback — kept so the routes file stays portable even though
  // it currently only runs on Node.
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}
