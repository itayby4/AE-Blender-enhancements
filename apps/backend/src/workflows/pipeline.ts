import type { WorkflowContext } from './types.js';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

export interface PipelineOptions {
  start_seconds?: number;
  end_seconds?: number;
  animation?: boolean;
  target_language?: string;
  use_vad?: boolean;
  vad_sensitivity?: 'low' | 'high';
  max_words_per_chunk?: number;
}

export interface SubtitleSegment {
  start_seconds: number;
  end_seconds: number;
  text: string;
}

/**
 * Extracts the text content from a ToolResult, handling both array and string forms.
 */
function extractToolResultText(content: unknown): string {
  if (Array.isArray(content)) {
    return content.filter((c: any) => c.type === 'text').map((c: any) => c.text).join('\n');
  }
  return String(content);
}

/**
 * Core subtitle/transcript pipeline:
 *   1. Render audio from timeline
 *   2. (Optional) Run VAD to filter silence
 *   3. Transcribe via Whisper (parallel)
 *   4. Translate via Gemini (batched)
 *   5. Split into word-chunks
 *
 * Returns the final array of SubtitleSegments.
 */
export async function runTranscriptionPipeline(
  context: WorkflowContext,
  options: PipelineOptions
): Promise<SubtitleSegment[]> {
  const { registry, ai, openai } = context;

  // --- Step 1: Render audio ---
  const renderResult = await registry.callTool('render_timeline_audio', {
    start_seconds: options.start_seconds,
    end_seconds: options.end_seconds,
  });
  const renderStr = extractToolResultText(renderResult.content);
  const resJson = JSON.parse(renderStr);

  if (resJson.error) throw new Error(resJson.error);
  if (!resJson.audio_chunks || !Array.isArray(resJson.audio_chunks)) {
    throw new Error('No audio chunks returned from render.');
  }

  console.log(`Rendered ${resJson.audio_chunks.length} audio chunks.`);

  // --- Step 2: (Optional) VAD silence filtering ---
  let chunksToTranscribe: Array<{ path: string; offset_seconds: number }>;

  if (options.use_vad) {
    chunksToTranscribe = [];
    const vadSplitScript = path.join(process.cwd(), 'stools', 'vad_split.py');

    for (const chunk of resJson.audio_chunks) {
      let actualPath = resolveChunkPath(chunk.path);
      if (!actualPath) continue;

      try {
        console.log(`🔪 VAD splitting: ${actualPath}`);
        const aggressiveness = options.vad_sensitivity === 'high' ? 0 : 1; // 0 is most sensitive to speech, 3 is least. Defaults to 1.
        const stdout = execSync(`python "${vadSplitScript}" "${actualPath}" ${chunk.offset_seconds} --aggressiveness ${aggressiveness}`);
        const output = stdout.toString().trim();
        const splitChunks = JSON.parse(output.split('\n').pop() || '[]');
        if (Array.isArray(splitChunks) && splitChunks.length > 0) {
          console.log(`   -> ${splitChunks.length} speech chunks`);
          chunksToTranscribe.push(...splitChunks);
        }
      } catch (vadErr) {
        console.error(`   -> VAD failed, using original chunk:`, vadErr);
        chunksToTranscribe.push({ path: actualPath, offset_seconds: chunk.offset_seconds });
      }
    }
  } else {
    chunksToTranscribe = resJson.audio_chunks
      .map((c: any) => ({ path: resolveChunkPath(c.path), offset_seconds: c.offset_seconds }))
      .filter((c: any) => c.path);
  }

  console.log(`🚀 Transcribing ${chunksToTranscribe.length} chunks via Whisper (parallel)...`);

  // --- Step 3: Whisper transcription (PARALLEL) ---
  const transcriptionResults = await Promise.all(
    chunksToTranscribe.map(async (chunk) => {
      if (!fs.existsSync(chunk.path)) return null;
      try {
        const transcription = await openai.audio.transcriptions.create({
          file: fs.createReadStream(chunk.path),
          model: 'whisper-1',
          response_format: 'verbose_json',
          timestamp_granularities: ['segment'],
        }) as any;
        return { segments: transcription.segments || [], offset: chunk.offset_seconds };
      } catch (err) {
        console.error(`ERROR transcribing ${chunk.path}:`, err);
        return null;
      }
    })
  );

  // Flatten all raw segments
  const allRawSegments: Array<{ segments: any[]; offset: number }> = transcriptionResults.filter(Boolean) as any;

  // --- Step 4: Gemini translation (batched) ---
  const BATCH_SIZE = 30;
  const languageTarget = options.target_language || 'their original language';
  const allTranslated: any[] = [];

  for (const { segments, offset } of allRawSegments) {
    for (let b = 0; b < segments.length; b += BATCH_SIZE) {
      const batch = segments.slice(b, b + BATCH_SIZE);
      const batchPrompt = `Translate these subtitle segments to ${languageTarget}. Auto-detect the source language – if already ${languageTarget}, keep as-is. Return JSON with a "segments" array. Keep all original keys (id, seek, start, end, etc.) and ONLY change the "text" field to ${languageTarget}. Do NOT split or merge segments.\n\nJSON:\n${JSON.stringify({ segments: batch })}`;

      try {
        const geminiResult = await ai.models.generateContent({
          model: 'gemini-3.1-flash-lite-preview',
          contents: batchPrompt,
          config: { responseMimeType: 'application/json' },
        });
        const parsed = JSON.parse(geminiResult.text ?? '{"segments": []}');
        const translated = parsed.segments && Array.isArray(parsed.segments) ? parsed.segments : batch;
        allTranslated.push(...translated.map((s: any) => ({ ...s, _offset: offset })));
      } catch {
        allTranslated.push(...batch.map((s: any) => ({ ...s, _offset: offset })));
      }
    }
  }

  // --- Step 5: Word-chunking ---
  const maxWords = options.max_words_per_chunk ?? 8;
  const finalSegments: SubtitleSegment[] = [];

  for (const seg of allTranslated) {
    const text = (seg.text || '').trim();
    const segStart = (seg.start ?? 0) + seg._offset;
    const segEnd = (seg.end ?? 0) + seg._offset;
    const segDuration = segEnd - segStart;
    if (!text || segDuration <= 0) continue;

    const words = text.split(/\s+/);

    if (options.animation) {
      // TikTok style: 1 word at a time
      let currentStart = segStart;
      for (const word of words) {
        const chunkDur = segDuration / words.length;
        const chunkEnd = Math.min(currentStart + chunkDur, segEnd);
        finalSegments.push({ start_seconds: currentStart, end_seconds: chunkEnd, text: word });
        currentStart = chunkEnd;
      }
    } else {
      let currentStart = segStart;
      for (let w = 0; w < words.length; w += maxWords) {
        const chunkWords = words.slice(w, w + maxWords);
        const fraction = chunkWords.length / words.length;
        const chunkDur = segDuration * fraction;
        const chunkEnd = Math.min(currentStart + chunkDur, segEnd);
        finalSegments.push({ start_seconds: currentStart, end_seconds: chunkEnd, text: chunkWords.join(' ') });
        currentStart = chunkEnd;
      }
    }
  }

  console.log(`Pipeline complete. ${finalSegments.length} subtitle segments produced.`);
  return finalSegments;
}

/** Resolves a chunk path, handling .mp4 -> .mp3 fallback */
function resolveChunkPath(originalPath: string): string | null {
  if (fs.existsSync(originalPath)) return originalPath;
  const mp3Path = originalPath.replace(/\.mp4$/, '.mp3');
  if (fs.existsSync(mp3Path)) return mp3Path;
  console.warn(`Audio chunk missing: ${originalPath}`);
  return null;
}
