import { GoogleGenAI } from '@google/genai';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import {
  mapToolsToGemini,
  mapToolsToOpenAI,
  mapToolsToAnthropic,
} from './tool-mapper.js';
import type { Agent, AgentConfig, ChatOptions } from './types.js';

export function createAgent(config: AgentConfig): Agent {
  const geminiClient = new GoogleGenAI({ apiKey: config.apiKey });
  const openaiClient = config.openaiApiKey
    ? new OpenAI({ apiKey: config.openaiApiKey })
    : null;
  const anthropicClient = config.anthropicApiKey
    ? new Anthropic({ apiKey: config.anthropicApiKey })
    : null;

  return {
    async chat(message: string, options?: ChatOptions): Promise<string> {
      const activeProvider =
        options?.providerOverride || 'gemini-3.1-pro-preview';
      const activeModel = options?.modelOverride ?? config.model;
      const systemPrompt = options?.systemPromptOverride ?? config.systemPrompt;

      let tools = await config.registry.getAllTools();
      if (options?.allowedTools) {
        const allowed = new Set(options.allowedTools);
        tools = tools.filter((t) => allowed.has(t.name));
      }

      // Format history natively as simplified user/assistant strings to convert later
      // The frontend sends Gemini-like format: { role: 'user'|'model', parts: [{text}] }
      const rawHistory: any[] = options?.history || [];
      const normalizedHistory = rawHistory.map((m: any) => ({
        role: (m.role === 'model' ? 'assistant' : 'user') as
          | 'assistant'
          | 'user',
        content: m.parts?.[0]?.text || '',
      }));

      // --- OpenAI Flow ---
      if (activeProvider === 'gpt-5.4' || activeProvider.startsWith('gpt')) {
        if (!openaiClient) throw new Error('OpenAI API key is not configured.');
        const openAiTools = mapToolsToOpenAI(tools);
        const messages: any[] = [
          { role: 'system', content: systemPrompt },
          ...normalizedHistory,
          { role: 'user', content: message },
        ];

        let response = await openaiClient.chat.completions.create({
          model: activeProvider,
          messages,
          tools: openAiTools.length > 0 ? openAiTools : undefined,
        });

        while (
          response.choices[0].message.tool_calls &&
          response.choices[0].message.tool_calls.length > 0
        ) {
          if (options?.signal?.aborted) throw new Error('AbortError');
          const m = response.choices[0].message;
          // Emit intermediate text as Chain of Thought
          if (m.content && options?.onThought) {
            options.onThought(m.content);
          }
          messages.push(m);

          const toolResults = await Promise.all(
            m.tool_calls!.map(async (call) => {
              const callObj = call as any;
              try {
                const args = JSON.parse(callObj.function.arguments);
                if (options?.onToolCallStart) {
                  options.onToolCallStart(callObj.function.name, args);
                }
                const result = await config.registry.callTool(
                  callObj.function.name,
                  args
                );
                if (options?.onToolCallComplete) {
                  options.onToolCallComplete(callObj.function.name, result);
                }
                const contentStr = Array.isArray(result.content)
                  ? result.content
                      .filter((c: any) => c.type === 'text')
                      .map((c: any) => c.text)
                      .join('\n')
                  : String(result.content);
                return {
                  tool_call_id: callObj.id,
                  role: 'tool' as const,
                  name: callObj.function.name,
                  content: contentStr,
                };
              } catch (err: any) {
                if (options?.onToolCallComplete) {
                  options.onToolCallComplete(callObj.function.name, null, err instanceof Error ? err : new Error(String(err)));
                }
                return {
                  tool_call_id: callObj.id,
                  role: 'tool' as const,
                  name: callObj.function.name,
                  content: String(err),
                };
              }
            })
          );
          messages.push(...toolResults);
          response = await openaiClient.chat.completions.create({
            model: activeProvider,
            messages,
            tools: openAiTools.length > 0 ? openAiTools : undefined,
          });
        }
        return response.choices[0].message.content ?? 'No response content.';
      }

      // --- Anthropic Flow ---
      if (
        activeProvider === 'claude-sonnet-4.6' ||
        activeProvider.startsWith('claude')
      ) {
        if (!anthropicClient)
          throw new Error('Anthropic API key is not configured.');
        const claudeTools = mapToolsToAnthropic(tools);
        const messages: Anthropic.MessageParam[] = [
          ...normalizedHistory,
          { role: 'user', content: message },
        ];

        let response = await anthropicClient.messages.create({
          model:
            activeProvider === 'claude-sonnet-4.6'
              ? 'claude-opus-4-6'
              : activeProvider,
          system: systemPrompt,
          max_tokens: 4000,
          messages,
          tools: claudeTools.length > 0 ? claudeTools : undefined,
        });

        while (response.stop_reason === 'tool_use') {
          if (options?.signal?.aborted) throw new Error('AbortError');
          const toolUses = response.content.filter(
            (c): c is Anthropic.ToolUseBlock => c.type === 'tool_use'
          );
          // Emit intermediate text as Chain of Thought
          const thinkingBlocks = response.content.filter(
            (c) => c.type === 'text'
          );
          if (thinkingBlocks.length > 0 && options?.onThought) {
            for (const block of thinkingBlocks) {
              if (block.type === 'text' && block.text) {
                options.onThought(block.text);
              }
            }
          }
          messages.push({ role: 'assistant', content: response.content });

          const toolResults: Anthropic.ToolResultBlockParam[] = [];

          const resolvedResults = await Promise.all(
            toolUses.map(async (call) => {
              try {
                if (options?.onToolCallStart) {
                  options.onToolCallStart(call.name, call.input as any);
                }
                const result = await config.registry.callTool(
                  call.name,
                  call.input as any
                );
                if (options?.onToolCallComplete) {
                  options.onToolCallComplete(call.name, result);
                }
                const contentStr = Array.isArray(result.content)
                  ? result.content
                      .filter((c: any) => c.type === 'text')
                      .map((c: any) => c.text)
                      .join('\n')
                  : String(result.content);
                return {
                  type: 'tool_result' as const,
                  tool_use_id: call.id,
                  content: contentStr,
                };
              } catch (err: any) {
                if (options?.onToolCallComplete) {
                  options.onToolCallComplete(call.name, null, err instanceof Error ? err : new Error(String(err)));
                }
                return {
                  type: 'tool_result' as const,
                  tool_use_id: call.id,
                  content: String(err),
                  is_error: true,
                };
              }
            })
          );
          toolResults.push(...resolvedResults);

          messages.push({ role: 'user', content: toolResults });
          response = await anthropicClient.messages.create({
            model:
              activeProvider === 'claude-sonnet-4.6'
                ? 'claude-opus-4-6'
                : activeProvider,
            system: systemPrompt,
            max_tokens: 4000,
            messages,
            tools: claudeTools.length > 0 ? claudeTools : undefined,
          });
        }

        const finalContent = response.content.find((c) => c.type === 'text');
        return finalContent?.type === 'text'
          ? finalContent.text
          : 'No response content.';
      }

      // --- Default: Gemini Flow ---
      const geminiTools = mapToolsToGemini(tools);
      const chat = geminiClient.chats.create({
        model: activeModel,
        history: rawHistory,
        config: {
          systemInstruction: systemPrompt,
          tools: geminiTools.length > 0 ? geminiTools : undefined,
        },
      });

      let response = await chat.sendMessage({ message });

      while (response.functionCalls && response.functionCalls.length > 0) {
        if (options?.signal?.aborted) throw new Error('AbortError');
        const call = response.functionCalls[0];
        const callName = call.name ?? 'unknown_tool';

        // Emit intermediate text as Chain of Thought
        if (response.text && options?.onThought) {
          options.onThought(response.text);
        }

        try {
          const args = (call.args as Record<string, unknown>) ?? {};
          if (options?.onToolCallStart) {
            options.onToolCallStart(callName, args);
          }
          const result = await config.registry.callTool(
            callName,
            args
          );
          if (options?.onToolCallComplete) {
            options.onToolCallComplete(callName, result);
          }

          const contentStr = Array.isArray(result.content)
            ? result.content
                .filter((c: any) => c.type === 'text')
                .map((c: any) => c.text)
                .join('\n')
            : String(result.content);

          response = await chat.sendMessage({
            message: [
              {
                functionResponse: {
                  name: callName,
                  response: { result: contentStr },
                },
              },
            ],
          });
        } catch (toolError) {
          if (options?.onToolCallComplete) {
            options.onToolCallComplete(callName, null, toolError instanceof Error ? toolError : new Error(String(toolError)));
          }
          response = await chat.sendMessage({
            message: [
              {
                functionResponse: {
                  name: callName,
                  response: { error: String(toolError) },
                },
              },
            ],
          });
        }
      }

      return (
        response.text ??
        'I processed your request, but I have no text response.'
      );
    },
  };
}
