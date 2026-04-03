import { GoogleGenAI } from '@google/genai';

export async function generateWithGemini(prompt: string, imageRefs?: string[]): Promise<{ url?: string; status: string; id: string; type: string }> {
  console.log(`[IMAGE-GEN] Calling Nano Banana 2 (Gemini 3.1 Flash Image) with prompt: "${prompt}"`);

  if (imageRefs && imageRefs.length > 0) {
    console.log(`[IMAGE-GEN] Received ${imageRefs.length} image reference(s)!`);
  }

  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured in the environment variables.');
  }

  try {
    const ai = new GoogleGenAI({ apiKey });

    console.log(`[IMAGE-GEN] Requesting image generation via generateContent...`);

    // Build the contents array — text prompt, optionally with an image reference
    const contents: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [
      { text: prompt }
    ];

    // If we have image references (base64 data URL), attach them as inline data
    if (imageRefs && imageRefs.length > 0) {
      for (const ref of imageRefs) {
        if (ref.startsWith('data:')) {
          const match = ref.match(/^data:(image\/\w+);base64,(.+)$/s);
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
      }
    }

    const response = await ai.models.generateContent({
      model: 'gemini-3.1-flash-image-preview',
      contents: contents,
      config: {
        responseModalities: ['TEXT', 'IMAGE'],
      }
    });

    // Extract image from response parts
    const parts = response.candidates?.[0]?.content?.parts;

    if (!parts || parts.length === 0) {
      throw new Error('Gemini API returned no parts. The prompt may have been blocked by safety filters.');
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
      throw new Error(`Gemini did not return an image. Model response: "${textResponse.slice(0, 300)}"`);
    }

    console.log(`[IMAGE-GEN] Image generated successfully!`);

    return {
      id: `gemini-img-${Date.now()}`,
      status: 'completed',
      type: 'image',
      url: imageDataUrl,
    };
  } catch (error) {
    console.error(`[IMAGE-GEN] Generation failed:`, error);
    throw new Error(`Image generation failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}
