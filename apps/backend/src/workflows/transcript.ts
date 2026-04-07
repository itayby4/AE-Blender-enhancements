import type { WorkflowDefinition } from './types.js';
import * as fs from 'fs';

export const timelineTranscriptWorkflow: WorkflowDefinition = {
  name: 'get_hebrew_transcript_from_timeline_audio',
  description: 'Extracts audio from DaVinci Resolve, transcribes via Whisper, and translates to Hebrew via Gemini. Returns the JSON array of subtitle segments (start_seconds, end_seconds, text) directly back to you so you can analyze the transcript content.',
  parameters: {
    type: 'OBJECT',
    properties: {
      start_seconds: { type: 'NUMBER', description: 'Optional: only process from this second' },
      end_seconds: { type: 'NUMBER', description: 'Optional: only process until this second' }
    }
  },
  execute: async (args, context) => {
    const { registry, ai, openai } = context;
    console.log(`Running Backend Pipeline: get_hebrew_transcript_from_timeline_audio`, args);

    // 1. Trigger audio rendering
    const renderResult = await registry.callTool('render_timeline_audio', args);
    const renderStr = Array.isArray(renderResult.content) 
      ? renderResult.content.filter((c: any) => c.type === 'text').map((c: any) => c.text).join('\n')
      : String(renderResult.content);
      
    try {
      const resJson = JSON.parse(renderStr);
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
                  // --- Batched translation via Gemini ---
                  const BATCH_SIZE = 30;
                  const MAX_WORDS = 5;
                  const rawSegments = transcription.segments;
                  console.log(`Translating ${rawSegments.length} segments via Gemini (batches of ${BATCH_SIZE})...`);
                  
                  const translatedSegments: any[] = [];
                  
                  for (let b = 0; b < rawSegments.length; b += BATCH_SIZE) {
                    const batch = rawSegments.slice(b, b + BATCH_SIZE);
                    
                    const batchPrompt = `Translate these subtitle segments to Hebrew. Auto-detect the source language – if already Hebrew, keep as-is. Return JSON with a "segments" array. Keep all original keys (id, seek, start, end, etc.) and ONLY change the "text" field to Hebrew. Do NOT split or merge segments.\n\nJSON:\n${JSON.stringify({segments: batch})}`;
                    
                    try {
                      const geminiResult = await ai.models.generateContent({
                        model: 'gemini-3.1-flash-lite-preview',
                        contents: batchPrompt,
                        config: {
                          responseMimeType: 'application/json',
                        },
                      });
                      
                      const batchJsonStr = geminiResult.text ?? '{"segments": []}';
                      const parsed = JSON.parse(batchJsonStr);
                      if (parsed.segments && Array.isArray(parsed.segments)) {
                        translatedSegments.push(...parsed.segments);
                      } else {
                        translatedSegments.push(...batch);
                      }
                    } catch (batchErr) {
                      translatedSegments.push(...batch);
                    }
                  }
                  
                  // --- Math-based splitting to max 5 words ---
                  for (const seg of translatedSegments) {
                    const text = (seg.text || '').trim();
                    const segStart = (seg.start ?? 0) + chunk.offset_seconds;
                    const segEnd = (seg.end ?? 0) + chunk.offset_seconds;
                    const segDuration = segEnd - segStart;
                    
                    if (!text || segDuration <= 0) continue;
                    
                    const words = text.split(/\s+/);
                    
                    if (words.length <= MAX_WORDS) {
                      allSegments.push({ start_seconds: segStart, end_seconds: segEnd, text });
                    } else {
                      // Split into chunks of MAX_WORDS with proportional time
                      let currentStart = segStart;
                      for (let w = 0; w < words.length; w += MAX_WORDS) {
                        const chunkWords = words.slice(w, w + MAX_WORDS);
                        const fraction = chunkWords.length / words.length;
                        const chunkDur = segDuration * fraction;
                        const chunkEnd = Math.min(currentStart + chunkDur, segEnd);
                        
                        allSegments.push({
                          start_seconds: currentStart,
                          end_seconds: chunkEnd,
                          text: chunkWords.join(' '),
                        });
                        currentStart = chunkEnd;
                      }
                    }
                  }
                }
              } catch (transcribeError) {
                console.error(`ERROR processing chunk ${actualPath}:`, transcribeError);
              }
          }
        }
        
        if (allSegments.length > 0) {
          return JSON.stringify({
            success: true,
            transcript: allSegments
          });
        } else {
            return JSON.stringify({ error: "No segments could be transcribed or the audio was silent." });
        }
      } else if (resJson.error) {
        return JSON.stringify({ error: resJson.error });
      }
    } catch (e) {
        return JSON.stringify({ error: "Failed to parse render_timeline_audio output." });
    }
    
    return JSON.stringify({ error: "Unknown error occurred during transcript generation." });
  }
};
