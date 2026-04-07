import { BaseProvider } from '../types.js';

export interface VideoOptions {
  imageRef?: string;
  imageTailRef?: string;
  duration?: string;
  resolution?: string;
  aspectRatio?: string;
}

export interface VideoProvider extends BaseProvider {
  /**
   * Generates a video based on the prompt and options
   * 
   * Note: Some providers might poll and return when done, 
   * while others might just return the taskId immediately.
   */
  generate(prompt: string, options?: VideoOptions): Promise<{ id: string; status: string; url?: string }>;
}
