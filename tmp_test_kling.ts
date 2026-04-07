import * as jwt from 'jsonwebtoken';

const apiKey = 'AbKCaR8KbRaf4yCDBnLDdebtDYMgCQKg';
const apiSecret = 'BfmtpRhtYmNRtL4rd9Hb8dg99D3nYgrE';

function generateKlingToken(): string {
  const payload = {
    iss: apiKey,
    exp: Math.floor(Date.now() / 1000) + 1800,
    nbf: Math.floor(Date.now() / 1000) - 5
  };
  return jwt.sign(payload, apiSecret, { algorithm: 'HS256', header: { alg: 'HS256', typ: 'JWT' } });
}

async function run() {
  const token = generateKlingToken();
  const endpoint = 'https://api-singapore.klingai.com/v1/videos/text2video';

  const testPayloads = [
    {
       prompt: "A beautiful scenery",
       model_name: "kling-v3",
       duration: "10",
       mode: "std"
    },
    {
       prompt: "A beautiful scenery",
       model_name: "kling-v3",
       duration: "15",
       mode: "pro"
    },
    {
       prompt: "A beautiful scenery",
       model_name: "kling-v3",
       duration: 10,
       mode: "std"
    }
  ];

  for (let i = 0; i < testPayloads.length; i++) {
     const p = testPayloads[i];
     console.log(`\nTesting payload ${i}:`, JSON.stringify(p));
     const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(p)
     });
     
     const text = await res.text();
     console.log(`Response ${i}: ${res.status} - ${text}`);
  }
}

run().catch(console.error);
