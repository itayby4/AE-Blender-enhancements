import { BaseProvider } from '../types.js';

export interface ImageOptions {
  imageRefs?: string[];
  aspectRatio?: string;
  /** GPT Image 2 — render quality. `auto` lets OpenAI pick. */
  quality?: 'auto' | 'low' | 'medium' | 'high';
  /** GPT Image 2 — transparent vs opaque background. */
  background?: 'auto' | 'transparent' | 'opaque';
  /** GPT Image 2 — output file format. */
  outputFormat?: 'png' | 'jpeg' | 'webp';
  /** GPT Image 2 — JPEG/WebP compression 0–100. Ignored for PNG. */
  outputCompression?: number;
}

export interface ImageProvider extends BaseProvider {
  /**
   * Generates an image based on the prompt and options
   */
  generate(
    prompt: string,
    options?: ImageOptions
  ): Promise<{ id: string; status: string; url?: string; type?: string }>;
}
