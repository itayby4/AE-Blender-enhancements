// ── apps/desktop — useLiveTools ──────────────────────────────────────────
// Tiny adapter that polls the backend's `/tools` endpoint (mounted by
// `@pipefx/connectors/backend`) and exposes the descriptor list to the
// authoring page's CapabilityPicker.
//
// We poll instead of subscribing for two reasons:
//   1. The desktop has no SSE client wired into the connectors surface
//      yet — the bus event lives server-side and there's no transport
//      to relay it to the UI.
//   2. Tool topology changes rarely (only on connector connect/disconnect),
//      so a 4-second poll is cheap and stays trivially correct.
//
// When the SSE/WebSocket bridge lands, swap this implementation for a
// subscription — the consumer-facing shape (`{ tools, loading, error }`)
// stays the same.

import { useEffect, useState } from 'react';
import type { ToolDescriptor } from '@pipefx/connectors';

const DEFAULT_API_BASE = 'http://localhost:3001';
const DEFAULT_INTERVAL_MS = 4000;

export interface UseLiveToolsResult {
  tools: ToolDescriptor[];
  loading: boolean;
  error: string | null;
}

export interface UseLiveToolsOptions {
  apiBase?: string;
  /** Polling interval in ms. Pass 0 to disable polling and only fetch
   *  once on mount (useful for tests). */
  intervalMs?: number;
}

export function useLiveTools(
  options: UseLiveToolsOptions = {}
): UseLiveToolsResult {
  const apiBase = options.apiBase ?? DEFAULT_API_BASE;
  const intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
  const [tools, setTools] = useState<ToolDescriptor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchOnce() {
      try {
        const res = await fetch(`${apiBase}/tools`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = (await res.json()) as { tools?: ToolDescriptor[] };
        if (cancelled) return;
        setTools(Array.isArray(body.tools) ? body.tools : []);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        // Don't clobber a known-good list on a transient error — keep the
        // last-known tools and just surface the error so the UI can decide
        // whether to show a "network blip" hint.
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void fetchOnce();
    if (intervalMs <= 0) return () => undefined;
    const handle = window.setInterval(fetchOnce, intervalMs);
    return () => {
      cancelled = true;
      window.clearInterval(handle);
    };
  }, [apiBase, intervalMs]);

  return { tools, loading, error };
}
