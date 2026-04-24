/**
 * PipeFX Cloud-API — Terminal Dashboard.
 *
 * A beautiful, real-time monitoring TUI for the cloud billing gateway.
 * Tracks requests, billing, tokens, and provider usage with live stats.
 */

// ── ANSI Escape Codes ────────────────────────────────────────

const ESC = '\x1b';
const RESET = `${ESC}[0m`;
const BOLD = `${ESC}[1m`;
const DIM = `${ESC}[2m`;

const fg = {
  black: `${ESC}[30m`,
  red: `${ESC}[31m`,
  green: `${ESC}[32m`,
  yellow: `${ESC}[33m`,
  blue: `${ESC}[34m`,
  magenta: `${ESC}[35m`,
  cyan: `${ESC}[36m`,
  white: `${ESC}[37m`,
  gray: `${ESC}[90m`,
  brightRed: `${ESC}[91m`,
  brightGreen: `${ESC}[92m`,
  brightYellow: `${ESC}[93m`,
  brightBlue: `${ESC}[94m`,
  brightMagenta: `${ESC}[95m`,
  brightCyan: `${ESC}[96m`,
  brightWhite: `${ESC}[97m`,
};

const bg = {
  black: `${ESC}[40m`,
  red: `${ESC}[41m`,
  green: `${ESC}[42m`,
  yellow: `${ESC}[43m`,
  blue: `${ESC}[44m`,
  magenta: `${ESC}[45m`,
  cyan: `${ESC}[46m`,
  white: `${ESC}[47m`,
  gray: `${ESC}[100m`,
  brightBlue: `${ESC}[104m`,
};

// ── Box Drawing ──────────────────────────────────────────────

const B = {
  tl: '╭', tr: '╮', bl: '╰', br: '╯',
  h: '─', v: '│', hh: '═',
  lt: '├', rt: '┤', tt: '┬', bt: '┴', xx: '┼',
  dtl: '╔', dtr: '╗', dbl: '╚', dbr: '╝',
  dh: '═', dv: '║',
};

// ── Spark Characters ─────────────────────────────────────────

const SPARKS = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];

// ── Runtime Stats ────────────────────────────────────────────

const stats = {
  startTime: Date.now(),
  totalRequests: 0,
  activeRequests: 0,
  totalTokensIn: 0,
  totalTokensOut: 0,
  totalCreditsDebited: 0,
  totalCostUsd: 0,
  totalBillingEvents: 0,
  authSuccess: 0,
  authFailed: 0,
  rateLimited: 0,
  errors: 0,
  byProvider: { gemini: 0, openai: 0, anthropic: 0 } as Record<string, number>,
  recentLatencies: [] as number[],       // last 20 request durations
  requestsPerMinute: [] as number[],     // last 30 intervals (1 per 2s)
};

// Track RPM in a sliding window
let rpmCounter = 0;
const rpmInterval = setInterval(() => {
  stats.requestsPerMinute.push(rpmCounter);
  if (stats.requestsPerMinute.length > 30) stats.requestsPerMinute.shift();
  rpmCounter = 0;
}, 2000);
rpmInterval.unref();

// ── Helpers ──────────────────────────────────────────────────

function ts(): string {
  return new Date().toLocaleTimeString('en-GB', { hour12: false });
}

function uptime(): string {
  const s = Math.floor((Date.now() - stats.startTime) / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

function truncate(s: string, len: number): string {
  return s.length > len ? s.slice(0, len - 1) + '…' : s;
}

function formatNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

function formatUsd(n: number): string {
  if (n < 0.01) return `$${n.toFixed(6)}`;
  if (n < 1) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
}

function sparkline(data: number[], width = 20): string {
  if (data.length === 0) return fg.gray + '░'.repeat(width) + RESET;
  const max = Math.max(...data, 1);
  return data
    .slice(-width)
    .map((v) => {
      const idx = Math.min(Math.floor((v / max) * (SPARKS.length - 1)), SPARKS.length - 1);
      const color = v === 0 ? fg.gray : v > max * 0.7 ? fg.brightYellow : fg.brightCyan;
      return color + SPARKS[idx] + RESET;
    })
    .join('');
}

function badge(label: string, fgColor: string, bgColor: string): string {
  return `${bgColor}${fgColor}${BOLD} ${label} ${RESET}`;
}

function providerBadge(provider: string): string {
  switch (provider) {
    case 'gemini':    return badge('GEMINI', fg.black, bg.blue);
    case 'openai':    return badge('OPENAI', fg.black, bg.green);
    case 'anthropic': return badge('CLAUDE', fg.black, bg.yellow);
    default:          return badge(provider.toUpperCase(), fg.black, bg.gray);
  }
}

function statusBadge(status: number): string {
  if (status < 300) return badge(String(status), fg.black, bg.green);
  if (status < 400) return badge(String(status), fg.black, bg.cyan);
  if (status < 500) return badge(String(status), fg.black, bg.yellow);
  return badge(String(status), fg.white, bg.red);
}

function methodBadge(method: string): string {
  switch (method) {
    case 'GET':    return `${fg.brightCyan}${BOLD}GET${RESET}`;
    case 'POST':   return `${fg.brightYellow}${BOLD}POST${RESET}`;
    case 'DELETE': return `${fg.brightRed}${BOLD}DEL${RESET}`;
    default:       return `${fg.white}${method}${RESET}`;
  }
}

function durationColor(ms: number): string {
  if (ms < 200) return fg.brightGreen;
  if (ms < 1000) return fg.brightYellow;
  if (ms < 5000) return fg.yellow;
  return fg.brightRed;
}

function separator(label?: string): void {
  if (label) {
    const lineLen = 35 - Math.floor(label.length / 2);
    console.log(
      `  ${fg.gray}${B.h.repeat(Math.max(2, lineLen))}${RESET} ` +
      `${DIM}${fg.white}${label}${RESET} ` +
      `${fg.gray}${B.h.repeat(Math.max(2, lineLen))}${RESET}`
    );
  } else {
    console.log(`  ${fg.gray}${B.h.repeat(74)}${RESET}`);
  }
}

// ── Banner ───────────────────────────────────────────────────

export function printBanner(port: number, cfg: {
  supabaseUrl: string;
  geminiApiKey: string;
  openaiApiKey: string;
  anthropicApiKey: string;
}): void {
  const W = 62;
  const bar = (c: string) => fg.brightCyan + c.repeat(W) + RESET;
  const check = (v: string) => v ? `${fg.brightGreen}● ready${RESET}` : `${fg.brightRed}○ missing${RESET}`;
  const keyCheck = (v: string) => v ? `${fg.brightGreen}✓${RESET}` : `${fg.gray}✗${RESET}`;

  console.log('');
  console.log(`  ${bar(B.hh)}`);
  console.log('');
  console.log(`  ${fg.brightCyan}${BOLD}  ⚡  P I P E F X   C L O U D - A P I${RESET}`);
  console.log(`  ${fg.gray}     Credit-Based LLM Billing Gateway${RESET}`);
  console.log('');
  console.log(`  ${bar(B.h)}`);
  console.log('');
  console.log(`  ${fg.gray}  Server    ${fg.brightWhite}http://localhost:${port}${RESET}`);
  console.log(`  ${fg.gray}  Supabase  ${check(cfg.supabaseUrl)}${RESET}`);
  console.log(`  ${fg.gray}  Providers ${keyCheck(cfg.geminiApiKey)} Gemini  ${keyCheck(cfg.openaiApiKey)} OpenAI  ${keyCheck(cfg.anthropicApiKey)} Anthropic${RESET}`);
  console.log('');
  console.log(`  ${fg.gray}  Endpoints${RESET}`);
  console.log(`  ${fg.gray}    ${fg.brightCyan}GET ${fg.gray} /health  ${DIM}→ Health check${RESET}`);
  console.log(`  ${fg.gray}    ${fg.brightCyan}GET ${fg.gray} /pricing ${DIM}→ Model pricing table${RESET}`);
  console.log(`  ${fg.gray}    ${fg.brightCyan}GET ${fg.gray} /balance ${DIM}→ Credit balance ${fg.yellow}(auth)${RESET}`);
  console.log(`  ${fg.gray}    ${fg.brightYellow}POST${fg.gray} /ai/chat ${DIM}→ LLM proxy + billing ${fg.yellow}(auth)${RESET}`);
  console.log('');
  console.log(`  ${bar(B.hh)}`);
  console.log('');
}

// ── Stats Summary (printed periodically or on demand) ────────

export function printStats(): void {
  const W = 74;
  console.log('');
  console.log(`  ${fg.brightCyan}${B.tl}${B.h.repeat(W - 2)}${B.tr}${RESET}`);

  // Row 1: Uptime + Requests
  const uptimeStr = `${fg.gray}Uptime${RESET} ${fg.brightWhite}${BOLD}${uptime()}${RESET}`;
  const reqStr = `${fg.gray}Requests${RESET} ${fg.brightWhite}${BOLD}${stats.totalRequests}${RESET}`;
  const activeStr = `${fg.gray}Active${RESET} ${stats.activeRequests > 0 ? `${fg.brightYellow}${BOLD}${stats.activeRequests}${RESET}` : `${fg.gray}0${RESET}`}`;
  const errStr = `${fg.gray}Errors${RESET} ${stats.errors > 0 ? `${fg.brightRed}${BOLD}${stats.errors}${RESET}` : `${fg.gray}0${RESET}`}`;
  console.log(`  ${fg.brightCyan}${B.v}${RESET}  ${uptimeStr}  ${fg.gray}│${RESET}  ${reqStr}  ${fg.gray}│${RESET}  ${activeStr}  ${fg.gray}│${RESET}  ${errStr}  `);

  // Row 2: Separator
  console.log(`  ${fg.brightCyan}${B.lt}${B.h.repeat(W - 2)}${B.rt}${RESET}`);

  // Row 3: Tokens
  const tokIn = `${fg.gray}Tokens In${RESET}  ${fg.brightCyan}${BOLD}${formatNum(stats.totalTokensIn)}${RESET}`;
  const tokOut = `${fg.gray}Out${RESET}  ${fg.brightMagenta}${BOLD}${formatNum(stats.totalTokensOut)}${RESET}`;
  const credits = `${fg.gray}Credits${RESET}  ${fg.brightYellow}${BOLD}${formatNum(stats.totalCreditsDebited)}${RESET}`;
  const cost = `${fg.gray}Cost${RESET}  ${fg.brightGreen}${BOLD}${formatUsd(stats.totalCostUsd)}${RESET}`;
  console.log(`  ${fg.brightCyan}${B.v}${RESET}  ${tokIn}  ${fg.gray}│${RESET}  ${tokOut}  ${fg.gray}│${RESET}  ${credits}  ${fg.gray}│${RESET}  ${cost}  `);

  // Row 4: Provider breakdown
  console.log(`  ${fg.brightCyan}${B.lt}${B.h.repeat(W - 2)}${B.rt}${RESET}`);
  const prov = Object.entries(stats.byProvider)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => `${providerBadge(k)} ${fg.brightWhite}${v}${RESET}`)
    .join('  ');
  const authStr = `${fg.gray}Auth${RESET} ${fg.brightGreen}${stats.authSuccess}${RESET}${fg.gray}/${RESET}${stats.authFailed > 0 ? fg.brightRed : fg.gray}${stats.authFailed}${RESET}`;
  console.log(`  ${fg.brightCyan}${B.v}${RESET}  ${prov || `${fg.gray}No requests yet${RESET}`}  ${fg.gray}│${RESET}  ${authStr}  `);

  // Row 5: Sparkline
  console.log(`  ${fg.brightCyan}${B.lt}${B.h.repeat(W - 2)}${B.rt}${RESET}`);
  console.log(`  ${fg.brightCyan}${B.v}${RESET}  ${fg.gray}RPM${RESET}  ${sparkline(stats.requestsPerMinute, 30)}  ${fg.gray}${stats.rateLimited > 0 ? `${fg.brightRed}${stats.rateLimited} rate-limited${RESET}` : ''}${RESET}  `);

  console.log(`  ${fg.brightCyan}${B.bl}${B.h.repeat(W - 2)}${B.br}${RESET}`);
  console.log('');
}

// ── Request Counter ──────────────────────────────────────────

let _reqCounter = 0;
export function nextRequestId(): number { return ++_reqCounter; }

// ── Event Loggers ────────────────────────────────────────────

export function logRequest(method: string, path: string, reqId: number): void {
  stats.totalRequests++;
  stats.activeRequests++;
  rpmCounter++;

  console.log(
    `  ${fg.gray}${ts()}${RESET}  ${methodBadge(method)} ${fg.brightWhite}${path}${RESET}` +
    `  ${fg.gray}#${reqId}${RESET}`
  );
}

export function logResponse(reqId: number, status: number, durationMs: number): void {
  stats.activeRequests = Math.max(0, stats.activeRequests - 1);
  stats.recentLatencies.push(durationMs);
  if (stats.recentLatencies.length > 20) stats.recentLatencies.shift();
  if (status >= 500) stats.errors++;

  const dc = durationColor(durationMs);
  console.log(
    `  ${fg.gray}${ts()}${RESET}  ${statusBadge(status)} ` +
    `${fg.gray}#${reqId}${RESET}  ${dc}${durationMs}ms${RESET}`
  );
  console.log('');
}

export function logAuth(
  event: 'verified' | 'rejected' | 'missing',
  details?: { userId?: string; tokenId?: string }
): void {
  if (event === 'verified') {
    stats.authSuccess++;
    console.log(
      `  ${fg.gray}${ts()}${RESET}  ${badge('AUTH', fg.black, bg.magenta)}  ` +
      `${fg.brightGreen}●${RESET} ${fg.gray}user:${RESET}${fg.brightWhite}${truncate(details?.userId ?? '?', 12)}${RESET}` +
      `  ${fg.gray}device:${RESET}${fg.brightWhite}${truncate(details?.tokenId ?? '?', 8)}${RESET}`
    );
  } else {
    stats.authFailed++;
    const reason = event === 'rejected' ? 'Invalid token' : 'No auth header';
    console.log(
      `  ${fg.gray}${ts()}${RESET}  ${badge('AUTH', fg.white, bg.red)}  ` +
      `${fg.brightRed}○ ${reason}${RESET}`
    );
  }
}

export function logRateLimit(tokenId: string, allowed: boolean, remaining?: number): void {
  if (allowed) {
    console.log(
      `  ${fg.gray}${ts()}${RESET}  ${badge('RATE', fg.black, bg.cyan)}  ` +
      `${fg.brightGreen}●${RESET} ${fg.gray}${remaining ?? '?'} remaining${RESET}`
    );
  } else {
    stats.rateLimited++;
    console.log(
      `  ${fg.gray}${ts()}${RESET}  ${badge('RATE', fg.white, bg.red)}  ` +
      `${fg.brightRed}● LIMIT EXCEEDED${RESET} ${fg.gray}${truncate(tokenId, 8)}${RESET}`
    );
  }
}

export function logBilling(
  event: 'reserve' | 'settle' | 'refund' | 'insufficient',
  details: { userId?: string; amount?: number; model?: string; costUsd?: number }
): void {
  stats.totalBillingEvents++;

  const lines: Record<string, string> = {
    reserve:      `${fg.brightYellow}◉ RESERVE${RESET}`,
    settle:       `${fg.brightGreen}◉ SETTLED${RESET}`,
    refund:       `${fg.brightCyan}↩ REFUND${RESET}`,
    insufficient: `${fg.brightRed}⊘ INSUFFICIENT${RESET}`,
  };

  let info = '';
  if (details.amount != null) {
    const credStr = details.amount.toFixed(2);
    info += `  ${fg.gray}credits:${RESET}${fg.brightYellow}${credStr}${RESET}`;
  }
  if (details.model) {
    info += `  ${fg.gray}model:${RESET}${fg.brightWhite}${details.model}${RESET}`;
  }
  if (details.costUsd != null) {
    info += `  ${fg.gray}cost:${RESET}${fg.brightGreen}${formatUsd(details.costUsd)}${RESET}`;
  }

  if (event === 'settle' && details.amount) {
    stats.totalCreditsDebited += details.amount;
    stats.totalCostUsd += details.costUsd ?? 0;
  }

  console.log(
    `  ${fg.gray}${ts()}${RESET}  ${badge('BILL', fg.black, bg.yellow)}  ${lines[event]}${info}`
  );
}

export function logProxy(
  event: 'start' | 'streaming' | 'done' | 'error',
  details?: {
    provider?: string;
    model?: string;
    inputTokens?: number;
    outputTokens?: number;
    error?: string;
    durationMs?: number;
  }
): void {
  switch (event) {
    case 'start': {
      if (details?.provider) {
        stats.byProvider[details.provider] = (stats.byProvider[details.provider] || 0) + 1;
      }
      console.log(
        `  ${fg.gray}${ts()}${RESET}  ${providerBadge(details?.provider ?? 'unknown')}  ` +
        `${fg.brightBlue}→${RESET} ${fg.brightWhite}${details?.model ?? '?'}${RESET}  ` +
        `${DIM}${fg.gray}streaming...${RESET}`
      );
      break;
    }
    case 'done': {
      if (details?.inputTokens) stats.totalTokensIn += details.inputTokens;
      if (details?.outputTokens) stats.totalTokensOut += details.outputTokens;

      const dc = durationColor(details?.durationMs ?? 0);
      console.log(
        `  ${fg.gray}${ts()}${RESET}  ${badge(' ✓ ', fg.black, bg.green)}  ` +
        `${fg.brightCyan}in:${formatNum(details?.inputTokens ?? 0)}${RESET}  ` +
        `${fg.brightMagenta}out:${formatNum(details?.outputTokens ?? 0)}${RESET}  ` +
        `${dc}${details?.durationMs ?? '?'}ms${RESET}`
      );
      break;
    }
    case 'error': {
      stats.errors++;
      console.log(
        `  ${fg.gray}${ts()}${RESET}  ${badge('ERR', fg.white, bg.red)}  ` +
        `${fg.brightRed}${truncate(details?.error ?? 'Unknown error', 55)}${RESET}`
      );
      break;
    }
  }
}

// ── Periodic Stats Timer ─────────────────────────────────────

let _statsPrinted = 0;

/**
 * Print stats summary every N requests or every 2 minutes of inactivity.
 * Call this from logResponse.
 */
export function maybeShowStats(): void {
  const threshold = 10;
  if (stats.totalRequests > 0 && stats.totalRequests % threshold === 0 && stats.totalRequests !== _statsPrinted) {
    _statsPrinted = stats.totalRequests;
    printStats();
  }
}

export function logSection(label: string): void {
  separator(label);
}
