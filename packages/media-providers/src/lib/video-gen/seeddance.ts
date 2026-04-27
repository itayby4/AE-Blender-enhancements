import { VideoProvider, VideoOptions } from './types.js';
import { providerRegistry } from '../registry.js';

// BytePlus ARK (ap-southeast-1) — direct ByteDance API for SeedDance.
// Replaces the previous Replicate-proxied call.
const ARK_API_KEY = process.env.BYTEPLUS_ARK_API_KEY || '';
const ARK_BASE_URL =
  process.env.BYTEPLUS_ARK_BASE_URL ||
  'https://ark.ap-southeast.bytepluses.com/api/v3';

// Model IDs are dated on BytePlus (e.g. dreamina-seedance-2-0-fast-260128).
// Override per-deploy via env without code changes when ByteDance bumps the
// version. Fast is what's currently activated; pro defaults to fast until
// the user provides a Pro model id.
const FAST_MODEL_ID =
  process.env.BYTEPLUS_SEEDANCE_FAST_MODEL ||
  'dreamina-seedance-2-0-fast-260128';
const PRO_MODEL_ID =
  process.env.BYTEPLUS_SEEDANCE_PRO_MODEL || FAST_MODEL_ID;

function createSeedDanceProvider(
  modelId: string,
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
      if (!ARK_API_KEY) {
        throw new Error(
          'BYTEPLUS_ARK_API_KEY is not configured. Add it to your .env.'
        );
      }

      const {
        imageRef,
        imageTailRef,
        duration = '5',
        resolution = '720p',
        aspectRatio = '16:9',
      } = options || {};

      // BytePlus expects a `content` array mixing text + image_url items
      // with role hints (first_frame / last_frame). Single-frame callers
      // send imageRef; head+tail callers add imageTailRef as last_frame.
      const content: Array<Record<string, unknown>> = [
        { type: 'text', text: prompt },
      ];
      if (imageRef) {
        content.push({
          type: 'image_url',
          image_url: { url: imageRef },
          role: 'first_frame',
        });
      }
      if (imageTailRef) {
        content.push({
          type: 'image_url',
          image_url: { url: imageTailRef },
          role: 'last_frame',
        });
      }

      const body = {
        model: modelId,
        content,
        ratio: aspectRatio,
        duration: parseInt(duration, 10) || 5,
        resolution,
        generate_audio: true,
        watermark: false,
      };

      console.log(
        `[VIDEO-GEN] Calling BytePlus ARK (${modelId}) with prompt: "${prompt}"`
      );

      // 1. Create task
      const createResponse = await fetch(
        `${ARK_BASE_URL}/contents/generations/tasks`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${ARK_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        }
      );

      if (!createResponse.ok) {
        const text = await createResponse.text();
        throw new Error(
          `BytePlus ARK API error (${createResponse.status}): ${text}`
        );
      }

      const createData = (await createResponse.json()) as any;
      const taskId =
        createData.id || createData.task_id || createData.data?.id;
      if (!taskId) {
        throw new Error(
          `BytePlus ARK creation returned no task id: ${JSON.stringify(
            createData
          )}`
        );
      }

      console.log(`[VIDEO-GEN] BytePlus task created: ${taskId}`);

      // 2. Poll for completion. BytePlus task statuses observed:
      //    queued | running | succeeded | failed | cancelled
      const maxAttempts = 120; // ~10 minutes at 5s/poll
      let attempts = 0;
      let status = 'queued';
      let videoUrl = '';

      while (
        status !== 'succeeded' &&
        status !== 'success' &&
        status !== 'failed' &&
        status !== 'cancelled' &&
        status !== 'canceled' &&
        attempts < maxAttempts
      ) {
        await new Promise((r) => setTimeout(r, 5000));
        attempts++;

        try {
          const pollResponse = await fetch(
            `${ARK_BASE_URL}/contents/generations/tasks/${taskId}`,
            {
              method: 'GET',
              headers: {
                Authorization: `Bearer ${ARK_API_KEY}`,
                'Content-Type': 'application/json',
              },
            }
          );

          if (!pollResponse.ok) continue;

          const pollData = (await pollResponse.json()) as any;
          status = String(
            pollData.status || pollData.data?.status || ''
          ).toLowerCase();

          if (status === 'succeeded' || status === 'success') {
            // BytePlus has shipped the URL under several keys across
            // versions; check each known location before giving up.
            videoUrl =
              pollData.content?.video_url ||
              pollData.video_url ||
              pollData.output?.video_url ||
              pollData.data?.content?.video_url ||
              pollData.data?.video_url ||
              '';
            if (!videoUrl) {
              console.warn(
                '[VIDEO-GEN] BytePlus task succeeded but no video_url found in response:',
                JSON.stringify(pollData)
              );
            }
          } else if (status === 'failed') {
            const errMsg =
              pollData.error?.message ||
              pollData.data?.error?.message ||
              'Task failed during processing';
            console.error('[VIDEO-GEN] BytePlus task failed:', errMsg);
            throw new Error(errMsg);
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
        status:
          status === 'succeeded' || status === 'success' ? 'succeed' : status,
        url: videoUrl,
      };
    },
  };
}

export const seedDanceProProvider = createSeedDanceProvider(
  PRO_MODEL_ID,
  'SeedDance 2.0 (Pro)',
  'seedance-2'
);
export const seedDanceFastProvider = createSeedDanceProvider(
  FAST_MODEL_ID,
  'SeedDance 2.0 (Fast)',
  'seedance-2-fast'
);

providerRegistry.registerVideoProvider(seedDanceProProvider);
providerRegistry.registerVideoProvider(seedDanceFastProvider);
