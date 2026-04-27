import OpenAI, { toFile } from 'openai';
import { ImageProvider, ImageOptions } from './types.js';
import { providerRegistry } from '../registry.js';

const ASPECT_TO_SIZE: Record<string, '1024x1024' | '1024x1536' | '1536x1024' | 'auto'> = {
  '1:1': '1024x1024',
  '9:16': '1024x1536',
  '3:4': '1024x1536',
  '16:9': '1536x1024',
  '4:3': '1536x1024',
  '21:9': '1536x1024',
  auto: 'auto',
};

async function refToUploadable(ref: string, index: number) {
  if (ref.startsWith('data:')) {
    const match = ref.match(/^data:(image\/\w+);base64,(.+)$/s);
    if (!match) throw new Error('Unsupported data URL for image reference');
    const [, mime, b64] = match;
    const buf = Buffer.from(b64, 'base64');
    const ext = mime.split('/')[1] || 'png';
    return toFile(buf, `ref-${index}.${ext}`, { type: mime });
  }

  const response = await fetch(ref);
  if (!response.ok) {
    throw new Error(`Failed to fetch image reference (${response.status})`);
  }
  const mime = response.headers.get('content-type') || 'image/png';
  const ab = await response.arrayBuffer();
  const ext = mime.split('/')[1] || 'png';
  return toFile(Buffer.from(ab), `ref-${index}.${ext}`, { type: mime });
}

export const gptImage2Provider: ImageProvider = {
  id: 'gpt-image-2',
  name: 'GPT Image 2',
  category: 'image-gen',

  async generate(
    prompt: string,
    options?: ImageOptions
  ): Promise<{ id: string; status: string; url?: string; type?: string }> {
    const {
      imageRefs,
      aspectRatio = '16:9',
      quality = 'auto',
      background = 'auto',
      outputFormat,
      outputCompression,
    } = options || {};
    const size = ASPECT_TO_SIZE[aspectRatio] || 'auto';

    // Transparent background only meaningful with PNG/WebP — silently
    // downgrade if the user picked transparent + JPEG.
    const resolvedBackground =
      background === 'transparent' && outputFormat === 'jpeg'
        ? 'opaque'
        : background;

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error(
        'OPENAI_API_KEY is not configured in the environment variables.'
      );
    }

    const client = new OpenAI({ apiKey });
    const model = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2';

    console.log(
      `[IMAGE-GEN] Calling ${model} with prompt: "${prompt}" | size: ${size} | quality: ${quality} | background: ${resolvedBackground} | format: ${
        outputFormat ?? 'default'
      }`
    );

    // Build the params object once. The OpenAI SDK rejects keys whose
    // value is `undefined` for some image-edit overloads, so we only set
    // a key if the caller actually picked a value.
    type ImageParams = {
      model: string;
      prompt: string;
      size: typeof size;
      quality?: 'auto' | 'low' | 'medium' | 'high';
      background?: 'auto' | 'transparent' | 'opaque';
      output_format?: 'png' | 'jpeg' | 'webp';
      output_compression?: number;
    };
    const baseParams: ImageParams = { model, prompt, size };
    if (quality !== 'auto') baseParams.quality = quality;
    if (resolvedBackground !== 'auto') baseParams.background = resolvedBackground;
    if (outputFormat) baseParams.output_format = outputFormat;
    if (
      outputCompression !== undefined &&
      outputFormat &&
      outputFormat !== 'png'
    ) {
      baseParams.output_compression = outputCompression;
    }

    try {
      let response;
      if (imageRefs && imageRefs.length > 0) {
        const images = await Promise.all(
          imageRefs.map((ref, i) => refToUploadable(ref, i))
        );
        response = await client.images.edit({
          ...baseParams,
          image: images.length === 1 ? images[0] : images,
        });
      } else {
        response = await client.images.generate(baseParams);
      }

      const first = response.data?.[0];
      if (!first || (!first.b64_json && !first.url)) {
        throw new Error('GPT Image 2 returned an empty image list');
      }

      const mime = `image/${outputFormat ?? 'png'}`;
      const imageUrl = first.b64_json
        ? `data:${mime};base64,${first.b64_json}`
        : (first.url as string);

      console.log(`[IMAGE-GEN] GPT Image 2 generated successfully!`);

      return {
        id: `gpt-image-2-${Date.now()}`,
        status: 'completed',
        type: 'image',
        url: imageUrl,
      };
    } catch (error) {
      console.error(`[IMAGE-GEN] GPT Image 2 generation failed:`, error);
      throw new Error(
        `GPT Image 2 generation failed: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  },
};

providerRegistry.registerImageProvider(gptImage2Provider);
