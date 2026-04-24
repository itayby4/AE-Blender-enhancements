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
    const { imageRefs, aspectRatio = '16:9' } = options || {};
    const size = ASPECT_TO_SIZE[aspectRatio] || 'auto';

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error(
        'OPENAI_API_KEY is not configured in the environment variables.'
      );
    }

    const client = new OpenAI({ apiKey });
    const model = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2';

    console.log(
      `[IMAGE-GEN] Calling ${model} with prompt: "${prompt}" | size: ${size}`
    );

    try {
      let response;
      if (imageRefs && imageRefs.length > 0) {
        const images = await Promise.all(
          imageRefs.map((ref, i) => refToUploadable(ref, i))
        );
        response = await client.images.edit({
          model,
          prompt,
          image: images.length === 1 ? images[0] : images,
          size,
        });
      } else {
        response = await client.images.generate({
          model,
          prompt,
          size,
        });
      }

      const first = response.data?.[0];
      if (!first || (!first.b64_json && !first.url)) {
        throw new Error('GPT Image 2 returned an empty image list');
      }

      const imageUrl = first.b64_json
        ? `data:image/png;base64,${first.b64_json}`
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
