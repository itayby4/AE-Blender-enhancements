import type { IncomingMessage, ServerResponse } from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CapabilityMatcher, SkillStore } from '../../contracts/api.js';
import type {
  InstalledSkill,
  SkillManifest,
  SkillRunRecord,
  SkillRunRequest,
} from '../../contracts/types.js';
import {
  SkillNotFoundError,
  SkillRunQuotaError,
  SkillUnavailableError,
  type SkillRunner,
} from '../../domain/runner.js';
import {
  canonicalPayloadBytes,
  generateSkillKeyPair,
  signSkill,
} from '../../domain/signing.js';
import type { RouteHandler, RouterLike } from '../internal/http.js';
import { createSkillRunStore } from '../services/skill-run-store.js';
import { registerRunRoutes } from './runs.js';
import { registerSkillRoutes } from './skills.js';

// ── Test router ──────────────────────────────────────────────────────────
// Captures registrations and lets us dispatch synthetic requests against
// them. We model prefix-vs-exact matching the same way the real Router
// does: the longest prefix that matches wins, exact matches beat prefixes.

interface Registered {
  path: string;
  prefix: boolean;
  handler: RouteHandler;
}

class TestRouter implements RouterLike {
  routes: Record<'get' | 'post' | 'delete', Registered[]> = {
    get: [],
    post: [],
    delete: [],
  };
  get(path: string, handler: RouteHandler, prefix = false) {
    this.routes.get.push({ path, prefix, handler });
    return undefined;
  }
  post(path: string, handler: RouteHandler, prefix = false) {
    this.routes.post.push({ path, prefix, handler });
    return undefined;
  }
  delete(path: string, handler: RouteHandler, prefix = false) {
    this.routes.delete.push({ path, prefix, handler });
    return undefined;
  }
  async dispatch(method: 'get' | 'post' | 'delete', url: string, body?: string) {
    const candidates = this.routes[method];
    const pathOnly = url.split('?')[0];
    const exact = candidates.find((r) => !r.prefix && r.path === pathOnly);
    const prefix = candidates
      .filter((r) => r.prefix && pathOnly.startsWith(r.path))
      .sort((a, b) => b.path.length - a.path.length)[0];
    const handler = (exact ?? prefix)?.handler;
    if (!handler) throw new Error(`no route for ${method} ${url}`);

    const req = makeRequest(url, body);
    const res = makeResponse();
    await handler(req, res);
    return res;
  }
}

interface MockRes {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
  json: () => unknown;
}

function makeRequest(url: string, body?: string): IncomingMessage {
  const listeners: Record<string, Array<(arg?: unknown) => void>> = {};
  const req = {
    url,
    on(event: string, cb: (arg?: unknown) => void) {
      (listeners[event] ??= []).push(cb);
      return req;
    },
  } as unknown as IncomingMessage;
  // Schedule body delivery on next tick so handlers awaiting readBody()
  // attach their listeners first.
  queueMicrotask(() => {
    if (body !== undefined) {
      listeners['data']?.forEach((cb) => cb(Buffer.from(body)));
    }
    listeners['end']?.forEach((cb) => cb());
  });
  return req;
}

function makeResponse(): ServerResponse & MockRes {
  const res: Partial<MockRes> & {
    writeHead?: (status: number, headers: Record<string, string>) => unknown;
    end?: (body?: string) => unknown;
  } = {
    statusCode: 200,
    headers: {},
    body: '',
  };
  res.writeHead = (status, headers) => {
    res.statusCode = status;
    res.headers = { ...res.headers, ...headers };
    return res;
  };
  res.end = (body = '') => {
    res.body = (res.body ?? '') + body;
    return res;
  };
  res.json = () => JSON.parse(res.body ?? '');
  return res as ServerResponse & MockRes;
}

// ── Fixtures ─────────────────────────────────────────────────────────────

function makeManifest(overrides: Partial<SkillManifest> = {}): SkillManifest {
  return {
    schemaVersion: 1,
    id: 'test.skill',
    version: '1.0.0',
    name: 'Test',
    description: 'Test skill',
    inputs: [],
    prompt: 'do the thing',
    requires: { capabilities: [] },
    ...overrides,
  };
}

function makeStore(records: InstalledSkill[] = []): SkillStore {
  const map = new Map(records.map((r) => [r.manifest.id, r]));
  return {
    list: () => [...map.values()],
    get: (id) => map.get(id) ?? null,
    install: vi.fn((manifest, opts) => {
      const record: InstalledSkill = {
        manifest,
        source: opts.source,
        signed: opts.signed,
        fingerprint: opts.fingerprint,
        installPath: opts.installPath,
        installedAt: 100,
      };
      map.set(manifest.id, record);
      return record;
    }),
    uninstall: vi.fn((id) => map.delete(id)),
  };
}

function makeMatcher(snapshot: ReturnType<CapabilityMatcher['snapshot']> = []): CapabilityMatcher {
  return {
    snapshot: () => snapshot,
    subscribe: () => () => undefined,
  };
}

// ── Skills route tests ───────────────────────────────────────────────────

describe('registerSkillRoutes', () => {
  let router: TestRouter;
  beforeEach(() => {
    router = new TestRouter();
  });

  it('GET /api/skills returns the installed list', async () => {
    const installed: InstalledSkill = {
      manifest: makeManifest(),
      source: 'local',
      signed: false,
      installedAt: 1,
    };
    registerSkillRoutes(router, {
      store: makeStore([installed]),
      matcher: makeMatcher(),
    });

    const res = await router.dispatch('get', '/api/skills');
    expect(res.statusCode).toBe(200);
    const body = res.json() as InstalledSkill[];
    expect(body).toHaveLength(1);
    expect(body[0].manifest.id).toBe('test.skill');
  });

  it('GET /api/skills/availability returns matcher snapshot', async () => {
    const snapshot = [{ skillId: 'test.skill', runnable: true, missing: [] }];
    registerSkillRoutes(router, {
      store: makeStore(),
      matcher: makeMatcher(snapshot),
    });

    const res = await router.dispatch('get', '/api/skills/availability');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(snapshot);
  });

  it('GET /api/skills/:id returns 404 for missing skill', async () => {
    registerSkillRoutes(router, {
      store: makeStore(),
      matcher: makeMatcher(),
    });

    const res = await router.dispatch('get', '/api/skills/missing');
    expect(res.statusCode).toBe(404);
  });

  it('GET /api/skills/:id returns the record when present', async () => {
    const installed: InstalledSkill = {
      manifest: makeManifest({ id: 'present' }),
      source: 'local',
      signed: false,
      installedAt: 1,
    };
    registerSkillRoutes(router, {
      store: makeStore([installed]),
      matcher: makeMatcher(),
    });

    const res = await router.dispatch('get', '/api/skills/present');
    expect(res.statusCode).toBe(200);
    expect((res.json() as InstalledSkill).manifest.id).toBe('present');
  });

  it('POST /api/skills/install rejects an invalid manifest', async () => {
    const store = makeStore();
    registerSkillRoutes(router, { store, matcher: makeMatcher() });

    const res = await router.dispatch(
      'post',
      '/api/skills/install',
      JSON.stringify({ manifest: { id: 'has spaces' } })
    );
    expect(res.statusCode).toBe(400);
    expect((res.json() as { error: string }).error).toMatch(/invalid manifest/);
    expect(store.install).not.toHaveBeenCalled();
  });

  it('POST /api/skills/install installs unsigned manifests', async () => {
    const store = makeStore();
    registerSkillRoutes(router, { store, matcher: makeMatcher() });

    const manifest = makeManifest({ id: 'unsigned' });
    const res = await router.dispatch(
      'post',
      '/api/skills/install',
      JSON.stringify({ manifest })
    );
    expect(res.statusCode).toBe(201);
    const body = res.json() as InstalledSkill;
    expect(body.signed).toBe(false);
    expect(body.fingerprint).toBeUndefined();
    expect(store.install).toHaveBeenCalledOnce();
  });

  it('POST /api/skills/install verifies a valid signature and stores the fingerprint', async () => {
    const store = makeStore();
    registerSkillRoutes(router, { store, matcher: makeMatcher() });

    const manifest = makeManifest({ id: 'signed.skill' });
    const keys = generateSkillKeyPair();
    const signature = signSkill({ manifest }, keys.privateKey);
    // Sanity: canonicalization is what verify uses.
    expect(canonicalPayloadBytes({ manifest }).byteLength).toBeGreaterThan(0);

    const res = await router.dispatch(
      'post',
      '/api/skills/install',
      JSON.stringify({
        manifest,
        signature: bytesToHex(signature),
        publicKey: bytesToHex(keys.publicKey),
      })
    );
    expect(res.statusCode).toBe(201);
    const body = res.json() as InstalledSkill;
    expect(body.signed).toBe(true);
    expect(body.fingerprint).toMatch(/^[0-9a-f]{64}$/);
  });

  it('POST /api/skills/install rejects a tampered payload', async () => {
    const store = makeStore();
    registerSkillRoutes(router, { store, matcher: makeMatcher() });

    const manifest = makeManifest({ id: 'tamper' });
    const keys = generateSkillKeyPair();
    const signature = signSkill({ manifest }, keys.privateKey);

    // Tamper after signing — bump the version, signature no longer matches.
    const tampered = { ...manifest, version: '2.0.0' };
    const res = await router.dispatch(
      'post',
      '/api/skills/install',
      JSON.stringify({
        manifest: tampered,
        signature: bytesToHex(signature),
        publicKey: bytesToHex(keys.publicKey),
      })
    );
    expect(res.statusCode).toBe(400);
    expect((res.json() as { error: string }).error).toMatch(/signature/);
    expect(store.install).not.toHaveBeenCalled();
  });

  it('POST /api/skills/install rejects half-supplied signature material', async () => {
    const store = makeStore();
    registerSkillRoutes(router, { store, matcher: makeMatcher() });

    const res = await router.dispatch(
      'post',
      '/api/skills/install',
      JSON.stringify({ manifest: makeManifest(), signature: 'aa' })
    );
    expect(res.statusCode).toBe(400);
    expect((res.json() as { error: string }).error).toMatch(/both/);
  });

  it('DELETE /api/skills/:id removes the skill', async () => {
    const installed: InstalledSkill = {
      manifest: makeManifest({ id: 'gone' }),
      source: 'local',
      signed: false,
      installedAt: 1,
    };
    const store = makeStore([installed]);
    registerSkillRoutes(router, { store, matcher: makeMatcher() });

    const res = await router.dispatch('delete', '/api/skills/gone');
    expect(res.statusCode).toBe(200);
    expect(store.uninstall).toHaveBeenCalledWith('gone');
  });
});

// ── Run route tests ──────────────────────────────────────────────────────

describe('registerRunRoutes', () => {
  let router: TestRouter;
  beforeEach(() => {
    router = new TestRouter();
  });

  function makeRunner(impl: (req: SkillRunRequest) => Promise<SkillRunRecord>): SkillRunner {
    return { run: vi.fn(impl) };
  }

  it('GET /api/skills/runs returns recent records', async () => {
    const runs = createSkillRunStore({ generateId: () => 'r1' });
    runs.start({ skillId: 'a', inputs: {} }, null);
    registerRunRoutes(router, {
      runs,
      runner: makeRunner(async () => ({} as SkillRunRecord)),
    });

    const res = await router.dispatch('get', '/api/skills/runs');
    expect(res.statusCode).toBe(200);
    expect((res.json() as SkillRunRecord[])[0].id).toBe('r1');
  });

  it('POST /api/skills/:id/run forwards the request and returns the record', async () => {
    const record: SkillRunRecord = {
      id: 'r1',
      skillId: 'alpha',
      sessionId: null,
      status: 'succeeded',
      startedAt: 1,
      finishedAt: 2,
    };
    const runs = createSkillRunStore();
    const runner = makeRunner(async (req) => {
      expect(req.skillId).toBe('alpha');
      expect(req.inputs).toEqual({ topic: 'editing' });
      return record;
    });
    registerRunRoutes(router, { runs, runner });

    const res = await router.dispatch(
      'post',
      '/api/skills/alpha/run',
      JSON.stringify({ inputs: { topic: 'editing' } })
    );
    expect(res.statusCode).toBe(200);
    expect((res.json() as SkillRunRecord).id).toBe('r1');
  });

  it('maps SkillNotFoundError → 404', async () => {
    const runner = makeRunner(async () => {
      throw new SkillNotFoundError('missing');
    });
    registerRunRoutes(router, { runs: createSkillRunStore(), runner });

    const res = await router.dispatch('post', '/api/skills/missing/run', '{}');
    expect(res.statusCode).toBe(404);
    expect((res.json() as { code: string }).code).toBe('SKILL_NOT_FOUND');
  });

  it('maps SkillUnavailableError → 409 with missing requirements', async () => {
    const missing = [{ connectorId: 'resolve', toolName: 'cut' }];
    const runner = makeRunner(async () => {
      throw new SkillUnavailableError('alpha', missing);
    });
    registerRunRoutes(router, { runs: createSkillRunStore(), runner });

    const res = await router.dispatch('post', '/api/skills/alpha/run', '{}');
    expect(res.statusCode).toBe(409);
    const body = res.json() as { code: string; missing: typeof missing };
    expect(body.code).toBe('SKILL_UNAVAILABLE');
    expect(body.missing).toEqual(missing);
  });

  it('maps SkillRunQuotaError → 402', async () => {
    const runner = makeRunner(async () => {
      throw new SkillRunQuotaError('alpha', undefined, 'no credits');
    });
    registerRunRoutes(router, { runs: createSkillRunStore(), runner });

    const res = await router.dispatch('post', '/api/skills/alpha/run', '{}');
    expect(res.statusCode).toBe(402);
    expect((res.json() as { code: string }).code).toBe('SKILL_RUN_QUOTA');
  });

  it('rejects malformed paths under /api/skills/', async () => {
    registerRunRoutes(router, {
      runs: createSkillRunStore(),
      runner: makeRunner(async () => ({} as SkillRunRecord)),
    });

    const res = await router.dispatch('post', '/api/skills/alpha', '{}');
    expect(res.statusCode).toBe(404);
  });
});

// ── Helpers ──────────────────────────────────────────────────────────────

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

afterEach(() => {
  vi.restoreAllMocks();
});
