export type ProviderCategory =
  | 'video-gen'
  | 'image-gen'
  | 'llm'
  | '3d-models'
  | 'sound-gen'
  | 'others';

export interface BaseProvider {
  /**
   * The unique identifier for the provider (e.g., 'kling', 'gemini-image')
   */
  id: string;

  /**
   * The category of the provider
   */
  category: ProviderCategory;

  /**
   * The human-readable name of the provider
   */
  name: string;
}
