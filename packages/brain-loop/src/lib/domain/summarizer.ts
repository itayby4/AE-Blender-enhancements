import Anthropic from '@anthropic-ai/sdk';
import type { Summarizer } from '@pipefx/agent-loop-kernel';
import type { ProviderMessage } from '@pipefx/llm-providers';

/**
 * Haiku-backed compaction summarizer.
 *
 * Used by the kernel's `compactHistoryAsync()` path to produce a real model
 * summary of older conversation turns when context grows past the compaction
 * threshold. Output is a `<summary>...</summary>` block matching the structure
 * the kernel's heuristic baseline emits, so downstream merge/format logic is
 * unchanged.
 *
 * Failures (network, rate limit, timeout) propagate as thrown errors -- the
 * kernel catches and falls back to the heuristic. Never returns rejection.
 */
const SUMMARIZER_MODEL = 'claude-haiku-4-5-20251001';

const SUMMARIZER_SYSTEM_PROMPT = `You produce structured summaries of chat conversations that are about to be removed from an agent's context window.

Output exactly one <summary>...</summary> block. Inside it, include these sections in order, omitting any that have no content:

Conversation summary:
- Scope: <one line: how many messages, mix of user/assistant/system, what kind of work was happening>
- Recent user requests:
  - <up to 3 most recent user requests, one line each, max 160 chars>
- Pending work:
  - <items the user or assistant flagged as next/todo/follow-up, max 3>
- Current work:
  - <one line: what the assistant was doing right before this summary>
- Key facts and decisions:
  - <load-bearing details a successor agent must know to continue: file paths, function names, decisions made, errors encountered, configuration values>
- Key timeline:
  - <one short line per non-trivial message, role: short content, max 160 chars; skip pure noise>

Output only the <summary> block. No commentary before or after. No markdown headers. Plain text.`;

function serializeMessagesForSummary(messages: ProviderMessage[]): string {
  return messages
    .map((m) => {
      const text = m.content.replace(/\s+/g, ' ').trim();
      return `${m.role}: ${text}`;
    })
    .join('\n');
}

export interface AnthropicSummarizerOptions {
  /** Override the summarizer model. Defaults to Haiku 4.5. */
  model?: string;
  /** Hard cap on output tokens. Defaults to 1500 -- enough for a thorough summary. */
  maxTokens?: number;
}

export function createAnthropicSummarizer(
  apiKey: string,
  options: AnthropicSummarizerOptions = {}
): Summarizer {
  const client = new Anthropic({ apiKey });
  const model = options.model ?? SUMMARIZER_MODEL;
  const maxTokens = options.maxTokens ?? 1500;

  return {
    async summarize(messages, signal) {
      const serialized = serializeMessagesForSummary(messages);
      const response = await client.messages.create(
        {
          model,
          max_tokens: maxTokens,
          system: SUMMARIZER_SYSTEM_PROMPT,
          messages: [
            {
              role: 'user',
              content: `Messages to summarize:\n\n${serialized}`,
            },
          ],
        },
        signal ? { signal } : undefined
      );

      const textBlock = response.content.find((c) => c.type === 'text');
      if (!textBlock || textBlock.type !== 'text') {
        return '';
      }
      return textBlock.text.trim();
    },
  };
}
