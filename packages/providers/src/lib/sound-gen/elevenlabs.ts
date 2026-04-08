import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import { SoundProvider, SoundOptions } from './types.js';
import { providerRegistry } from '../registry.js';

const DEFAULT_VOICE_ID = 'JBFqnCBsd6RMkjVDRZzb'; // "George"
const DEFAULT_OUTPUT_FORMAT = 'mp3_44100_128';

function getClient(): ElevenLabsClient {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    throw new Error('ELEVENLABS_API_KEY is not set in environment variables.');
  }
  return new ElevenLabsClient({ apiKey });
}

/**
 * Collects an async iterable of Uint8Array chunks into a single Buffer,
 * then returns a base64 data URL.
 */
async function streamToBase64DataUrl(stream: AsyncIterable<Uint8Array> | ReadableStream<Uint8Array> | Buffer): Promise<string> {
  // If it's already a Buffer
  if (Buffer.isBuffer(stream)) {
    return `data:audio/mpeg;base64,${stream.toString('base64')}`;
  }

  const chunks: Uint8Array[] = [];

  // Handle ReadableStream (Web API)
  if (typeof (stream as any).getReader === 'function') {
    const reader = (stream as ReadableStream<Uint8Array>).getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) chunks.push(value);
    }
  } else {
    // Handle AsyncIterable
    for await (const chunk of stream as AsyncIterable<Uint8Array>) {
      chunks.push(chunk);
    }
  }

  const totalLength = chunks.reduce((acc, c) => acc + c.length, 0);
  const combined = Buffer.alloc(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.length;
  }

  return `data:audio/mpeg;base64,${combined.toString('base64')}`;
}

/**
 * Decodes a base64 data URL to a Buffer for upload to ElevenLabs.
 */
function dataUrlToBuffer(dataUrl: string): Buffer {
  const base64Data = dataUrl.includes('base64,') ? dataUrl.split('base64,')[1] : dataUrl;
  return Buffer.from(base64Data, 'base64');
}


// ── Text to Speech ──────────────────────────────────────────────
export const elevenLabsTtsProvider: SoundProvider = {
  id: 'elevenlabs-tts',
  name: 'ElevenLabs TTS',
  category: 'sound-gen',

  async generate(prompt: string, options?: SoundOptions) {
    const client = getClient();
    const voiceId = options?.voiceId || DEFAULT_VOICE_ID;
    const modelId = options?.modelId || 'eleven_v3';
    const outputFormat = options?.outputFormat || DEFAULT_OUTPUT_FORMAT;

    console.log(`[SOUND-GEN] ElevenLabs TTS: voice=${voiceId}, model=${modelId}`);

    const audio = await client.textToSpeech.convert(voiceId, {
      text: prompt,
      modelId: modelId,
      outputFormat: outputFormat as any,
    });

    const url = await streamToBase64DataUrl(audio as any);

    return { id: `el-tts-${Date.now()}`, status: 'succeed', url, type: 'audio' };
  },
};


// ── Text to Sound Effects ───────────────────────────────────────
export const elevenLabsSfxProvider: SoundProvider = {
  id: 'elevenlabs-sfx',
  name: 'ElevenLabs SFX',
  category: 'sound-gen',

  async generate(prompt: string, _options?: SoundOptions) {
    const client = getClient();

    console.log(`[SOUND-GEN] ElevenLabs SFX: "${prompt}"`);

    const audio = await client.textToSoundEffects.convert({ text: prompt });
    const url = await streamToBase64DataUrl(audio as any);

    return { id: `el-sfx-${Date.now()}`, status: 'succeed', url, type: 'audio' };
  },
};


// ── Speech to Speech ────────────────────────────────────────────
export const elevenLabsStsProvider: SoundProvider = {
  id: 'elevenlabs-sts',
  name: 'ElevenLabs STS',
  category: 'sound-gen',

  async generate(prompt: string, options?: SoundOptions) {
    const client = getClient();
    const voiceId = options?.voiceId || DEFAULT_VOICE_ID;
    const modelId = options?.modelId || 'eleven_multilingual_sts_v2';
    const outputFormat = options?.outputFormat || DEFAULT_OUTPUT_FORMAT;

    if (!options?.audioRef) {
      throw new Error('Speech-to-Speech requires an audio reference. Connect a Media Node with audio.');
    }

    console.log(`[SOUND-GEN] ElevenLabs STS: voice=${voiceId}, model=${modelId}`);

    const audioBuffer = dataUrlToBuffer(options.audioRef);

    const audio = await client.speechToSpeech.convert(voiceId, {
      audio: new Blob([audioBuffer], { type: 'audio/mpeg' }),
      modelId: modelId,
      outputFormat: outputFormat,
    } as any);

    const url = await streamToBase64DataUrl(audio as any);

    return { id: `el-sts-${Date.now()}`, status: 'succeed', url, type: 'audio' };
  },
};


// ── Audio Isolation ─────────────────────────────────────────────
export const elevenLabsIsolateProvider: SoundProvider = {
  id: 'elevenlabs-isolate',
  name: 'Audio Isolate',
  category: 'sound-gen',

  async generate(_prompt: string, options?: SoundOptions) {
    const client = getClient();

    if (!options?.audioRef) {
      throw new Error('Audio Isolation requires an audio reference. Connect a Media Node with audio.');
    }

    console.log(`[SOUND-GEN] ElevenLabs Audio Isolation`);

    const audioBuffer = dataUrlToBuffer(options.audioRef);

    const audio = await client.audioIsolation.convert({
      audio: new Blob([audioBuffer], { type: 'audio/mpeg' }),
    } as any);

    const url = await streamToBase64DataUrl(audio as any);

    return { id: `el-iso-${Date.now()}`, status: 'succeed', url, type: 'audio' };
  },
};


// ── Auto-register all providers ─────────────────────────────────
providerRegistry.registerSoundProvider(elevenLabsTtsProvider);
providerRegistry.registerSoundProvider(elevenLabsSfxProvider);
providerRegistry.registerSoundProvider(elevenLabsStsProvider);
providerRegistry.registerSoundProvider(elevenLabsIsolateProvider);
