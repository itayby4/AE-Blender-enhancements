import { VideoProvider, VideoOptions } from './types.js';
import { providerRegistry } from '../registry.js';

const REPLICATE_KEY =
  process.env.REPLICATE_API_TOKEN || 'r8_9QIM5XSKQBn5MF2PEYL2CkItQPR5ulz15uPz3';

function createSeedDanceProvider(
  taskType: 'seedance-2.0' | 'seedance-2.0-fast',
  name: string,
  internalId: string
): VideoProvider {
  return {
    id: internalId,
    name: name,
    category: 'video-gen',

    async generate(
      prompt: string,
      options?: VideoOptions
    ): Promise<{ id: string; status: string; url?: string }> {
      console.log(
        `[VIDEO-GEN] Calling Replicate SeedDance API (${taskType}) with prompt: "${prompt}"`
      );

      const { imageRef, duration = '5' } = options || {};

      const inputPayload: any = {
        prompt: prompt,
        duration: parseInt(duration, 10) || 5,
        seed: Math.floor(Math.random() * 1000000),
      };

      if (imageRef) {
        inputPayload.image = imageRef;
      }

      // 1. Create prediction
      const response = await fetch(
        `https://api.replicate.com/v1/models/bytedance/${taskType}/predictions`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${REPLICATE_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ input: inputPayload }),
        }
      );

      if (!response.ok) {
        const text = await response.text();
        throw new Error(
          `Replicate SeedDance API error (${response.status}): ${text}`
        );
      }

      const data = (await response.json()) as any;
      if (!data.id) {
        throw new Error(
          `Replicate API creation returned error: ${JSON.stringify(data)}`
        );
      }

      const taskId = data.id;
      let status = data.status?.toLowerCase();
      console.log(
        `[VIDEO-GEN] Task created successfully. Task ID: ${taskId}, Initial Status: ${status}`
      );

      // 2. Poll for completion
      // Replicate states: starting, processing, succeeded, failed, canceled
      const maxAttempts = 120; // 10 minutes max at 5s/poll
      let attempts = 0;
      let videoUrl = '';

      while (
        status !== 'succeeded' &&
        status !== 'failed' &&
        status !== 'canceled' &&
        attempts < maxAttempts
      ) {
        await new Promise((r) => setTimeout(r, 5000));
        attempts++;

        try {
          const pollResponse = await fetch(
            `https://api.replicate.com/v1/predictions/${taskId}`,
            {
              method: 'GET',
              headers: {
                Authorization: `Bearer ${REPLICATE_KEY}`,
                'Content-Type': 'application/json',
              },
            }
          );

          if (pollResponse.ok) {
            const pollData = (await pollResponse.json()) as any;
            status = pollData.status?.toLowerCase();

            if (status === 'succeeded') {
              const output = pollData.output;
              if (typeof output === 'string') {
                videoUrl = output;
              } else if (Array.isArray(output) && output.length > 0) {
                videoUrl = output[0];
              }
            } else if (status === 'failed') {
              console.error(
                '[VIDEO-GEN] SeedDance Task Failed:',
                pollData.error
              );
              throw new Error(
                pollData.error || 'Task failed during processing'
              );
            }
          }
        } catch (e) {
          console.warn(
            '[VIDEO-GEN] Error polling task:',
            e instanceof Error ? e.message : e
          );
          if (e instanceof Error && e.message.includes('Task failed')) {
            throw e;
          }
        }
      }

      return {
        id: taskId,
        status: status === 'succeeded' ? 'succeed' : status, // Map to frontend expected "succeed" internally
        url: videoUrl,
      };
    },
  };
}

export const seedDanceProProvider = createSeedDanceProvider(
  'seedance-2.0',
  'SeedDance 2.0 (Pro)',
  'seedance-2'
);
export const seedDanceFastProvider = createSeedDanceProvider(
  'seedance-2.0-fast',
  'SeedDance 2.0 (Fast)',
  'seedance-2-fast'
);

providerRegistry.registerVideoProvider(seedDanceProProvider);
providerRegistry.registerVideoProvider(seedDanceFastProvider);
