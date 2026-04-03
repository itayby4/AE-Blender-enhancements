import jwt from 'jsonwebtoken';

function generateKlingToken(): string {
  const apiKey = process.env.KLING_API_KEY;
  const apiSecret = process.env.KLING_API_SECRET;
  if (!apiKey || !apiSecret) {
    throw new Error('KLING_API_KEY or KLING_API_SECRET missing');
  }
  const payload = {
    iss: apiKey,
    exp: Math.floor(Date.now() / 1000) + 1800, // Valid for 30 minutes
    nbf: Math.floor(Date.now() / 1000) - 5
  };
  return jwt.sign(payload, apiSecret, { algorithm: 'HS256', header: { alg: 'HS256', typ: 'JWT' } });
}

export async function generateWithKling(prompt: string, imageRef?: string, duration: string = '5', resolution: string = '720p', aspectRatio: string = '16:9'): Promise<{ url?: string; status: string; id: string }> {
  console.log(`[VIDEO-GEN] Calling Kling 3.0 API with prompt: "${prompt}"`);
  
  const token = generateKlingToken();
  const requestBody: any = {
    prompt: prompt,
    model_name: 'kling-v3', // Updated to Kling V3
    duration: parseFloat(duration) || 5,
    mode: resolution === '1080p' ? 'pro' : 'std',
    aspect_ratio: aspectRatio,
  };
  
  if (imageRef) {
    // Strip "data:image/jpeg;base64," or similar prefixes, since the Kling API requires raw base64 string
    const base64Data = imageRef.split(',')[1] || imageRef;
    requestBody.image = base64Data;
  }
  
  const endpoint = imageRef 
    ? 'https://api-singapore.klingai.com/v1/videos/image2video'
    : 'https://api-singapore.klingai.com/v1/videos/text2video';

  // בקשה ליצירת הוידאו
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Kling API Error (${response.status}): ${errText}`);
  }

  const data = (await response.json()) as any;
  
  const taskId = data.data?.task_id || `kling-${Date.now()}`;
  let status = data.data?.task_status || 'submitted';
  let videoUrl = '';
  
  // Polling loop to wait for video generation
  let attempts = 0;
  while (status !== 'succeed' && status !== 'failed' && attempts < 60) {
    console.log(`[VIDEO-GEN] Polling task ${taskId}... Attempt ${attempts}`);
    await new Promise(r => setTimeout(r, 5000)); // wait 5 seconds
    
    // Generate fresh token just in case
    const pollToken = generateKlingToken();
    const pollEndpoint = imageRef
      ? `https://api-singapore.klingai.com/v1/videos/image2video/${taskId}`
      : `https://api-singapore.klingai.com/v1/videos/text2video/${taskId}`;
      
    const pollResponse = await fetch(pollEndpoint, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${pollToken}` }
    });
    
    if (pollResponse.ok) {
      const pollData = (await pollResponse.json()) as any;
      status = pollData.data?.task_status || status;
      
      if (status === 'succeed') {
        const results = pollData.data?.task_result?.videos;
        videoUrl = results && results.length > 0 ? results[0].url : pollData.data?.task_result?.video_url;
      }
    }
    attempts++;
  }
  
  return {
    id: taskId,
    status: status,
    url: videoUrl || ''
  };
}
