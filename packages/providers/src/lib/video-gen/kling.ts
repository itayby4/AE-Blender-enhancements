import jwt from 'jsonwebtoken';
import { VideoProvider, VideoOptions } from './types.js';
import { providerRegistry } from '../registry.js';

function generateKlingToken(): string {
  const apiKey = process.env.KLING_API_KEY;
  const apiSecret = process.env.KLING_API_SECRET;
  if (!apiKey || !apiSecret) {
    throw new Error('KLING_API_KEY or KLING_API_SECRET missing');
  }
  const payload = {
    iss: apiKey,
    exp: Math.floor(Date.now() / 1000) + 1800, // Valid for 30 minutes
    nbf: Math.floor(Date.now() / 1000) - 5,
  };
  return jwt.sign(payload, apiSecret, {
    algorithm: 'HS256',
    header: { alg: 'HS256', typ: 'JWT' },
  });
}

export const klingProvider: VideoProvider = {
  id: 'kling3',
  name: 'Kling 3.0',
  category: 'video-gen',

  async generate(
    prompt: string,
    options?: VideoOptions
  ): Promise<{ id: string; status: string; url?: string }> {
    const {
      imageRef,
      imageTailRef,
      duration = '5',
      resolution = '720p',
      aspectRatio = '16:9',
    } = options || {};
    console.log(`[VIDEO-GEN] Calling Kling 3.0 API with prompt: "${prompt}"`);

    const token = generateKlingToken();
    const requestBody: any = {
      prompt: prompt,
      model_name: 'kling-v3', // Updated to Kling V3
      duration: duration ? duration.toString() : '5',
      mode: resolution === '1080p' ? 'pro' : 'std',
    };

    let isImage2Video = false;

    if (imageRef) {
      if (imageRef.startsWith('http') || imageRef.startsWith('https')) {
        requestBody.image = imageRef;
      } else {
        const base64Data = imageRef.includes('base64,')
          ? imageRef.split('base64,')[1]
          : imageRef;
        requestBody.image = base64Data;
      }
      isImage2Video = true;
    }

    if (imageTailRef) {
      if (imageTailRef.startsWith('http') || imageTailRef.startsWith('https')) {
        requestBody.image_tail = imageTailRef;
      } else {
        const base64DataTail = imageTailRef.includes('base64,')
          ? imageTailRef.split('base64,')[1]
          : imageTailRef;
        requestBody.image_tail = base64DataTail;
      }
      isImage2Video = true;
    }

    if (!isImage2Video) {
      requestBody.aspect_ratio = aspectRatio;
    }

    const endpoint = isImage2Video
      ? 'https://api-singapore.klingai.com/v1/videos/image2video'
      : 'https://api-singapore.klingai.com/v1/videos/text2video';

    // בקשה ליצירת הוידאו
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Kling API Error (${response.status}): ${errText}`);
    }

    const data = (await response.json()) as any;

    if (data.code !== 0) {
      throw new Error(
        `Kling API Error ${data.code}: ${data.message || JSON.stringify(data)}`
      );
    }

    const taskId = data.data?.task_id || `kling-${Date.now()}`;
    let status = data.data?.task_status || 'submitted';
    let videoUrl = '';

    // Polling loop to wait for video generation
    let attempts = 0;
    while (status !== 'succeed' && status !== 'failed' && attempts < 60) {
      console.log(`[VIDEO-GEN] Polling task ${taskId}... Attempt ${attempts}`);
      await new Promise((r) => setTimeout(r, 5000)); // wait 5 seconds

      // Generate fresh token just in case
      const pollToken = generateKlingToken();
      const pollEndpoint = isImage2Video
        ? `https://api-singapore.klingai.com/v1/videos/image2video/${taskId}`
        : `https://api-singapore.klingai.com/v1/videos/text2video/${taskId}`;

      const pollResponse = await fetch(pollEndpoint, {
        method: 'GET',
        headers: { Authorization: `Bearer ${pollToken}` },
      });

      if (pollResponse.ok) {
        const pollData = (await pollResponse.json()) as any;
        status = pollData.data?.task_status || status;

        if (status === 'succeed') {
          const results = pollData.data?.task_result?.videos;
          videoUrl =
            results && results.length > 0
              ? results[0].url
              : pollData.data?.task_result?.video_url;
        }
      }
      attempts++;
    }

    return {
      id: taskId,
      status: status,
      url: videoUrl || '',
    };
  },
};

providerRegistry.registerVideoProvider(klingProvider);
