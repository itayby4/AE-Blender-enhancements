import type { WorkflowDefinition } from './types.js';
import { runTranscriptionPipeline } from './pipeline.js';

export const timelineTranscriptWorkflow: WorkflowDefinition = {
  name: 'get_transcript_from_timeline_audio',
  description:
    'Extracts audio from DaVinci Resolve, transcribes via Whisper, and translates to the target language via Gemini (defaults to Hebrew). Returns the JSON array of subtitle segments directly back to you.',
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
      target_language: {
        type: 'STRING',
        description: 'Optional: the desired language for the transcript (e.g. "English", "Hebrew"). Defaults to "Hebrew".',
      },
    },
  },
  execute: async (args, context) => {
    console.log(
      `Running Backend Pipeline: get_transcript_from_timeline_audio`,
      args
    );

    try {
      const segments = await runTranscriptionPipeline(context, {
        start_seconds: args.start_seconds as number | undefined,
        end_seconds: args.end_seconds as number | undefined,
        target_language: (args.target_language as string | undefined) || 'Hebrew',
        use_vad: true,
        vad_sensitivity: 'low',
        max_words_per_chunk: 5,
      });

      if (segments.length === 0) {
        return JSON.stringify({
          error: 'No segments could be transcribed or the audio was silent.',
        });
      }

      return JSON.stringify({ success: true, transcript: segments });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return JSON.stringify({ error: msg });
    }
  },
};
