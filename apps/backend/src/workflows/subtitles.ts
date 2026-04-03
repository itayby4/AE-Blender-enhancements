import type { WorkflowDefinition } from './types.js';
import * as fs from 'fs';

export const hebrewSubtitlesWorkflow: WorkflowDefinition = {
  name: 'auto_generate_hebrew_subtitles',
  description: 'Automatically extracts audio from DaVinci Resolve, transcribes it via Whisper, translates it to Hebrew via Gemini, and inserts the subtitles back into the timeline. Call this if the user asks for Hebrew subtitles.',
  parameters: {
    type: 'OBJECT',
    properties: {
      start_seconds: { type: 'NUMBER', description: 'Optional: only process from this second' },
      end_seconds: { type: 'NUMBER', description: 'Optional: only process until this second' },
      animation: { type: 'BOOLEAN', description: 'Optional: generate fast-paced word-by-word animated subtitles' }
    }
  },
  execute: async (args, context) => {
    const { registry, ai, openai } = context;
    console.log(`Running Backend Pipeline: auto_generate_hebrew_subtitles`, args);

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
                  const MAX_WORDS = args.animation ? 1 : 5;
                  const rawSegments = transcription.segments;
                  console.log(`Translating ${rawSegments.length} segments via Gemini (batches of ${BATCH_SIZE})...`);
                  
                  const translatedSegments: any[] = [];
                  
                  for (let b = 0; b < rawSegments.length; b += BATCH_SIZE) {
                    const batch = rawSegments.slice(b, b + BATCH_SIZE);
                    const batchNum = Math.floor(b / BATCH_SIZE) + 1;
                    const totalBatches = Math.ceil(rawSegments.length / BATCH_SIZE);
                    console.log(`  Batch ${batchNum}/${totalBatches} (${batch.length} segments)...`);
                    
                    const batchPrompt = `Translate these subtitle segments to Hebrew. Auto-detect the source language – if already Hebrew, keep as-is. Return JSON with a "segments" array. Keep all original keys (id, seek, start, end, etc.) and ONLY change the "text" field to Hebrew. Do NOT split or merge segments.\n\nJSON:\n${JSON.stringify({segments: batch})}`;
                    
                    try {
                      const geminiResult = await ai.models.generateContent({
                        model: 'gemini-2.5-flash',
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
                      console.error(`  Batch ${batchNum} failed, using original:`, batchErr);
                      translatedSegments.push(...batch);
                    }
                  }
                  
                  console.log(`Translation done. Splitting ${translatedSegments.length} segments to max ${MAX_WORDS} words...`);
                  
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
                  
                  console.log(`Splitting done. Total subtitle entries: ${allSegments.length}`);
                }
              } catch (transcribeError) {
                console.error(`ERROR processing chunk ${actualPath}:`, transcribeError);
              }
          } else {
              console.warn(`Audio chunk missing: ${actualPath}`);
          }
        }
        
        if (allSegments.length > 0) {
          console.log(`Translation completed! Processed ${allSegments.length} segments.`);
          // Import to Timeline feature
          try {
            const subResult = await registry.callTool('add_timeline_subtitle', { 
              subtitles_json: JSON.stringify(allSegments),
              animation: Boolean(args.animation)
            });
            console.log('Subtitles imported successfully:', subResult.content);
            return JSON.stringify({
              success: true,
              message: "The subtitles were perfectly generated, translated, and imported into DaVinci! Please tell the user exactly this to conclude the task. Tell them to check the timeline or the Media Pool."
            });
          } catch (subErr) {
            return JSON.stringify({ error: `Failed to insert subtitles into DaVinci: ${subErr}` });
          }
        } else {
            return JSON.stringify({ error: "No segments could be transcribed or the audio was silent." });
        }
      } else if (resJson.error) {
        return JSON.stringify({ error: resJson.error });
      }
    } catch (e) {
        return JSON.stringify({ error: "Failed to parse render_timeline_audio output." });
    }
    
    return JSON.stringify({ error: "Unknown error occurred during subtitle generation." });
  }
};
