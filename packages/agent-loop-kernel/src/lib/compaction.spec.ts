import { describe, it, expect } from 'vitest';
import {
  shouldCompact,
  compactHistory,
  estimateTokens,
  DEFAULT_COMPACTION_CONFIG,
  type CompactionConfig,
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
