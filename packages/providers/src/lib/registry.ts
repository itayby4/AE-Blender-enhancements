import { VideoProvider } from './video-gen/types.js';
import { ImageProvider } from './image-gen/types.js';

class ProviderRegistry {
  private videoProviders: Map<string, VideoProvider> = new Map();
  private imageProviders: Map<string, ImageProvider> = new Map();
  // Future mapping for LLM, Sound, 3D Models, etc.

  registerVideoProvider(provider: VideoProvider) {
    this.videoProviders.set(provider.id, provider);
  }

  registerImageProvider(provider: ImageProvider) {
    this.imageProviders.set(provider.id, provider);
  }

  getVideoProvider(id: string): VideoProvider | undefined {
    return this.videoProviders.get(id);
  }

  getImageProvider(id: string): ImageProvider | undefined {
    return this.imageProviders.get(id);
  }
  
  hasVideoProvider(id: string): boolean {
    return this.videoProviders.has(id);
  }
  
  hasImageProvider(id: string): boolean {
    return this.imageProviders.has(id);
  }
}

export const providerRegistry = new ProviderRegistry();
