// ── @pipefx/media-gen/jobs — save generated asset to disk ───────────────
// Persists a generated image or video under `~/Desktop/RENDERS/`
// alongside a JSON sidecar (model + prompt + timestamp). Lifted from
// `apps/backend/src/api/save-render.ts` so it lives next to the dispatcher
// it pairs with.
//
// Two URL flavors come through here:
//   • `data:` URLs — base64 inline (Gemini image-gen, ElevenLabs audio).
//   • `http(s):` URLs — hosted assets (Kling video, SeedDream).
// We follow one redirect for the http path because Kling tends to issue
// a 302 to a CDN URL on the first hit.

import * as fs from 'node:fs';
import * as http from 'node:http';
import * as https from 'node:https';
import * as os from 'node:os';
import * as path from 'node:path';

import type {
  SaveRenderRequest,
  SaveRenderResponse,
} from '../contracts/types.js';

/** Default destination for generated assets. Hardcoded today (matches
 *  the legacy backend path); will move to a setting once we have a
 *  preferences surface. */
const DEFAULT_RENDERS_DIR = path.join(os.homedir(), 'Desktop', 'RENDERS');

function ensureRendersDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`[SAVE-RENDER] Created RENDERS directory at: ${dir}`);
  }
}

function generateFilename(model: string, type: 'image' | 'video'): string {
  // ISO timestamp slugified for filesystem safety; trims fractional
  // seconds + Z so two renders in the same second can still collide
  // on disk — that's fine, the second one wins (idempotent retry).
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const ext = type === 'image' ? 'png' : 'mp4';
  return `${model}_${timestamp}.${ext}`;
}

/**
 * Download a URL or write a base64 data URL to disk. One redirect hop
 * supported for the http path.
 */
async function saveMediaToFile(url: string, filePath: string): Promise<void> {
  // ── Inline base64 ──
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

  // ── HTTP / HTTPS ──
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    client
      .get(url, (response) => {
        if (response.statusCode === 301 || response.statusCode === 302) {
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

export interface SaveRenderOptions {
  /** Override the default `~/Desktop/RENDERS/` destination. */
  rendersDir?: string;
}

/**
 * Save a generated asset + sidecar metadata. Returns the on-disk path
 * and filename so the route can echo them back to the dashboard for
 * confirmation toasts / "Reveal in Finder" affordances.
 */
export async function saveRender(
  req: SaveRenderRequest,
  opts: SaveRenderOptions = {}
): Promise<SaveRenderResponse> {
  if (!req.url) throw new Error('URL is required');

  const dir = opts.rendersDir ?? DEFAULT_RENDERS_DIR;
  ensureRendersDir(dir);

  const filename = generateFilename(req.model ?? 'render', req.type ?? 'video');
  const filePath = path.join(dir, filename);

  await saveMediaToFile(req.url, filePath);

  // Sidecar JSON next to the asset. We collapse data: URLs to a marker
  // string in the metadata — the actual bytes are already saved, and a
  // multi-MB base64 string in the sidecar is wasteful + confusing.
  const metaPath = filePath + '.json';
  fs.writeFileSync(
    metaPath,
    JSON.stringify(
      {
        model: req.model,
        prompt: req.prompt,
        type: req.type,
        generatedAt: new Date().toISOString(),
        originalUrl: req.url.startsWith('data:') ? '(base64 inline)' : req.url,
      },
      null,
      2
    )
  );

  console.log(`[SAVE-RENDER] Render saved: ${filename}`);

  return { saved: true, filePath, filename };
}
