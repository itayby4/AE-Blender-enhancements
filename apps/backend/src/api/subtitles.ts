import type { IncomingMessage, ServerResponse } from 'http';
import type { ConnectorRegistry } from '@pipefx/mcp';
import type { WorkflowContext } from '../workflows/types.js';
import { runTranscriptionPipeline } from '../workflows/pipeline.js';

/**
 * Handler for POST /api/subtitles/generate
 *
 * Directly invokes the subtitle pipeline (render ΓåÆ VAD ΓåÆ transcribe ΓåÆ translate ΓåÆ import)
 * without going through the AI agent loop.
 */
export function createSubtitleHandler(
  registry: ConnectorRegistry,
  context: WorkflowContext
) {
  return async function handleSubtitleGenerate(
    req: IncomingMessage,
    res: ServerResponse
  ) {
    let body = '';
    req.on('data', (chunk: Buffer) => {
      body += chunk.toString();
    });

    req.on('end', async () => {
      try {
        const {
          target_language,
          max_words_per_chunk = 5,
          vad_sensitivity = 'low',
          max_chars_per_chunk,
          max_chars_per_line,
          start_seconds,
          end_seconds,
        } = JSON.parse(body);

        console.log('[SUBTITLES] Starting subtitle generation pipeline:', {
          target_language,
          max_words_per_chunk,
          max_chars_per_chunk,
          max_chars_per_line,
          vad_sensitivity,
          start_seconds,
          end_seconds,
        });

        // Ensure the tool index is populated (required before callTool)
        await registry.getAllTools();

        // Run the transcription/translation pipeline
        const segments = await runTranscriptionPipeline(context, {
          start_seconds:
            start_seconds != null ? Number(start_seconds) : undefined,
          end_seconds: end_seconds != null ? Number(end_seconds) : undefined,
          target_language: target_language || undefined,
          vad_sensitivity: vad_sensitivity as 'low' | 'high',
          use_vad: true,
          max_words_per_chunk: Number(max_words_per_chunk),
          max_chars_per_chunk: max_chars_per_chunk != null ? Number(max_chars_per_chunk) : undefined,
          max_chars_per_line: max_chars_per_line != null ? Number(max_chars_per_line) : undefined,
        });

        if (segments.length === 0) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              error:
                'No segments could be transcribed ΓÇö the audio may be silent.',
            })
          );
          return;
        }

        console.log(
          `[SUBTITLES] Pipeline produced ${segments.length} segments. Importing into timelineΓÇª`
        );

        // Import subtitles into the DaVinci timeline
        const subResult = await registry.callTool('add_timeline_subtitle', {
          subtitles_json: JSON.stringify(segments),
          max_words: Number(max_words_per_chunk) || undefined,
          max_chars: max_chars_per_chunk != null ? Number(max_chars_per_chunk) : undefined,
          max_chars_per_line: max_chars_per_line != null ? Number(max_chars_per_line) : undefined,
        });

        const resultText = Array.isArray(subResult.content)
          ? subResult.content
              .filter((c: any) => c.type === 'text')
              .map((c: any) => c.text)
              .join('\n')
          : String(subResult.content);

        console.log('[SUBTITLES] Import result:', resultText);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            success: true,
            segments_count: segments.length,
            message: `Successfully generated ${segments.length} subtitle segments and imported them into the timeline. Check the Media Pool for the new SRT file.`,
          })
        );
      } catch (err: unknown) {
        console.error('[SUBTITLES] Pipeline error:', err);
        const msg = err instanceof Error ? err.message : String(err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: msg }));
      }
    });
  };
}
