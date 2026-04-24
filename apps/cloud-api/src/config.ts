/**
 * PipeFX Cloud-API — Configuration.
 *
 * Reads environment variables for the cloud billing gateway.
 * All LLM provider keys are server-side only — never exposed to clients.
 */

import * as dotenv from 'dotenv';

dotenv.config();

export const config = {
  port: Number(process.env.PORT) || 3002,

  // ── Supabase (service role — full access for billing operations) ──
  supabaseUrl: process.env.SUPABASE_URL || '',
  supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',

  // ── LLM Provider Keys (server-side custody) ──
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',

  // ── Rate Limiting ──
  rateLimitRequestsPerMinute: Number(process.env.RATE_LIMIT_RPM) || 60,
  maxTokensPerDevice: Number(process.env.MAX_TOKENS_PER_DEVICE) || 10,

  // ── Billing ──
  /** Maximum output tokens to estimate for pre-authorization hold */
  maxOutputTokensEstimate: Number(process.env.MAX_OUTPUT_ESTIMATE) || 8192,
};

// ── Startup Validation (MED-7: fail fast if critical vars are missing) ──
const missing: string[] = [];
if (!config.supabaseUrl) missing.push('SUPABASE_URL');
if (!config.supabaseServiceKey) missing.push('SUPABASE_SERVICE_ROLE_KEY');
if (!config.geminiApiKey && !config.openaiApiKey && !config.anthropicApiKey) {
  missing.push('At least one of GEMINI_API_KEY, OPENAI_API_KEY, or ANTHROPIC_API_KEY');
}
if (missing.length > 0) {
  console.error(
    `\n[cloud-api] FATAL: Missing required environment variables:\n` +
    missing.map((v) => `  ✗ ${v}`).join('\n') +
    `\n\nSet them in .env or your deployment environment.\n`
  );
  process.exit(1);
}
