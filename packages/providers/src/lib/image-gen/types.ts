import { BaseProvider } from '../types.js';

export interface ImageOptions {
  imageRefs?: string[];
  aspectRatio?: string;
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
