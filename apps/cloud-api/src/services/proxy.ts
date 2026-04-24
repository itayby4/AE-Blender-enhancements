/**
 * PipeFX Cloud-API — LLM Provider Proxy.
 *
 * Forwards requests to LLM providers using server-side API keys.
 * Reuses the same provider classes from @pipefx/providers.
 */

import {
  GeminiProvider,
  OpenAIProvider,
  AnthropicProvider,
} from '@pipefx/providers';
import type { Provider, StreamEvent, ChatParams } from '@pipefx/providers';
import { config } from '../config.js';

/**
 * Resolve a provider instance by name, using server-side API keys.
 * Throws descriptive errors if the required API key is not configured.
 */
function resolveProvider(providerName: string): Provider {
  switch (providerName) {
    case 'gemini':
      if (!config.geminiApiKey) {
        throw new Error('Gemini API key not configured on cloud-api');
      }
      return new GeminiProvider(config.geminiApiKey);
    case 'openai':
      if (!config.openaiApiKey) {
        throw new Error('OpenAI API key not configured on cloud-api');
      }
      return new OpenAIProvider(config.openaiApiKey);
    case 'anthropic':
      if (!config.anthropicApiKey) {
        throw new Error('Anthropic API key not configured on cloud-api');
      }
      return new AnthropicProvider(config.anthropicApiKey);
    default:
      throw new Error(`Unknown provider: ${providerName}`);
  }
}

export interface ProxyRequest {
  provider: string;
  model: string;
  systemPrompt: string;
  messages: ChatParams['messages'];
  tools?: ChatParams['tools'];
}

/**
 * Stream a chat request through the appropriate LLM provider.
 */
export async function* proxyStream(
  params: ProxyRequest
): AsyncGenerator<StreamEvent> {
  const provider = resolveProvider(params.provider);

  yield* provider.chatStream({
    model: params.model,
    systemPrompt: params.systemPrompt,
    messages: params.messages,
    tools: params.tools ?? [],
  });
}
