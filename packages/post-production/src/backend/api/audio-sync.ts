import type { IncomingMessage, ServerResponse } from 'http';
import type { LocalToolContext } from '../../workflows/types.js';
import { syncExternalAudioWorkflow } from '../../workflows/audio-sync.js';

/**
 * Handler for POST /api/audio-sync/run
 *
 * Directly invokes the audio sync pipeline (export ΓåÆ discover ΓåÆ correlate ΓåÆ inject ΓåÆ import)
 * without going through the AI agent loop.
 */
export function createAudioSyncHandler(context: LocalToolContext) {
  return async function handleAudioSync(
    req: IncomingMessage,
    res: ServerResponse
  ) {
    let body = '';
    req.on('data', (chunk: Buffer) => {
      body += chunk.toString();
    });

    req.on('end', async () => {
      try {
        const { audio_paths } = JSON.parse(body);

        if (!audio_paths || !Array.isArray(audio_paths) || audio_paths.length === 0) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              error: 'audio_paths is required and must be a non-empty array of file paths.',
            })
          );
          return;
        }

        console.log('[AUDIO-SYNC] Starting audio sync pipeline from UI:', {
          audio_paths,
        });

        // Run the audio sync workflow directly
        const resultStr = await syncExternalAudioWorkflow.execute(
          { audio_paths, app_target: 'resolve' },
          context
        );

        const result = JSON.parse(resultStr);

        if (result.error) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(result));
          return;
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (err: unknown) {
        console.error('[AUDIO-SYNC] Pipeline error:', err);
        const msg = err instanceof Error ? err.message : String(err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: msg }));
      }
    });
  };
}
