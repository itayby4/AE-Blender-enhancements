import type { IncomingMessage, ServerResponse } from 'http';
import { generateWithKling } from './providers/kling.js';
import { generateWithSeedDance } from './providers/seeddance.js';
import { generateWithNanoBanana } from './providers/nanobanana.js';

export async function handleVideoGenRequest(req: IncomingMessage, res: ServerResponse) {
  let body = '';
  req.on('data', (chunk: Buffer) => {
    body += chunk.toString();
  });

  req.on('end', async () => {
    try {
      const payload = JSON.parse(body);
      const { model, prompt, imageRef, duration, resolution, aspectRatio } = payload;
      
      if (!prompt) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Prompt is required' }));
        return;
      }
      
      let result;
      switch (model) {
        case 'kling3':
          result = await generateWithKling(prompt, imageRef, duration || '5', resolution || '720p', aspectRatio || '16:9');
          break;
        case 'seeddance2':
          result = await generateWithSeedDance(prompt, imageRef);
          break;
        case 'nanobanana2':
          result = await generateWithNanoBanana(prompt, imageRef);
          break;
        default:
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: `Unknown model: ${model}` }));
          return;
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
