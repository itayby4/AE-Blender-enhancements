import type { WorkflowDefinition } from './types.js';
import { runTranscriptionPipeline } from './pipeline.js';

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
    console.log(`Running Backend Pipeline: get_hebrew_transcript_from_timeline_audio`, args);

    try {
      const segments = await runTranscriptionPipeline(context, {
        start_seconds: args.start_seconds as number | undefined,
        end_seconds: args.end_seconds as number | undefined,
        target_language: 'Hebrew',
        use_vad: false,
        max_words_per_chunk: 5,
      });

      if (segments.length === 0) {
        return JSON.stringify({ error: "No segments could be transcribed or the audio was silent." });
      }

      return JSON.stringify({ success: true, transcript: segments });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return JSON.stringify({ error: msg });
    }
  }
};
