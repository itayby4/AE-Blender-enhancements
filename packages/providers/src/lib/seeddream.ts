import { GoogleGenAI } from '@google/genai';

export async function generateWithSeedDream(prompt: string, imageRef?: string): Promise<{ url?: string; status: string; id: string; type: string }> {
  console.log(`[IMAGE-GEN] Calling SeedDream 4.5 (Gemini Image) with prompt: "${prompt}"`);

  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured in the environment variables.');
  }

  try {
    const ai = new GoogleGenAI({ apiKey });

    const contents: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [
      { text: prompt }
    ];

    if (imageRef && imageRef.startsWith('data:')) {
      const match = imageRef.match(/^data:(image\/\w+);base64,(.+)$/s);
      if (match) {
        contents.push({
          inlineData: {
            mimeType: match[1],
            data: match[2],
          }
        });
        console.log(`[IMAGE-GEN] Attached image reference as inline data (${match[1]})`);
      }
    }

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-preview-image-generation',
      contents: contents,
      config: {
        responseModalities: ['TEXT', 'IMAGE'],
      }
    });

    const parts = response.candidates?.[0]?.content?.parts;

    if (!parts || parts.length === 0) {
      throw new Error('SeedDream API returned no parts. The prompt may have been blocked by safety filters.');
    }

    let textResponse = '';
    let imageDataUrl: string | null = null;

    for (const part of parts) {
      if (part.text) {
        textResponse += part.text;
      } else if (part.inlineData) {
        const mimeType = part.inlineData.mimeType || 'image/png';
        const b64 = part.inlineData.data;
        imageDataUrl = `data:${mimeType};base64,${b64}`;
      }
    }

    if (textResponse) {
      console.log(`[IMAGE-GEN] Model text response: ${textResponse.slice(0, 200)}`);
    }

    if (!imageDataUrl) {
      throw new Error(`SeedDream did not return an image. Model response: "${textResponse.slice(0, 300)}"`);
    }

    console.log(`[IMAGE-GEN] SeedDream 4.5 image generated successfully!`);

    return {
      id: `seeddream-${Date.now()}`,
      status: 'completed',
      type: 'image',
      url: imageDataUrl,
    };
  } catch (error) {
    console.error(`[IMAGE-GEN] SeedDream generation failed:`, error);
    throw new Error(`SeedDream generation failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}
