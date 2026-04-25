import type { LocalToolWorkflow } from './types.js';
import { runTranscriptionPipeline } from './pipeline.js';

export const autoSubtitlesWorkflow: LocalToolWorkflow = {
  name: 'auto_generate_subtitles',
  description:
    'Automatically extracts audio from DaVinci Resolve, transcribes it via Whisper, translates it to the target language via Gemini, and inserts the subtitles back into the timeline. Call this if the user asks for subtitles.',
  parameters: {
    type: 'OBJECT',
    properties: {
      start_seconds: {
        type: 'NUMBER',
        description: 'Optional: only process from this second',
      },
      end_seconds: {
        type: 'NUMBER',
        description: 'Optional: only process until this second',
      },
      animation: {
        type: 'BOOLEAN',
        description:
          'Optional: true to generate animated text macros (Fusion) in DaVinci. false to generate standard SRT backups.',
      },
      max_words_per_chunk: {
        type: 'NUMBER',
        description:
          'Optional: maximum number of words per subtitle segment (default 8).',
      },
      max_chars_per_chunk: {
        type: 'NUMBER',
        description:
          'Optional: maximum number of characters per subtitle segment.',
      },
      max_chars_per_line: {
        type: 'NUMBER',
        description:
          'Optional: maximum number of characters before breaking to a new line within a segment.',
      },
      target_language: {
        type: 'STRING',
        description:
          'Optional: requested target language for the subtitles (e.g. English, French, Spanish). If omitted, preserves original language.',
      },
      highlight_color: {
        type: 'STRING',
        description:
          'Optional: hex color string (e.g. "#FF0000") to highlight the active word if animation is true.',
      },
      vad_sensitivity: {
        type: 'STRING',
        description:
          'Optional: "high" or "low". Specifies the sensitivity of Voice Activity Detection for segmentation. Use "high" if words are being cut off or dropped.',
      },
    },
  },
  execute: async (args, context) => {
    const { registry } = context;
    console.log(`Running Backend Pipeline: auto_generate_subtitles`, args);

    try {
      const segments = await runTranscriptionPipeline(context, {
        start_seconds: args.start_seconds as number | undefined,
        end_seconds: args.end_seconds as number | undefined,
        animation: Boolean(args.animation),
        target_language: args.target_language as string | undefined,
        vad_sensitivity: args.vad_sensitivity as 'low' | 'high' | undefined,
        use_vad: true,
        max_words_per_chunk: args.max_words_per_chunk as number | undefined,
        max_chars_per_chunk: args.max_chars_per_chunk as number | undefined,
        max_chars_per_line: args.max_chars_per_line as number | undefined,
      });

      if (segments.length === 0) {
        return JSON.stringify({
          error: 'No segments could be transcribed or the audio was silent.',
        });
      }

      // Import subtitles into timeline
      const subResult = await registry.callTool('add_timeline_subtitle', {
        subtitles_json: JSON.stringify(segments),
        animation: Boolean(args.animation),
        highlight_color: args.highlight_color as string | undefined,
      });
      console.log('Subtitles imported successfully:', subResult.content);

      return JSON.stringify({
        success: true,
        message:
          'The subtitles were perfectly generated, translated, and imported into DaVinci! Please tell the user exactly this to conclude the task. Tell them to check the timeline or the Media Pool.',
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return JSON.stringify({ error: msg });
    }
  },
};
