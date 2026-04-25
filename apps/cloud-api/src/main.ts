/**
 * PipeFX Cloud-API — Main Server.
 *
 * Thin billing gateway that proxies LLM requests with credit enforcement.
 * Request flow: Device Auth → Rate Limit → Balance Check → Reserve → Proxy → Settle/Refund
 */

/* eslint-disable @typescript-eslint/no-unused-vars */

import * as http from 'http';
import { config } from './config.js';
import { verifyDeviceToken } from './lib/auth.js';
import { checkRateLimit, getRateLimitHeaders } from './lib/rate-limit.js';
import { getPricingTable } from './lib/pricing.js';
import {
  estimateMaxCredits,
  reserveCredits,
  settleCredits,
  releaseHold,
  getUserBalance,
} from './services/billing.js';
import { proxyStream } from './services/proxy.js';
import {
  printBanner,
  logRequest,
  logResponse,
  logAuth,
  logRateLimit,
  logBilling,
  logProxy,
  nextRequestId,
  maybeShowStats,
} from './lib/tui.js';
import type { DeviceAuthResult } from './lib/auth.js';
import type { ChatParams } from '@pipefx/llm-providers';

// ── Constants ────────────────────────────────────────────────

/** Maximum request body size (50 MB).
 * Needs to be generous — messages can contain base64-encoded images, audio,
 * or video frames from visual design programs. A single 4K frame as base64
 * is ~10-15 MB, and multi-image conversations can be larger.
 * The LLM providers enforce their own context limits downstream. */
const MAX_BODY_SIZE = 50 * 1_048_576;

/** Origins allowed to make cross-origin requests. */
const ALLOWED_ORIGINS = new Set([
  'tauri://localhost',         // Tauri desktop app
  'https://localhost',         // Tauri on some platforms
  'http://localhost:1420',     // Vite dev server (desktop)
  'https://app.pipefx.com',   // Production web UI (future)
]);

// ── Helpers ──────────────────────────────────────────────────

function jsonResponse(
  res: http.ServerResponse,
  status: number,
  body: Record<string, unknown>
): void {
  if (!res.headersSent) {
    res.writeHead(status, { 'Content-Type': 'application/json' });
  }
  res.end(JSON.stringify(body));
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalSize = 0;
    req.on('data', (chunk: Buffer) => {
      totalSize += chunk.length;
      if (totalSize > MAX_BODY_SIZE) {
        req.destroy();
        reject(new Error('Payload too large'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString()));
    req.on('error', reject);
  });
}

function sseWrite(res: http.ServerResponse, data: Record<string, unknown>): void {
  if (!res.destroyed) {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  }
}

/**
 * Derive the provider from the model name server-side.
 * Never trust the client's provider field.
 */
function resolveProviderFromModel(model: string): string {
  if (model.startsWith('gpt') || model.startsWith('o1') || model.startsWith('o3') || model.startsWith('o4')) return 'openai';
  if (model.startsWith('claude')) return 'anthropic';
  return 'gemini';
}

// ── Routes ───────────────────────────────────────────────────

async function handleHealth(
  _req: http.IncomingMessage,
  res: http.ServerResponse
): Promise<void> {
  jsonResponse(res, 200, { status: 'ok', service: 'pipefx-cloud-api' });
}

async function handlePricing(
  _req: http.IncomingMessage,
  res: http.ServerResponse
): Promise<void> {
  const pricing = await getPricingTable();
  jsonResponse(res, 200, { pricing });
}

async function handleBalance(
  _req: http.IncomingMessage,
  res: http.ServerResponse,
  auth: DeviceAuthResult
): Promise<void> {
  const balance = await getUserBalance(auth.userId);
  if (!balance) {
    jsonResponse(res, 404, { error: 'User profile not found' });
    return;
  }
  jsonResponse(res, 200, {
    balance: balance.balance,
    held: balance.held,
    available: balance.balance - balance.held,
  });
}

async function handleAiChat(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  auth: DeviceAuthResult,
  reqId: number
): Promise<number> {
  let rawBody: string;
  try {
    rawBody = await readBody(req);
  } catch (e) {
    return 413; // readBody rejects for oversized payloads
  }

  let body: {
    provider: string;
    model: string;
    systemPrompt?: string;
    messages: ChatParams['messages'];
    tools?: ChatParams['tools'];
    sessionId?: string;
    requestId?: string;
    roundIndex?: number;
  };

  try {
    body = JSON.parse(rawBody);
  } catch {
    jsonResponse(res, 400, { error: 'Invalid JSON body' });
    return 400;
  }

  if (!body.model || !body.messages) {
    jsonResponse(res, 400, { error: 'Missing required fields: model, messages' });
    return 400;
  }

  // ── Server-side provider resolution (CRIT-5: never trust client) ──
  const provider = resolveProviderFromModel(body.model);

  const sessionId = body.sessionId ?? `cloud-${Date.now()}`;
  const requestId = body.requestId ?? `req-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const roundIndex = body.roundIndex ?? 0;

  // ── 1. Check Balance ──
  const balance = await getUserBalance(auth.userId);
  if (!balance || balance.balance - balance.held <= 0) {
    logBilling('insufficient', { userId: auth.userId, model: body.model });
    jsonResponse(res, 402, { error: 'Insufficient credits', code: 'INSUFFICIENT_CREDITS' });
    return 402;
  }

  // ── 2. Fetch Pricing ──
  const pricingTable = await getPricingTable();

  // ── 3. Estimate & Reserve ──
  const estimatedTokens = body.messages.reduce(
    (sum, m) => sum + (m.content?.length ?? 0) / 4,
    0
  );
  const reserveAmount = estimateMaxCredits(
    Math.ceil(estimatedTokens),
    pricingTable,
    body.model,
    provider
  );

  logBilling('reserve', { userId: auth.userId, amount: reserveAmount, model: body.model });

  const reserved = await reserveCredits(auth.userId, reserveAmount);
  if (!reserved) {
    logBilling('insufficient', { userId: auth.userId, model: body.model });
    jsonResponse(res, 402, { error: 'Insufficient credits for this request', code: 'INSUFFICIENT_CREDITS' });
    return 402;
  }

  // ── 4. Stream Proxy ──
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    ...getRateLimitHeaders(auth.tokenId),
  });

  // Track client disconnect so we can abort the proxy early (HIGH-5 / MED-4)
  let clientDisconnected = false;
  res.on('close', () => { clientDisconnected = true; });

  const proxyStart = Date.now();
  logProxy('start', { provider, model: body.model });

  try {
    let finalUsage = null;

    for await (const event of proxyStream({
      provider,
      model: body.model,
      systemPrompt: body.systemPrompt ?? '',
      messages: body.messages,
      tools: body.tools,
    })) {
      // If client disconnected, stop streaming but still settle/refund
      if (clientDisconnected) break;

      sseWrite(res, event as unknown as Record<string, unknown>);

      if (event.type === 'done' && event.response?.usage) {
        finalUsage = event.response.usage;
      }
    }

    const proxyDuration = Date.now() - proxyStart;

    // ── 5. Settle ──
    if (finalUsage) {
      const result = await settleCredits({
        userId: auth.userId,
        reservedCredits: reserveAmount,
        usage: finalUsage,
        pricingTable,
        sessionId,
        requestId,
        roundIndex,
      });

      logProxy('done', {
        provider,
        model: body.model,
        inputTokens: finalUsage.inputTokens,
        outputTokens: finalUsage.outputTokens,
        durationMs: proxyDuration,
      });

      logBilling('settle', {
        userId: auth.userId,
        amount: result.creditsDebited,
        model: body.model,
        costUsd: result.costUsd,
      });

      if (!clientDisconnected) {
        sseWrite(res, {
          type: 'billing',
          creditsDebited: result.creditsDebited,
          costUsd: result.costUsd,
        });
      }
    } else {
      logProxy('done', { provider, model: body.model, durationMs: Date.now() - proxyStart });
      logBilling('refund', { userId: auth.userId, amount: reserveAmount });
      await releaseHold(auth.userId, reserveAmount);
    }

    if (!clientDisconnected) {
      sseWrite(res, { type: 'stream_end' });
      res.end();
    }
    return 200;
  } catch (error) {
    // ── 6. Compensate ──
    const message = error instanceof Error ? error.message : 'Internal server error';
    logProxy('error', { error: message });
    logBilling('refund', { userId: auth.userId, amount: reserveAmount });
    await releaseHold(auth.userId, reserveAmount);

    if (!clientDisconnected) {
      sseWrite(res, { type: 'error', error: message });
      res.end();
    }
    return 500;
  }
}

// ── Server ───────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  const start = Date.now();
  const reqId = nextRequestId();

  // ── CORS — restrict to known origins (CRIT-3) ──
  const origin = req.headers.origin ?? '';
  if (ALLOWED_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // ── Security headers (LOW-1) ──
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url ?? '/', `http://localhost:${config.port}`);
  const path = url.pathname;

  logRequest(req.method ?? 'GET', path, reqId);

  if (path === '/health' && req.method === 'GET') {
    await handleHealth(req, res);
    logResponse(reqId, 200, Date.now() - start);
    maybeShowStats();
    return;
  }

  if (path === '/pricing' && req.method === 'GET') {
    await handlePricing(req, res);
    logResponse(reqId, 200, Date.now() - start);
    maybeShowStats();
    return;
  }

  // ── Protected routes ──
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    logAuth('missing');
    jsonResponse(res, 401, { error: 'Missing or invalid Authorization header' });
    logResponse(reqId, 401, Date.now() - start);
    maybeShowStats();
    return;
  }

  const token = authHeader.slice(7);
  const auth = await verifyDeviceToken(token);
  if (!auth) {
    logAuth('rejected');
    jsonResponse(res, 401, { error: 'Invalid or expired device token' });
    logResponse(reqId, 401, Date.now() - start);
    maybeShowStats();
    return;
  }

  logAuth('verified', { userId: auth.userId, tokenId: auth.tokenId });

  if (!checkRateLimit(auth.tokenId)) {
    logRateLimit(auth.tokenId, false);
    const headers = getRateLimitHeaders(auth.tokenId);
    res.writeHead(429, { 'Content-Type': 'application/json', ...headers });
    res.end(JSON.stringify({ error: 'Rate limit exceeded', code: 'RATE_LIMITED' }));
    logResponse(reqId, 429, Date.now() - start);
    maybeShowStats();
    return;
  }

  logRateLimit(auth.tokenId, true);

  if (path === '/balance' && req.method === 'GET') {
    await handleBalance(req, res, auth);
    logResponse(reqId, 200, Date.now() - start);
    maybeShowStats();
    return;
  }

  if (path === '/ai/chat' && req.method === 'POST') {
    const chatStatus = await handleAiChat(req, res, auth, reqId);
    logResponse(reqId, chatStatus, Date.now() - start);
    maybeShowStats();
    return;
  }

  jsonResponse(res, 404, { error: 'Not found' });
  logResponse(reqId, 404, Date.now() - start);
  maybeShowStats();
});

// ── Server timeouts (HIGH-5) ──
server.headersTimeout = 10_000;    // 10s to receive all headers
server.requestTimeout = 300_000;   // 5min total request time (streaming can be long)
server.timeout = 360_000;          // 6min absolute timeout
server.keepAliveTimeout = 65_000;  // 65s keep-alive (slightly above common LB defaults)

// ── Graceful shutdown (INFRA-2) ──
function gracefulShutdown(signal: string) {
  console.log(`\n[cloud-api] ${signal} received — shutting down gracefully...`);
  server.close(() => {
    console.log('[cloud-api] All connections closed. Goodbye.');
    process.exit(0);
  });
  // Force exit after 10s if connections don't close
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

server.listen(config.port, () => {
  printBanner(config.port, {
    supabaseUrl: config.supabaseUrl,
    geminiApiKey: config.geminiApiKey,
    openaiApiKey: config.openaiApiKey,
    anthropicApiKey: config.anthropicApiKey,
  });
});
