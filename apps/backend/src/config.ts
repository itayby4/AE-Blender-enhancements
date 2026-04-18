import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import { resolveVenvPython } from '@pipefx/mcp';
import { loadSystemPrompt } from './prompts/index.js';

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
