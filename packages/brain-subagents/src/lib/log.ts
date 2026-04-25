/**
 * Tiny structured logger for the brain-subagents package.
 *
 * Prefixes every line with `[Brain-Subagents]` so operators can grep the
 * backend stdout for the whole sub-agent lifecycle (AgentTool invocations,
 * worker spawn/resume/fork, stream chunks, HTTP routes).
 *
 * Level-gated by `PIPEFX_AGENTS_LOG`:
 *
 *   unset or "info" (default) → info + warn + error
 *   "debug"                    → all four levels
 *   "warn"                     → warn + error only
 *   "silent"                   → nothing
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_RANK: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function currentThreshold(): number {
  const raw = (process.env.PIPEFX_AGENTS_LOG || 'info').toLowerCase();
  if (raw === 'silent' || raw === 'off' || raw === 'none') return 999;
  if (raw === 'debug') return LEVEL_RANK.debug;
  if (raw === 'warn') return LEVEL_RANK.warn;
  if (raw === 'error') return LEVEL_RANK.error;
  return LEVEL_RANK.info;
}

const MAX_VALUE_LEN = 240;

function shorten(v: unknown): string {
  if (v === undefined) return '';
  if (typeof v === 'string') {
    return v.length <= MAX_VALUE_LEN ? v : `${v.slice(0, MAX_VALUE_LEN)}…`;
  }
  try {
    const json = JSON.stringify(v);
    return json.length <= MAX_VALUE_LEN
      ? json
      : `${json.slice(0, MAX_VALUE_LEN)}…`;
  } catch {
    return String(v);
  }
}

function formatContext(ctx?: Record<string, unknown>): string {
  if (!ctx) return '';
  const parts: string[] = [];
  for (const [k, v] of Object.entries(ctx)) {
    if (v === undefined) continue;
    parts.push(`${k}=${shorten(v)}`);
  }
  return parts.length ? ' ' + parts.join(' ') : '';
}

function emit(
  level: LogLevel,
  event: string,
  ctx?: Record<string, unknown>
): void {
  if (LEVEL_RANK[level] < currentThreshold()) return;
  const line = `[Brain-Subagents] ${level.toUpperCase()} ${event}${formatContext(ctx)}`;
  if (level === 'error') {
    console.error(line);
  } else if (level === 'warn') {
    console.warn(line);
  } else {
    console.log(line);
  }
}

export const brainSubagentsLog = {
  debug: (event: string, ctx?: Record<string, unknown>) => emit('debug', event, ctx),
  info: (event: string, ctx?: Record<string, unknown>) => emit('info', event, ctx),
  warn: (event: string, ctx?: Record<string, unknown>) => emit('warn', event, ctx),
  error: (event: string, ctx?: Record<string, unknown>) => emit('error', event, ctx),
};
