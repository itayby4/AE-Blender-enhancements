import type { IncomingMessage, ServerResponse } from 'http';
import { providerRegistry } from '@pipefx/providers';

export async function handleAiModelRequest(req: IncomingMessage, res: ServerResponse) {
  let body = '';
  req.on('data', (chunk: Buffer) => {
    body += chunk.toString();
  });

  req.on('end', async () => {
    try {
      const payload = JSON.parse(body);
      const { model, prompt, imageRef, lastFrameRef, imageRefs, duration, resolution, aspectRatio } = payload;
      
      if (!prompt) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Prompt is required' }));
        return;
      }
      
      let result;
      
      // Check video providers first
      const videoProvider = providerRegistry.getVideoProvider(model);
      if (videoProvider) {
        result = await videoProvider.generate(prompt, {
          imageRef,
          imageTailRef: lastFrameRef,
          duration,
          resolution,
          aspectRatio
        });
      } else {
        // Fallback to image providers
        const imageProvider = providerRegistry.getImageProvider(model);
        if (imageProvider) {
          result = await imageProvider.generate(prompt, {
            imageRefs: imageRefs || (imageRef ? [imageRef] : undefined),
            aspectRatio
          });
        } else {
          // No provider found
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: `Unknown model: ${model}` }));
          return;
        }
      }
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
      
    } catch (err: unknown) {
      console.error('[VIDEO-GEN] Error processing request:', err);
      const msg = err instanceof Error ? err.message : String(err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: msg }));
    }
  });
}
