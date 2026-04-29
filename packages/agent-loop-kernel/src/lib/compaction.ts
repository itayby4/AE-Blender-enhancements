/**
 * PipeFX Context Compaction ΓÇö Auto-summarize long conversations.
 *
 * TypeScript port of claw-code's compact.rs + summary_compression.rs.
 *
 * When conversation history exceeds a token budget, older messages are
 * summarized into a compact system message. Recent messages are preserved
 * verbatim. Tool-use/tool-result pair boundaries are never split.
 */

import type { ProviderMessage } from '@pipefx/llm-providers';

// ΓöÇΓöÇ Constants (from claw-code compact.rs) ΓöÇΓöÇ

const COMPACT_CONTINUATION_PREAMBLE =
  'This session is being continued from a previous conversation that ran out of context. The summary below covers the earlier portion of the conversation.\n\n';
const COMPACT_RECENT_MESSAGES_NOTE =
  'Recent messages are preserved verbatim.';
const COMPACT_DIRECT_RESUME_INSTRUCTION =
  'Continue the conversation from where it left off without asking the user any further questions. Resume directly ΓÇö do not acknowledge the summary, do not recap what was happening, and do not preface with continuation text.';

// ΓöÇΓöÇ Config ΓöÇΓöÇ

export interface CompactionConfig {
  /** Number of recent messages to preserve verbatim (default: 4). */
  preserveRecentMessages: number;
  /** Max estimated token count before compaction triggers (default: 8000). */
  maxEstimatedTokens: number;
}

export const DEFAULT_COMPACTION_CONFIG: CompactionConfig = {
  preserveRecentMessages: 4,
  maxEstimatedTokens: 8_000,
};

// ΓöÇΓöÇ Result ΓöÇΓöÇ

export interface CompactionResult {
  /** The generated summary text. */
  summary: string;
  /** The new compacted message history. */
  compactedMessages: ProviderMessage[];
  /** How many messages were removed (summarized). */
  removedCount: number;
}

// ΓöÇΓöÇ Token Estimation (from claw-code: chars / 4 + 1) ΓöÇΓöÇ

/**
 * Roughly estimate token count for a message.
 * Uses claw-code's heuristic: character count / 4.
 */
function estimateMessageTokens(msg: ProviderMessage): number {
  return Math.ceil(msg.content.length / 4) + 1;
}

/**
 * Estimate total tokens across all messages.
 */
export function estimateTokens(messages: ProviderMessage[]): number {
  return messages.reduce((sum, msg) => sum + estimateMessageTokens(msg), 0);
}

// ΓöÇΓöÇ Should Compact? ΓöÇΓöÇ

/**
 * Check if an existing compacted summary prefix exists.
 */
function compactedSummaryPrefixLen(messages: ProviderMessage[]): number {
  if (messages.length === 0) return 0;
  const first = messages[0];
  if (first.role === 'system' && first.content.startsWith(COMPACT_CONTINUATION_PREAMBLE)) {
    return 1;
  }
  return 0;
}

/**
 * Returns true when the session exceeds the configured compaction budget.
 * Mirrors claw-code's should_compact().
 */
export function shouldCompact(
  messages: ProviderMessage[],
  config: CompactionConfig = DEFAULT_COMPACTION_CONFIG
): boolean {
  const start = compactedSummaryPrefixLen(messages);
  const compactable = messages.slice(start);

  return (
    compactable.length > config.preserveRecentMessages &&
    estimateTokens(compactable) >= config.maxEstimatedTokens
  );
}

// ΓöÇΓöÇ Summarization (from claw-code compact.rs summarize_messages) ΓöÇΓöÇ

/**
 * Extract an existing compacted summary from a system message.
 */
function extractExistingCompactedSummary(
  msg: ProviderMessage
): string | null {
  if (msg.role !== 'system') return null;
  if (!msg.content.startsWith(COMPACT_CONTINUATION_PREAMBLE)) return null;

  let summary = msg.content.slice(COMPACT_CONTINUATION_PREAMBLE.length);

  const recentIdx = summary.indexOf(`\n\n${COMPACT_RECENT_MESSAGES_NOTE}`);
  if (recentIdx !== -1) summary = summary.slice(0, recentIdx);

  const resumeIdx = summary.indexOf(`\n${COMPACT_DIRECT_RESUME_INSTRUCTION}`);
  if (resumeIdx !== -1) summary = summary.slice(0, resumeIdx);

  return summary.trim();
}

/**
 * Truncate a string to maxChars, adding 'ΓÇª' if truncated.
 */
function truncate(content: string, maxChars: number): string {
  if (content.length <= maxChars) return content;
  return content.slice(0, maxChars) + 'ΓÇª';
}

/**
 * Collect the last N user messages as summary lines.
 */
function collectRecentUserRequests(
  messages: ProviderMessage[],
  limit: number
): string[] {
  return messages
    .filter((m) => m.role === 'user')
    .slice(-limit)
    .map((m) => truncate(m.content.replace(/\n/g, ' ').trim(), 160));
}

/**
 * Infer pending work items from message content.
 */
function inferPendingWork(messages: ProviderMessage[]): string[] {
  const keywords = ['todo', 'next', 'pending', 'follow up', 'remaining'];
  return messages
    .filter((m) => {
      const lower = m.content.toLowerCase();
      return keywords.some((k) => lower.includes(k));
    })
    .slice(-3)
    .map((m) => truncate(m.content.replace(/\n/g, ' ').trim(), 160));
}

/**
 * Infer the current work description from the last non-empty message.
 */
function inferCurrentWork(messages: ProviderMessage[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const text = messages[i].content.trim();
    if (text) return truncate(text, 200);
  }
  return null;
}

/**
 * Summarize a set of messages into a structured summary string.
 * Mirrors claw-code's summarize_messages().
 */
function summarizeMessages(messages: ProviderMessage[]): string {
  const userCount = messages.filter((m) => m.role === 'user').length;
  const assistantCount = messages.filter((m) => m.role === 'assistant').length;
  const systemCount = messages.filter((m) => m.role === 'system').length;

  const lines: string[] = [
    '<summary>',
    'Conversation summary:',
    `- Scope: ${messages.length} earlier messages compacted (user=${userCount}, assistant=${assistantCount}, system=${systemCount}).`,
  ];

  // Recent user requests
  const recentRequests = collectRecentUserRequests(messages, 3);
  if (recentRequests.length > 0) {
    lines.push('- Recent user requests:');
    recentRequests.forEach((r) => lines.push(`  - ${r}`));
  }

  // Pending work
  const pending = inferPendingWork(messages);
  if (pending.length > 0) {
    lines.push('- Pending work:');
    pending.forEach((item) => lines.push(`  - ${item}`));
  }

  // Current work
  const current = inferCurrentWork(messages);
  if (current) {
    lines.push(`- Current work: ${current}`);
  }

  // Key timeline
  lines.push('- Key timeline:');
  for (const msg of messages) {
    const content = truncate(msg.content.replace(/\n/g, ' ').trim(), 160);
    lines.push(`  - ${msg.role}: ${content}`);
  }

  lines.push('</summary>');
  return lines.join('\n');
}

// ΓöÇΓöÇ Summary Formatting ΓöÇΓöÇ

/**
 * Format a compaction summary for injection into the system prompt.
 * Strips <analysis> blocks and converts <summary> tags to readable format.
 */
function formatCompactSummary(summary: string): string {
  // Strip <analysis> blocks
  let formatted = summary.replace(/<analysis>[\s\S]*?<\/analysis>/g, '');

  // Convert <summary> tags to readable format
  const summaryMatch = formatted.match(/<summary>([\s\S]*?)<\/summary>/);
  if (summaryMatch) {
    formatted = formatted.replace(
      `<summary>${summaryMatch[1]}</summary>`,
      `Summary:\n${summaryMatch[1].trim()}`
    );
  }

  // Collapse multiple blank lines
  return formatted
    .split('\n')
    .reduce((acc: string[], line) => {
      const isBlank = line.trim() === '';
      const lastBlank = acc.length > 0 && acc[acc.length - 1].trim() === '';
      if (isBlank && lastBlank) return acc;
      acc.push(line);
      return acc;
    }, [])
    .join('\n')
    .trim();
}

/**
 * Merge old and new summaries when re-compacting.
 * Mirrors claw-code's merge_compact_summaries().
 */
function mergeCompactSummaries(
  existingSummary: string | null,
  newSummary: string
): string {
  if (!existingSummary) return newSummary;

  const lines: string[] = [
    '<summary>',
    'Conversation summary:',
    '- Previously compacted context:',
    ...existingSummary
      .split('\n')
      .filter((l) => l.trim() && l.trim() !== 'Summary:' && l.trim() !== 'Conversation summary:')
      .map((l) => `  ${l}`),
    '- Newly compacted context:',
    ...formatCompactSummary(newSummary)
      .split('\n')
      .filter((l) => l.trim() && l.trim() !== 'Summary:' && l.trim() !== 'Conversation summary:')
      .map((l) => `  ${l}`),
    '</summary>',
  ];

  return lines.join('\n');
}

/**
 * Build the synthetic system message used after compaction.
 */
function getCompactContinuationMessage(
  summary: string,
  suppressFollowUp: boolean,
  recentMessagesPreserved: boolean
): string {
  let base = `${COMPACT_CONTINUATION_PREAMBLE}${formatCompactSummary(summary)}`;

  if (recentMessagesPreserved) {
    base += `\n\n${COMPACT_RECENT_MESSAGES_NOTE}`;
  }

  if (suppressFollowUp) {
    base += `\n${COMPACT_DIRECT_RESUME_INSTRUCTION}`;
  }

  return base;
}

// -- Pluggable summarizer (async) --

/**
 * Optional LLM-backed summarizer. When provided to the kernel, replaces the
 * heuristic `summarizeMessages()` with a real model summary that produces a
 * far more useful continuation.
 *
 * Implementations MUST raise on failure (network error, rate limit, timeout).
 * The kernel falls back to the heuristic on any throw, so a flaky summarizer
 * degrades gracefully instead of breaking compaction.
 *
 * Output contract: a `<summary>...</summary>` block matching the structure
 * `summarizeMessages()` emits, so downstream formatting / merge logic is
 * unchanged. Plain prose is also accepted -- it'll be wrapped by the caller.
 */
export interface Summarizer {
  summarize(
    messages: ProviderMessage[],
    signal?: AbortSignal
  ): Promise<string>;
}

// -- Slice computation (shared by sync + async paths) --

interface CompactionSlice {
  existingSummary: string | null;
  removed: ProviderMessage[];
  preserved: ProviderMessage[];
}

/**
 * Decide which messages to summarize and which to preserve verbatim. Returns
 * null when the history is below the compaction threshold or the boundary
 * walk leaves nothing to remove.
 */
function computeCompactionSlice(
  messages: ProviderMessage[],
  config: CompactionConfig
): CompactionSlice | null {
  if (!shouldCompact(messages, config)) return null;

  const existingSummary =
    messages.length > 0 ? extractExistingCompactedSummary(messages[0]) : null;
  const compactedPrefixLen = existingSummary ? 1 : 0;

  let keepFrom = Math.max(
    compactedPrefixLen,
    messages.length - config.preserveRecentMessages
  );

  // Guard: don't split tool-use / tool-result pairs at the boundary.
  // If the first preserved message looks like it's part of a tool exchange
  // (assistant message mentioning tools followed by user message with results),
  // walk back to include the full pair.
  while (keepFrom > compactedPrefixLen) {
    const firstPreserved = messages[keepFrom];
    if (firstPreserved.role !== 'user') break;

    const preceding = messages[keepFrom - 1];
    if (preceding?.role === 'assistant') {
      keepFrom--;
      break;
    }
    break;
  }

  const removed = messages.slice(compactedPrefixLen, keepFrom);
  if (removed.length === 0) return null;

  const preserved = messages.slice(keepFrom);
  return { existingSummary, removed, preserved };
}

/**
 * Assemble the final CompactionResult from a slice + a raw summary blob
 * (heuristic or LLM-produced -- the rest of the pipeline doesn't care).
 */
function buildCompactionResult(
  slice: CompactionSlice,
  rawSummary: string
): CompactionResult {
  const summary = mergeCompactSummaries(slice.existingSummary, rawSummary);
  const continuation = getCompactContinuationMessage(
    summary,
    true,
    slice.preserved.length > 0
  );
  const compactedMessages: ProviderMessage[] = [
    { role: 'system', content: continuation },
    ...slice.preserved,
  ];
  return {
    summary: formatCompactSummary(summary),
    compactedMessages,
    removedCount: slice.removed.length,
  };
}

// -- Main Compaction Function --

/**
 * Compact a message history by summarizing older messages and preserving
 * the recent tail. Returns the new history with a synthetic summary message.
 *
 * This is the TypeScript equivalent of claw-code's `compact_session()`.
 *
 * Key behaviors:
 * - Preserves last N messages verbatim
 * - Never splits tool-use/tool-result pairs at the boundary
 * - Merges with existing compacted summaries when re-compacting
 * - Creates a synthetic system message with the summary
 */
export function compactHistory(
  messages: ProviderMessage[],
  config: CompactionConfig = DEFAULT_COMPACTION_CONFIG
): CompactionResult {
  const slice = computeCompactionSlice(messages, config);
  if (!slice) {
    return { summary: '', compactedMessages: messages, removedCount: 0 };
  }
  return buildCompactionResult(slice, summarizeMessages(slice.removed));
}

/**
 * Async variant of `compactHistory` that uses an injected `Summarizer` (e.g.,
 * Haiku) to produce the summary block. Falls back to the heuristic
 * `summarizeMessages()` on any summarizer failure or empty output, so a
 * misbehaving model never blocks compaction.
 *
 * When `summarizer` is null/undefined, behaves exactly like `compactHistory`.
 */
export async function compactHistoryAsync(
  messages: ProviderMessage[],
  config: CompactionConfig = DEFAULT_COMPACTION_CONFIG,
  summarizer?: Summarizer | null,
  signal?: AbortSignal
): Promise<CompactionResult> {
  const slice = computeCompactionSlice(messages, config);
  if (!slice) {
    return { summary: '', compactedMessages: messages, removedCount: 0 };
  }

  let rawSummary = summarizeMessages(slice.removed);

  if (summarizer) {
    try {
      const llmSummary = await summarizer.summarize(slice.removed, signal);
      if (llmSummary && llmSummary.trim().length > 0) {
        rawSummary = llmSummary;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(
        `[Compaction] LLM summarizer failed, falling back to heuristic: ${message}`
      );
    }
  }

  return buildCompactionResult(slice, rawSummary);
}
