import { describe, it, expect, vi } from 'vitest';
import {
  shouldCompact,
  compactHistory,
  compactHistoryAsync,
  estimateTokens,
  DEFAULT_COMPACTION_CONFIG,
  type CompactionConfig,
  type Summarizer,
} from './compaction.js';
import type { ProviderMessage } from '@pipefx/llm-providers';

function msg(role: ProviderMessage['role'], content: string): ProviderMessage {
  return { role, content };
}

/** Roughly 2500-token chunk (10_000 chars / 4 + 1). */
const BIG_CHUNK = 'x'.repeat(10_000);

describe('estimateTokens', () => {
  it('returns 0 for an empty array', () => {
    expect(estimateTokens([])).toBe(0);
  });

  it('counts tokens roughly as chars/4 + 1 per message', () => {
    // 'hello' is 5 chars → ceil(5/4) + 1 = 2 + 1 = 3
    expect(estimateTokens([msg('user', 'hello')])).toBe(3);
  });

  it('sums across multiple messages', () => {
    // Two 5-char messages → 3 + 3 = 6
    expect(estimateTokens([msg('user', 'hello'), msg('assistant', 'world')])).toBe(
      6
    );
  });
});

describe('shouldCompact', () => {
  const cfg: CompactionConfig = DEFAULT_COMPACTION_CONFIG;

  it('returns false when message count is below the preserve threshold', () => {
    const messages = Array.from({ length: 3 }, (_, i) =>
      msg(i % 2 === 0 ? 'user' : 'assistant', BIG_CHUNK)
    );
    expect(shouldCompact(messages, cfg)).toBe(false);
  });

  it('returns false when tokens are below the budget even with many messages', () => {
    const messages = Array.from({ length: 10 }, (_, i) =>
      msg(i % 2 === 0 ? 'user' : 'assistant', 'short')
    );
    expect(shouldCompact(messages, cfg)).toBe(false);
  });

  it('returns true when both message count and token count exceed the thresholds', () => {
    const messages = Array.from({ length: 6 }, (_, i) =>
      msg(i % 2 === 0 ? 'user' : 'assistant', BIG_CHUNK)
    );
    expect(shouldCompact(messages, cfg)).toBe(true);
  });

  it('skips the existing compacted-summary prefix when measuring', () => {
    const prefix = msg(
      'system',
      'This session is being continued from a previous conversation that ran out of context. The summary below covers the earlier portion of the conversation.\n\nSome summary text here'
    );
    const messages = [
      prefix,
      ...Array.from({ length: 3 }, (_, i) =>
        msg(i % 2 === 0 ? 'user' : 'assistant', 'short')
      ),
    ];
    // After dropping prefix we only have 3 short messages → no compaction.
    expect(shouldCompact(messages, cfg)).toBe(false);
  });
});

describe('compactHistory', () => {
  it('is a no-op when shouldCompact is false', () => {
    const messages = [msg('user', 'hi'), msg('assistant', 'hello')];
    const result = compactHistory(messages);
    expect(result.removedCount).toBe(0);
    expect(result.compactedMessages).toEqual(messages);
  });

  it('removes older messages and preserves the last N verbatim', () => {
    const messages = Array.from({ length: 6 }, (_, i) =>
      msg(i % 2 === 0 ? 'user' : 'assistant', BIG_CHUNK)
    );

    const result = compactHistory(messages);
    expect(result.removedCount).toBeGreaterThan(0);
    // First message must now be the synthetic system summary.
    expect(result.compactedMessages[0].role).toBe('system');
    expect(result.compactedMessages[0].content).toContain(
      'This session is being continued'
    );
    // Last 4 of the original messages should be preserved verbatim after the summary.
    const preservedTail = result.compactedMessages.slice(-4);
    expect(preservedTail).toEqual(messages.slice(-4));
  });

  it('places the summary as a system role at index 0', () => {
    const messages = Array.from({ length: 10 }, (_, i) =>
      msg(i % 2 === 0 ? 'user' : 'assistant', BIG_CHUNK)
    );
    const result = compactHistory(messages);
    expect(result.compactedMessages[0].role).toBe('system');
  });

  it('includes assistant/user/tool counts in the summary', () => {
    const messages = Array.from({ length: 10 }, (_, i) =>
      msg(i % 2 === 0 ? 'user' : 'assistant', BIG_CHUNK)
    );
    const result = compactHistory(messages);
    expect(result.summary).toContain('user=');
    expect(result.summary).toContain('assistant=');
  });

  it('respects custom preserveRecentMessages config', () => {
    // Use all-user messages so the tool-pair guard doesn't walk back.
    const messages: ProviderMessage[] = Array.from({ length: 8 }, () =>
      msg('user', BIG_CHUNK)
    );
    const result = compactHistory(messages, {
      preserveRecentMessages: 2,
      maxEstimatedTokens: 4_000,
    });
    // 1 system summary + 2 preserved = 3 total
    expect(result.compactedMessages).toHaveLength(3);
    expect(result.compactedMessages.slice(1)).toEqual(messages.slice(-2));
  });

  it('walks back one message when the first preserved is a user message after assistant (tool-pair guard)', () => {
    // Pattern: [assistant_with_tool_use, user_with_tool_result, ..., final_assistant]
    // If the boundary lands on the user message, the guard should pull the
    // preceding assistant message in too so the tool pair is kept together.
    const messages: ProviderMessage[] = [
      msg('user', BIG_CHUNK + ' first'),
      msg('assistant', BIG_CHUNK + ' initial response'),
      msg('user', BIG_CHUNK + ' follow up'),
      msg('assistant', BIG_CHUNK + ' tool_use'), // boundary candidate preceding
      msg('user', BIG_CHUNK + ' tool_result'), // naive boundary start
      msg('assistant', BIG_CHUNK + ' final'),
    ];
    const result = compactHistory(messages, {
      preserveRecentMessages: 2,
      maxEstimatedTokens: 4_000,
    });

    // With the guard, first preserved should now be the assistant tool_use.
    // So preserved = [assistant(tool_use), user(tool_result), assistant(final)]
    // That's 3 preserved + 1 summary = 4 total
    expect(result.compactedMessages[0].role).toBe('system');
    expect(result.compactedMessages[1].role).toBe('assistant');
    expect(result.compactedMessages[1].content).toContain('tool_use');
  });
});

describe('compactHistoryAsync', () => {
  // Build a history that's well above the compaction threshold so the async
  // path always runs the slice + summarize logic.
  function bigHistory(): ProviderMessage[] {
    return [
      msg('user', `first user request ${BIG_CHUNK}`),
      msg('assistant', `first assistant reply ${BIG_CHUNK}`),
      msg('user', `second user request ${BIG_CHUNK}`),
      msg('assistant', `second assistant reply ${BIG_CHUNK}`),
      msg('user', 'third user request (recent)'),
      msg('assistant', 'third assistant reply (recent)'),
      msg('user', 'most recent user request'),
      msg('assistant', 'most recent assistant reply'),
    ];
  }

  it('falls back to heuristic when no summarizer is provided', async () => {
    const messages = bigHistory();
    const result = await compactHistoryAsync(messages);
    expect(result.removedCount).toBeGreaterThan(0);
    // Heuristic baseline emits a Conversation summary line.
    expect(result.summary).toContain('Conversation summary');
  });

  it('uses the LLM summary when the summarizer succeeds', async () => {
    const summarize = vi.fn(async () => '<summary>LLM-generated body</summary>');
    const summarizer: Summarizer = { summarize };
    const messages = bigHistory();

    const result = await compactHistoryAsync(messages, undefined, summarizer);

    expect(summarize).toHaveBeenCalledTimes(1);
    expect(result.removedCount).toBeGreaterThan(0);
    expect(result.summary).toContain('LLM-generated body');
    // First message must be the synthetic continuation system message.
    expect(result.compactedMessages[0].role).toBe('system');
  });

  it('falls back to heuristic when the summarizer throws', async () => {
    const summarize = vi.fn(async () => {
      throw new Error('rate limited');
    });
    const summarizer: Summarizer = { summarize };
    const messages = bigHistory();

    const result = await compactHistoryAsync(messages, undefined, summarizer);

    expect(summarize).toHaveBeenCalledTimes(1);
    expect(result.removedCount).toBeGreaterThan(0);
    expect(result.summary).toContain('Conversation summary');
    expect(result.summary).not.toContain('LLM-generated');
  });

  it('falls back to heuristic when the summarizer returns empty output', async () => {
    const summarize = vi.fn(async () => '   ');
    const summarizer: Summarizer = { summarize };
    const messages = bigHistory();

    const result = await compactHistoryAsync(messages, undefined, summarizer);

    expect(summarize).toHaveBeenCalledTimes(1);
    expect(result.summary).toContain('Conversation summary');
  });

  it('does not invoke the summarizer when below the threshold', async () => {
    const summarize = vi.fn(async () => '<summary>should not run</summary>');
    const summarizer: Summarizer = { summarize };
    const small: ProviderMessage[] = [msg('user', 'hi'), msg('assistant', 'hello')];

    const result = await compactHistoryAsync(small, undefined, summarizer);

    expect(summarize).not.toHaveBeenCalled();
    expect(result.removedCount).toBe(0);
    expect(result.compactedMessages).toEqual(small);
  });

  it('forwards the abort signal to the summarizer', async () => {
    const seen: AbortSignal[] = [];
    const summarize = vi.fn(async (_messages: ProviderMessage[], signal?: AbortSignal) => {
      if (signal) seen.push(signal);
      return '<summary>ok</summary>';
    });
    const summarizer: Summarizer = { summarize };
    const controller = new AbortController();
    const messages = bigHistory();

    await compactHistoryAsync(messages, undefined, summarizer, controller.signal);

    expect(seen).toHaveLength(1);
    expect(seen[0]).toBe(controller.signal);
  });
});
