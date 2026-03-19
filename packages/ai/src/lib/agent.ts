import { GoogleGenAI } from '@google/genai';
import { mapToolsToGemini } from './tool-mapper.js';
import type { Agent, AgentConfig, ChatOptions } from './types.js';
import * as fs from 'fs';

export function createAgent(config: AgentConfig): Agent {
  const ai = new GoogleGenAI({ apiKey: config.apiKey });

  return {
    async chat(message: string, options?: ChatOptions): Promise<string> {
      let tools = await config.registry.getAllTools();
      if (options?.allowedTools) {
        const allowed = new Set(options.allowedTools);
        tools = tools.filter(t => allowed.has(t.name));
      }
      const geminiTools = mapToolsToGemini(tools);
      
      const activeModel = options?.modelOverride ?? config.model;

      const chat = ai.chats.create({
        model: activeModel,
        config: {
          systemInstruction: options?.systemPromptOverride ?? config.systemPrompt,
          tools: geminiTools.length > 0 ? geminiTools : undefined, // Gemini needs undefined if no tools
        },
      });

      let response = await chat.sendMessage({ message });

      while (response.functionCalls && response.functionCalls.length > 0) {
        const call = response.functionCalls[0];
        const callName = call.name ?? 'unknown_tool';

        try {
          const result = await config.registry.callTool(
            callName,
            (call.args as Record<string, unknown>) ?? {}
          );

          let additionalParts: any[] = [];
          if (result.content && typeof result.content === 'string') {
            try {
              const resJson = JSON.parse(result.content);
              if (resJson.audio_path && fs.existsSync(resJson.audio_path)) {
                const audioBase64 = fs.readFileSync(resJson.audio_path).toString('base64');
                additionalParts.push({
                  inlineData: {
                    data: audioBase64,
                    mimeType: 'audio/wav'
                  }
                });
              }
            } catch (e) {
              // Ignore parse errors or non-json strings
            }
          }

          response = await chat.sendMessage({
            message: [
              {
                functionResponse: {
                  name: call.name,
                  response: { result: result.content },
                },
              },
              ...additionalParts
            ],
          });
        } catch (toolError) {
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

      return response.text ?? 'I processed your request, but I have no text response.';
    },
  };
}
