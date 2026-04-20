import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import { resolveVenvPython } from '@pipefx/mcp';
import type { ToolResult } from '@pipefx/mcp';
import { loadSystemPrompt } from './prompts/index.js';

/**
 * Extract text from an MCP tool-result content. MCP returns content as an
 * array of blocks (text | image | ...) — we flatten the text so the AE
 * async policy predicates can regex-match on the combined message.
 */
function extractText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .filter(
        (c): c is { type: string; text: string } =>
          !!c && typeof c === 'object' && (c as { type?: string }).type === 'text'
      )
      .map((c) => c.text)
      .join('\n');
  }
  return '';
}

// Resolve workspace root first so we can find the correct .env
let currentDir = __dirname;
while (
  !fs.existsSync(path.join(currentDir, 'nx.json')) &&
  currentDir !== path.parse(currentDir).root
) {
  currentDir = path.dirname(currentDir);
}
const workspaceRoot = currentDir;

// Load .env from apps/backend/.env (CWD is workspace root, not apps/backend)
dotenv.config({ path: path.join(workspaceRoot, 'apps', 'backend', '.env') });

const geminiRaw = process.env.GEMINI_API_KEY || '';
const openaiRaw = process.env.OPENAI_API_KEY || '';
const anthropicRaw = process.env.ANTHROPIC_API_KEY || '';

export let config = {
  workspaceRoot,
  port: Number(process.env.PORT) || 3001,

  geminiApiKey: geminiRaw
    .replace(/[\u0590-\u05FF]/g, '')
    .replace(/["']/g, '')
    .trim(),
  geminiModel: process.env.GEMINI_MODEL || 'gemini-3.1-pro-preview',

  openaiApiKey: openaiRaw
    .replace(/[\u0590-\u05FF]/g, '')
    .replace(/["']/g, '')
    .trim(),

  anthropicApiKey: anthropicRaw
    ? anthropicRaw
        .replace(/[\u0590-\u05FF]/g, '')
        .replace(/["']/g, '')
        .trim()
    : undefined,

  klingApiKey: process.env.KLING_API_KEY || '',
  klingApiSecret: process.env.KLING_API_SECRET || '',

  // ── Supabase Auth (auth-only, no data storage in Supabase) ──
  supabaseUrl: process.env.SUPABASE_URL || '',
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY || '',
  supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',

  systemPrompt: loadSystemPrompt(workspaceRoot),

  connectors: {
    resolve: {
      id: 'resolve' as const,
      name: 'DaVinci Resolve',
      transport: {
        type: 'stdio' as const,
        command: resolveVenvPython(
          path.join(workspaceRoot, 'apps', 'mcp-davinci', 'venv')
        ),
        args: ['-m', 'mcp_davinci.server'],
        cwd: path.join(workspaceRoot, 'apps', 'mcp-davinci', 'src'),
      },
    },
    premiere: {
      id: 'premiere' as const,
      name: 'Adobe Premiere Pro',
      transport: {
        type: 'stdio' as const,
        command: resolveVenvPython(
          path.join(workspaceRoot, 'apps', 'mcp-premiere', 'venv')
        ),
        args: ['-m', 'mcp_premiere.server'],
        cwd: path.join(workspaceRoot, 'apps', 'mcp-premiere', 'src'),
      },
    },
    aftereffects: {
      id: 'aftereffects' as const,
      name: 'Adobe After Effects',
      transport: {
        type: 'stdio' as const,
        command: process.execPath,
        args: [
          path.join(
            workspaceRoot,
            'apps',
            'mcp-aftereffects',
            'build',
            'index.js'
          ),
        ],
        cwd: path.join(workspaceRoot, 'apps', 'mcp-aftereffects'),
      },
      // The AE MCP server is fire-and-forget: most tools return
      // "command queued, use get-results after a few seconds". The
      // registry transparently polls get-results so the agent sees a
      // synchronous call with the real result. This is what eliminates
      // the 4-duplicate-composition bug by construction.
      asyncPolicy: {
        pollToolName: 'get-results',
        skipTools: ['get-results', 'get-help', 'get-running-scripts'],
        isQueued: (result: ToolResult) => {
          const text = extractText(result.content);
          if (!text) return false;
          return /queued|please ensure|use the "get-results"/i.test(text);
        },
        // get-results returns JSON strings. These patterns all mean
        // "nothing fresh to see yet" — keep polling. Everything else
        // (a real ExtendScript result payload) counts as ready.
        isReady: (result: ToolResult) => {
          const text = extractText(result.content);
          if (!text) return true;
          return !/no results file found|no results available|result file appears to be stale|pending|processing|please run a script/i.test(
            text
          );
        },
        // Snapshot the result buffer before dispatching so we can tell a
        // fresh response apart from the leftover JSON of a previous
        // command — this is what stops the "stale-data looks like
        // success" failure mode that created duplicate comps.
        captureBaseline: true,
        pollIntervalMs: 400,
        pollDeadlineMs: 45_000,
        idempotencyTtlMs: 15_000,
      },
    },
    blender: {
      id: 'blender' as const,
      name: 'Blender',
      transport: {
        type: 'stdio' as const,
        command: resolveVenvPython(
          path.join(workspaceRoot, 'apps', 'mcp-blender', 'venv')
        ),
        args: ['-m', 'mcp_blender.server'],
        cwd: path.join(workspaceRoot, 'apps', 'mcp-blender', 'src'),
      },
    },
    ableton: {
      id: 'ableton' as const,
      name: 'Ableton Live',
      transport: {
        type: 'stdio' as const,
        command: resolveVenvPython(
          path.join(workspaceRoot, 'apps', 'mcp-ableton', 'venv')
        ),
        args: ['-m', 'mcp_ableton.server'],
        cwd: path.join(workspaceRoot, 'apps', 'mcp-ableton', 'src'),
      },
    },
  },
};

export function updateConfig(newSettings: Record<string, any>) {
  config = { ...config, ...newSettings };
}
