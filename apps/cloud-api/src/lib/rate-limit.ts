/**
 * PipeFX Cloud-API — In-Memory Rate Limiter.
 *
 * Sliding window rate limiter keyed by device token ID.
 * Tracks request timestamps and rejects if the window is exceeded.
 */

import { config } from '../config.js';

/** Map of tokenId → array of request timestamps (ms). */
const windows = new Map<string, number[]>();

/** Cleanup interval — purge expired entries every 5 minutes. */
const cleanupInterval = setInterval(() => {
  const cutoff = Date.now() - 120_000; // 2 minutes ago
  for (const [key, timestamps] of windows) {
    const filtered = timestamps.filter((t) => t > cutoff);
    if (filtered.length === 0) {
      windows.delete(key);
    } else {
      windows.set(key, filtered);
    }
  }
}, 300_000);
cleanupInterval.unref();

/**
 * Check if a request should be allowed.
 * Returns true if allowed, false if rate-limited.
 */
export function checkRateLimit(tokenId: string): boolean {
  const now = Date.now();
  const windowMs = 60_000; // 1 minute
  const maxRequests = config.rateLimitRequestsPerMinute;

  let timestamps = windows.get(tokenId);
  if (!timestamps) {
    timestamps = [];
    windows.set(tokenId, timestamps);
  }

  // Remove expired entries
  const cutoff = now - windowMs;
  while (timestamps.length > 0 && timestamps[0] <= cutoff) {
    timestamps.shift();
  }

  if (timestamps.length >= maxRequests) {
    return false;
  }

  timestamps.push(now);
  return true;
}

/**
 * Get rate limit info for response headers.
 */
export function getRateLimitHeaders(tokenId: string): Record<string, string> {
  const timestamps = windows.get(tokenId) ?? [];
  const remaining = Math.max(0, config.rateLimitRequestsPerMinute - timestamps.length);

  return {
    'X-RateLimit-Limit': String(config.rateLimitRequestsPerMinute),
    'X-RateLimit-Remaining': String(remaining),
    'X-RateLimit-Reset': String(Math.ceil((Date.now() + 60_000) / 1000)),
  };
}
