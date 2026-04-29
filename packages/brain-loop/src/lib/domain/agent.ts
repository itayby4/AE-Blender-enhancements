import type { Provider } from '@pipefx/llm-providers';
import {
  GeminiProvider,
  OpenAIProvider,
  AnthropicProvider,
  CloudProvider,
} from '@pipefx/llm-providers';
import { runAgentLoop } from '@pipefx/agent-loop-kernel';
import type { Agent, ChatOptions, Summarizer } from '@pipefx/agent-loop-kernel';
import type { AgentConfig } from './types.js';
import { createAnthropicSummarizer } from './summarizer.js';

/**
 * Resolve the correct Provider instance and model name for the given request.
 */
function resolveProvider(
  config: AgentConfig,
  providerOverride?: string
): { provider: Provider; model: string } {
  // ── Cloud Mode: all providers route through the cloud-api ──
  if (config.cloudConfig) {
    // Use the same model mapping as BYOK mode so the UI model selector works
    const modelMap: Record<string, string> = {
      'claude-opus-4.6': 'claude-opus-4-6-20260401',
      'claude-sonnet-4.6': 'claude-sonnet-4-6-20260201',
    };
    const selectedModel = providerOverride
      ? (modelMap[providerOverride] ?? providerOverride)
      : config.model;

    return {
      provider: new CloudProvider(config.cloudConfig),
      model: selectedModel,
    };
  }

  // ── BYOK Mode: direct provider calls ──
  const id = providerOverride || 'gemini';

  if (id === 'claude-opus-4.6' || id === 'claude-sonnet-4.6' || id.startsWith('claude')) {
    if (!config.anthropicApiKey) throw new Error('Anthropic API key is not configured.');

    // Map UI model IDs to Anthropic API model identifiers
    const modelMap: Record<string, string> = {
      'claude-opus-4.6': 'claude-opus-4-6-20260401',
      'claude-sonnet-4.6': 'claude-sonnet-4-6-20260201',
    };

    return {
      provider: new AnthropicProvider(config.anthropicApiKey),
      model: modelMap[id] ?? id,
    };
  }

  if (id === 'gpt-5.4' || id.startsWith('gpt')) {
    if (!config.openaiApiKey) throw new Error('OpenAI API key is not configured.');
    return { provider: new OpenAIProvider(config.openaiApiKey), model: id };
  }

  // Default: Gemini
  return { provider: new GeminiProvider(config.apiKey), model: config.model };
}

/**
 * Pick the summarizer the kernel uses during context compaction. We currently
 * only ship a Haiku-backed implementation -- it's cheap, fast, and produces
 * structured output reliably. If no Anthropic key is available, returns null
 * and the kernel falls back to the heuristic baseline.
 *
 * Note: cloud-routed agents skip this -- their summarization (if any) is a
 * cloud-api concern and would need its own credit/billing path.
 */
function resolveSummarizer(config: AgentConfig): Summarizer | null {
  if (config.cloudConfig) return null;
  if (!config.anthropicApiKey) return null;
  return createAnthropicSummarizer(config.anthropicApiKey);
}

/**
 * Construct an Agent bound to the provider/model selection policy encoded in
 * AgentConfig. The actual tool-use loop lives in @pipefx/agent-loop-kernel;
 * this function is just the glue that resolves a Provider per call and
 * delegates to the kernel.
 */
export function createAgent(config: AgentConfig): Agent {
  // Created once per agent and reused across turns -- the summarizer holds an
  // Anthropic SDK client we don't want to re-instantiate every chat().
  const summarizer = resolveSummarizer(config);

  return {
    async chat(message: string, options?: ChatOptions): Promise<string> {
      const { provider, model } = resolveProvider(config, options?.providerOverride);
      const systemPrompt = options?.systemPromptOverride ?? config.systemPrompt;
      return runAgentLoop(
        {
          provider,
          model,
          systemPrompt,
          registry: config.registry,
          summarizer,
        },
        message,
        options
      );
    },
  };
}
