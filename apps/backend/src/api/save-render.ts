import type { IncomingMessage, ServerResponse } from 'http';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as https from 'https';
import * as http from 'http';

const RENDERS_DIR = path.join(os.homedir(), 'Desktop', 'RENDERS');

function ensureRendersDir() {
  if (!fs.existsSync(RENDERS_DIR)) {
    fs.mkdirSync(RENDERS_DIR, { recursive: true });
    console.log(`[SAVE-RENDER] Created RENDERS directory at: ${RENDERS_DIR}`);
  }
}

function generateFilename(model: string, type: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const ext = type === 'image' ? 'png' : 'mp4';
  return `${model}_${timestamp}.${ext}`;
}

/**
 * Downloads a URL or saves a base64 data URL to a local file.
 */
async function saveMediaToFile(url: string, filePath: string): Promise<void> {
  // Handle base64 data URLs (from Gemini image generation)
  if (url.startsWith('data:')) {
    const match = url.match(/^data:[^;]+;base64,(.+)$/s);
    if (!match) throw new Error('Invalid data URL format');
    const buffer = Buffer.from(match[1], 'base64');
    fs.writeFileSync(filePath, buffer);
    console.log(
      `[SAVE-RENDER] Saved base64 data to: ${filePath} (${Math.round(
        buffer.length / 1024
      )}KB)`
    );
    return;
  }

  // Handle HTTP/HTTPS URLs (from Kling video generation)
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    client
      .get(url, (response) => {
        if (response.statusCode === 301 || response.statusCode === 302) {
          // Follow redirect
          const redirectUrl = response.headers.location;
          if (redirectUrl) {
            saveMediaToFile(redirectUrl, filePath).then(resolve).catch(reject);
            return;
          }
        }

        if (response.statusCode !== 200) {
          reject(new Error(`HTTP ${response.statusCode} downloading media`));
          return;
        }

        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => {
          const buffer = Buffer.concat(chunks);
          fs.writeFileSync(filePath, buffer);
          console.log(
            `[SAVE-RENDER] Downloaded and saved to: ${filePath} (${Math.round(
              buffer.length / 1024
            )}KB)`
          );
          resolve();
        });
        response.on('error', reject);
      })
      .on('error', reject);
  });
}

export async function handleSaveRenderRequest(
  req: IncomingMessage,
  res: ServerResponse
) {
  let body = '';
  req.on('data', (chunk: Buffer) => {
    body += chunk.toString();
  });

  req.on('end', async () => {
    try {
      const { url, type, model, prompt } = JSON.parse(body);

      if (!url) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'URL is required' }));
        return;
      }

      ensureRendersDir();

      const filename = generateFilename(model || 'render', type || 'video');
      const filePath = path.join(RENDERS_DIR, filename);

      await saveMediaToFile(url, filePath);

      // Save metadata as a sidecar JSON
      const metaPath = filePath + '.json';
      fs.writeFileSync(
        metaPath,
        JSON.stringify(
          {
            model,
            prompt,
            type,
            generatedAt: new Date().toISOString(),
            originalUrl: url.startsWith('data:') ? '(base64 inline)' : url,
          },
          null,
          2
        )
      );

      console.log(`[SAVE-RENDER] Render saved: ${filename}`);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ saved: true, filePath, filename }));
    } catch (err: unknown) {
      console.error('[SAVE-RENDER] Error:', err);
      const msg = err instanceof Error ? err.message : String(err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: msg }));
    }
  });
}
