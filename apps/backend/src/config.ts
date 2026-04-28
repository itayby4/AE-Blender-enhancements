import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import { resolveVenvPython } from '@pipefx/mcp-transport';
import { loadSystemPrompt, loadLegacySections } from './prompts/index.js';

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

  // ── Cloud Mode (dynamically set via settings) ──
  apiMode: 'byok' as 'byok' | 'cloud',
  cloudApiUrl: '',
  deviceToken: '',

  systemPrompt: loadSystemPrompt(workspaceRoot),
  // Legacy md content (memory + pipeline_actions + skills) that the
  // per-turn composer threads in as a cached section. core.md is
  // superseded by the identity/tasks/tone/planning sections in
  // prompts/library.ts.
  systemPromptLegacy: loadLegacySections(workspaceRoot),

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
      // The AE MCP runs as a UXP panel inside After Effects, exposing an
      // MCP server over HTTP/SSE on localhost:7891. The panel must be
      // installed (sideloaded via UDT for now; signed .ccx later) and
      // After Effects must be running with the panel open.
      //
      // Connection state == TCP state: if the SSE stream drops, the panel
      // is closed or AE has quit. Surfaces directly through the existing
      // ConnectorStatus widget — no health-check polling required.
      transport: {
        type: 'sse' as const,
        url: 'http://127.0.0.1:7891/sse',
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

export type AppConfig = typeof config;

export function updateConfig(newSettings: Partial<AppConfig>) {
  config = { ...config, ...newSettings };
}
