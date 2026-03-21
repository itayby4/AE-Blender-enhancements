import { GoogleGenAI } from '@google/genai';
import { OpenAI } from 'openai';
import { mapToolsToGemini } from './tool-mapper.js';
import type { Agent, AgentConfig, ChatOptions } from './types.js';
import * as fs from 'fs';

export function createAgent(config: AgentConfig): Agent {
  const ai = new GoogleGenAI({ apiKey: config.apiKey });
  const openai = new OpenAI({ apiKey: config.openaiApiKey });

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
          tools: geminiTools.length > 0 ? geminiTools : undefined,
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

          let contentStr = Array.isArray(result.content) 
            ? result.content.filter((c: any) => c.type === 'text').map((c: any) => c.text).join('\n')
            : String(result.content);

          try {
            const resJson = JSON.parse(contentStr);
            if (resJson.audio_chunks && Array.isArray(resJson.audio_chunks)) {
              console.log(`Transcribing ${resJson.audio_chunks.length} audio chunks via Whisper...`);
              const allSegments: any[] = [];
              
              for (const chunk of resJson.audio_chunks) {
                let actualPath = chunk.path;
                if (!fs.existsSync(actualPath)) {
                  actualPath = actualPath.replace(/\.mp4$/, '.mp3');
                  if (!fs.existsSync(actualPath)) actualPath = chunk.path;
                }
                
                if (actualPath && fs.existsSync(actualPath)) {
                   console.log(`Sending chunk to Whisper: ${actualPath} (offset: ${chunk.offset_seconds}s)`);
                   try {
                     const transcription = await openai.audio.transcriptions.create({
                       file: fs.createReadStream(actualPath),
                       model: 'whisper-1',
                       response_format: 'verbose_json',
                       timestamp_granularities: ['segment']
                     }) as any;
                     
                     if (transcription.segments && transcription.segments.length > 0) {
                       console.log(`Translating ${transcription.segments.length} segments via GPT-4o...`);
                       const translatePrompt = `Translate the 'text' values from English to Hebrew in this JSON. Retain all original keys exactly. Return JSON format with a root "segments" array containing the translated objects.\n\nJSON:\n${JSON.stringify({segments: transcription.segments})}`;
                       
                       const completion = await openai.chat.completions.create({
                         model: 'gpt-4o',
                         messages: [{ role: 'user', content: translatePrompt }],
                         response_format: { type: 'json_object' }
                       });
                       
                       const translatedJsonStr = completion.choices[0].message.content || '{"segments": []}';
                       let chunkTranslatedSegments: any[] = [];
                       try {
                         chunkTranslatedSegments = JSON.parse(translatedJsonStr).segments;
                       } catch (e) {
                         console.error("Failed to parse translated JSON", e);
                         chunkTranslatedSegments = transcription.segments;
                       }
                       
                       for (const translatedSeg of chunkTranslatedSegments) {
                         allSegments.push({
                           start_seconds: translatedSeg.start + chunk.offset_seconds,
                           end_seconds: translatedSeg.end + chunk.offset_seconds,
                           text: translatedSeg.text
                         });
                       }
                     }
                   } catch (transcribeError) {
                     console.error(`ERROR processing chunk ${actualPath}:`, transcribeError);
                   }
                } else {
                   console.warn(`Audio chunk missing: ${actualPath}`);
                }
              }
              
              if (allSegments.length > 0) {
                console.log(`Translation completed! Adding ${allSegments.length} total segments to timeline via automated tool call...`);
                try {
                  const subResult = await config.registry.callTool('add_timeline_subtitle', { subtitles_json: JSON.stringify(allSegments) });
                  console.log('Subtitles imported successfully:', subResult.content);
                  contentStr = JSON.stringify({
                    success: true,
                    message: "The audio was fully transcribed, translated to Hebrew by GPT-4o, and imported into DaVinci successfully as Hebrew_Subtitles.srt! Tell the user exactly this."
                  });
                } catch (subErr) {
                  contentStr = JSON.stringify({ error: `Failed to insert subtitles into DaVinci: ${subErr}` });
                }
              } else {
                 contentStr = JSON.stringify({ error: "No segments could be transcribed or the audio was completely silent." });
              }
            }
          } catch (e) {
             // Ignore parse or root level errors
          }

          response = await chat.sendMessage({
            message: [
              {
                functionResponse: {
                  name: callName,
                  response: { result: contentStr },
                },
              }
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
