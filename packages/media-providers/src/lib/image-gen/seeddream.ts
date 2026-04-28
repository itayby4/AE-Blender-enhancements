import { ImageProvider, ImageOptions } from './types.js';
import { providerRegistry } from '../registry.js';

export const seedDreamProvider: ImageProvider = {
  id: 'seeddream45',
  name: 'SeedDream 5',
  category: 'image-gen',

  async generate(
    prompt: string,
    options?: ImageOptions
  ): Promise<{ id: string; status: string; url?: string; type?: string }> {
    const { imageRefs, aspectRatio = '16:9' } = options || {};
    const finalPrompt = aspectRatio
      ? `${prompt}\n\nImportant: Generate strictly in ${aspectRatio} aspect ratio.`
      : prompt;
    console.log(
      `[IMAGE-GEN] Calling SeedDream 5 with prompt: "${finalPrompt}"`
    );

    // Use the same ARK API key as SeedDance — both hit the same BytePlus ARK domain.
    // Falls back to BYTEPLUS_API_KEY for backward compatibility.
    const apiKey = process.env.BYTEPLUS_ARK_API_KEY || process.env.BYTEPLUS_API_KEY;

    if (!apiKey) {
      throw new Error(
        'BYTEPLUS_ARK_API_KEY is not configured in the environment variables.'
      );
    }

    try {
      const url =
        'https://ark.ap-southeast.bytepluses.com/api/v3/images/generations';

      const endpointId = process.env.BYTEPLUS_SEEDDREAM_ENDPOINT;

      if (!endpointId) {
        throw new Error(
          'BYTEPLUS_SEEDDREAM_ENDPOINT is not configured in .env. You must create an Endpoint in ModelArk and put its ID (usually starts with ep-) here.'
        );
      }

      // Using the Endpoint ID deployed in BytePlus ModelArk
      const requestBody: any = {
        model: endpointId,
        prompt: finalPrompt,
      };

      if (imageRefs && imageRefs.length > 0) {
        // If an image reference is provided (e.g. for image-to-image or styles), we assume it's passed as 'image' parameter
        // based on typical Vision models. If BytePlus uses a different key, it can be adjusted here.
        requestBody.image = imageRefs[0];
      }

      console.log(`[IMAGE-GEN] Sending request to BytePlus API...`);
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      const data = (await response.json()) as any;

      if (!response.ok) {
        throw new Error(`SeedDream API Error: ${JSON.stringify(data)}`);
      }

      const imageData = data.data?.[0];

      if (!imageData || (!imageData.url && !imageData.b64_json)) {
        throw new Error('SeedDream returned an empty image list');
      }

      let imageUrl = imageData.url;
      if (imageData.b64_json) {
        imageUrl = `data:image/png;base64,${imageData.b64_json}`;
      }

      console.log(`[IMAGE-GEN] SeedDream 5 image generated successfully!`);

      return {
        id: `seeddream-${Date.now()}`,
        status: 'completed',
        type: 'image',
        url: imageUrl,
      };
    } catch (error) {
      console.error(`[IMAGE-GEN] SeedDream generation failed:`, error);
      throw new Error(
        `SeedDream generation failed: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  },
};

providerRegistry.registerImageProvider(seedDreamProvider);
