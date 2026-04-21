/**
 * PipeFX Usage API Routes.
 *
 * Exposes usage data from the local SQLite store for the desktop UI.
 * GET /api/usage/session/:sessionId — usage events for a specific session
 * GET /api/usage/summary            — total credits + recent usage for the user
 * GET /api/usage/history            — paginated usage event history
 */

import type { Router } from '../router.js';
import { jsonResponse, jsonError } from '../router.js';
import type { UsageStore } from '@pipefx/usage';

export interface UsageRouteDeps {
  usageStore: UsageStore;
  /** Returns the authenticated user ID (from auth middleware). */
  getUserId: () => string;
}

export function registerUsageRoutes(router: Router, deps: UsageRouteDeps) {
  // GET /api/usage/summary — aggregate credit metrics
  router.get('/api/usage/summary', async (_req, res) => {
    try {
      const userId = deps.getUserId();

      // Last 24 hours
      const since24h = new Date(Date.now() - 86_400_000).toISOString();
      const credits24h = deps.usageStore.getTotalCredits(userId, since24h);

      // Last 7 days
      const since7d = new Date(Date.now() - 7 * 86_400_000).toISOString();
      const credits7d = deps.usageStore.getTotalCredits(userId, since7d);

      // All time
      const creditsAllTime = deps.usageStore.getTotalCredits(userId);

      // Recent events for the dashboard
      const recentEvents = deps.usageStore.getByUser(userId, 20);

      jsonResponse(res, {
        userId,
        credits24h,
        credits7d,
        creditsAllTime,
        recentEvents,
      });
    } catch (err) {
      jsonError(res, err);
    }
  });

  // GET /api/usage/history?limit=50
  router.get('/api/usage/history', async (req, res) => {
    try {
      const userId = deps.getUserId();
      const url = new URL(req.url!, 'http://localhost');
      const limit = parseInt(url.searchParams.get('limit') || '50', 10);
      const events = deps.usageStore.getByUser(userId, Math.min(limit, 500));
      jsonResponse(res, { userId, events, count: events.length });
    } catch (err) {
      jsonError(res, err);
    }
  });

  // GET /api/usage/session/:sessionId — prefix-match with manual parsing
  router.get('/api/usage/session/', async (req, res) => {
    try {
      const sessionId = req.url!.replace('/api/usage/session/', '').split('?')[0];
      if (!sessionId) {
        jsonResponse(res, { error: 'sessionId is required' }, 400);
        return;
      }
      const events = deps.usageStore.getBySession(sessionId);
      const totals = events.reduce(
        (acc, e) => {
          acc.inputTokens += e.inputTokens;
          acc.outputTokens += e.outputTokens;
          acc.thinkingTokens += e.thinkingTokens;
          acc.cachedTokens += e.cachedTokens;
          acc.costUsd += e.costUsd;
          acc.creditsDebited += e.creditsDebited;
          return acc;
        },
        { inputTokens: 0, outputTokens: 0, thinkingTokens: 0, cachedTokens: 0, costUsd: 0, creditsDebited: 0 }
      );
      jsonResponse(res, { sessionId, events, totals, rounds: events.length });
    } catch (err) {
      jsonError(res, err);
    }
  }, true); // prefix match
}
