import { BaseProvider } from '../types.js';

export interface SoundOptions {
  /**
   * ElevenLabs voice ID (defaults to "George" JBFqnCBsd6RMkjVDRZzb)
   */
  voiceId?: string;

  /**
   * Model ID for the generation (e.g. 'eleven_v3', 'eleven_multilingual_v2')
   */
  modelId?: string;

  /**
   * Output format (e.g. 'mp3_44100_128')
   */
  outputFormat?: string;

  /**
   * Audio reference as base64 data URL (for speech-to-speech and audio isolation)
   */
  audioRef?: string;
}

export interface SoundProvider extends BaseProvider {
  /**
   * Generates audio based on the prompt/text and options.
   * Returns a base64 data URL of the generated audio.
   */
  generate(prompt: string, options?: SoundOptions): Promise<{ id: string; status: string; url?: string; type?: string }>;
}
