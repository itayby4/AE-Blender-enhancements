import type { WorkflowDefinition } from './types.js';
import { runTranscriptionPipeline } from './pipeline.js';

export const autoSubtitlesWorkflow: WorkflowDefinition = {
  name: 'auto_generate_subtitles',
  description: 'Automatically extracts audio from DaVinci Resolve, transcribes it via Whisper, translates it to the target language via Gemini, and inserts the subtitles back into the timeline. Call this if the user asks for subtitles.',
  parameters: {
    type: 'OBJECT',
    properties: {
      start_seconds: { type: 'NUMBER', description: 'Optional: only process from this second' },
      end_seconds: { type: 'NUMBER', description: 'Optional: only process until this second' },
      animation: { type: 'BOOLEAN', description: 'Optional: generate fast-paced word-by-word animated subtitles' },
      target_language: { type: 'STRING', description: 'Optional: requested target language for the subtitles (e.g. English, French, Spanish). If omitted, preserves original language.' },
      vad_sensitivity: { type: 'STRING', description: 'Optional: "high" or "low". Specifies the sensitivity of Voice Activity Detection for segmentation. Use "high" if words are being cut off or dropped.' }
    }
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
        max_words_per_chunk: 8,
      });

      if (segments.length === 0) {
        return JSON.stringify({ error: "No segments could be transcribed or the audio was silent." });
      }

      // Import subtitles into timeline
      const subResult = await registry.callTool('add_timeline_subtitle', {
        subtitles_json: JSON.stringify(segments),
        animation: Boolean(args.animation),
      });
      console.log('Subtitles imported successfully:', subResult.content);

      return JSON.stringify({
        success: true,
        message: "The subtitles were perfectly generated, translated, and imported into DaVinci! Please tell the user exactly this to conclude the task. Tell them to check the timeline or the Media Pool.",
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return JSON.stringify({ error: msg });
    }
  }
};
