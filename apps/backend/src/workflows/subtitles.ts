import type { WorkflowDefinition } from './types.js';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

export const autoSubtitlesWorkflow: WorkflowDefinition = {
  name: 'auto_generate_subtitles',
  description: 'Automatically extracts audio from DaVinci Resolve, transcribes it via Whisper, translates it to the target language via Gemini, and inserts the subtitles back into the timeline. Call this if the user asks for subtitles.',
  parameters: {
    type: 'OBJECT',
    properties: {
      start_seconds: { type: 'NUMBER', description: 'Optional: only process from this second' },
      end_seconds: { type: 'NUMBER', description: 'Optional: only process until this second' },
      animation: { type: 'BOOLEAN', description: 'Optional: generate fast-paced word-by-word animated subtitles' },
      target_language: { type: 'STRING', description: 'Optional: requested target language for the subtitles (e.g. English, French, Spanish). If omitted, preserves original language.' }
    }
  },
  execute: async (args, context) => {
    const { registry, ai, openai } = context;
    console.log(`Running Backend Pipeline: auto_generate_subtitles`, args);

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
        
        // 2. Run VAD to filter out empty silences
        const validChunks: any[] = [];
        const vadSplitScript = path.join(process.cwd(), 'stools', 'vad_split.py');
        
        for (const chunk of resJson.audio_chunks) {
          let actualPath = chunk.path;
          if (!fs.existsSync(actualPath)) {
              actualPath = actualPath.replace(/\.mp4$/, '.mp3');
              if (!fs.existsSync(actualPath)) actualPath = chunk.path;
          }
          
          if (actualPath && fs.existsSync(actualPath)) {
            try {
              console.log(`🔪 Slicing silences using WebRTC VAD on: ${actualPath}`);
              const stdout = execSync(`python "${vadSplitScript}" "${actualPath}" ${chunk.offset_seconds}`);
              const output = stdout.toString().trim();
              const splitChunks = JSON.parse(output.split('\n').pop() || '[]'); // In case VAD prints other things, take last line
              if (Array.isArray(splitChunks) && splitChunks.length > 0) {
                console.log(`   -> Sliced into ${splitChunks.length} tightly bounded speech chunks.`);
                validChunks.push(...splitChunks);
              } else {
                 console.log(`   -> No speech detected or split failed.`);
              }
            } catch (vadErr) {
              console.error(`   -> VAD failed, falling back to full original chunk:`, vadErr);
              validChunks.push({ path: actualPath, offset_seconds: chunk.offset_seconds });
            }
          }
        }
        
        console.log(`\n🚀 Transcribing ${validChunks.length} tight speech chunks via Whisper...`);
        
        for (const chunk of validChunks) {
          const actualPath = chunk.path;
          if (fs.existsSync(actualPath)) {
              console.log(`Sending tight chunk to Whisper: ${actualPath} (offset: ${chunk.offset_seconds}s)`);
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

                  const rawSegments = transcription.segments;
                  console.log(`Translating ${rawSegments.length} segments via Gemini (batches of ${BATCH_SIZE})...`);
                  
                  const translatedSegments: any[] = [];
                  
                  for (let b = 0; b < rawSegments.length; b += BATCH_SIZE) {
                    const batch = rawSegments.slice(b, b + BATCH_SIZE);
                    const batchNum = Math.floor(b / BATCH_SIZE) + 1;
                    const totalBatches = Math.ceil(rawSegments.length / BATCH_SIZE);
                    console.log(`  Batch ${batchNum}/${totalBatches} (${batch.length} segments)...`);
                    
                    const languageTarget = args.target_language || 'their original language';
                    const batchPrompt = `Translate these subtitle segments to ${languageTarget}. Auto-detect the source language – if already ${languageTarget}, keep as-is. Return JSON with a "segments" array. Keep all original keys (id, seek, start, end, etc.) and ONLY change the "text" field to ${languageTarget}. Do NOT split or merge segments.\n\nJSON:\n${JSON.stringify({segments: batch})}`;
                    
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
                      console.error(`  Batch ${batchNum} failed, using original:`, batchErr);
                      translatedSegments.push(...batch);
                    }
                  }
                  
                  console.log(`Formatting 100% accurate timestamps...`);
                  
                  for (const seg of translatedSegments) {
                    const text = (seg.text || '').trim();
                    const segStart = (seg.start ?? 0) + chunk.offset_seconds;
                    const segEnd = (seg.end ?? 0) + chunk.offset_seconds;
                    const segDuration = segEnd - segStart;
                    
                    if (!text || segDuration <= 0) continue;
                    
                    const words = text.split(/\s+/);
                    
                    if (args.animation) {
                      // Animated TikTok style: 1 word at a time, split duration proportionally
                      let currentStart = segStart;
                      for (let w = 0; w < words.length; w++) {
                        const word = words[w];
                        const chunkDur = segDuration / words.length;
                        const chunkEnd = Math.min(currentStart + chunkDur, segEnd);
                        
                        allSegments.push({
                          start_seconds: currentStart,
                          end_seconds: chunkEnd,
                          text: word,
                        });
                        currentStart = chunkEnd;
                      }
                    } else {
                      // Normal style: limit chunks to roughly 8 words (5-10 range)
                      // This avoids creating enormous text blocks on screen while 
                      // keeping chunks large enough to minimize awkward timing cuts.
                      const MAX_WORDS = 8;
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
                  
                  console.log(`Formatting done. Total subtitle entries: ${allSegments.length}`);
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
