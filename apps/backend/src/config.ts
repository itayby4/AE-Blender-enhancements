import * as dotenv from 'dotenv';
import * as path from 'path';
import { resolveVenvPython } from '@pipefx/mcp';

dotenv.config();

const rawKey = process.env.GEMINI_API_KEY;
if (!rawKey) {
  console.error('ERROR: GEMINI_API_KEY is not set in the environment variables.');
  process.exit(1);
}

const workspaceRoot = process.cwd();

export const config = {
  port: Number(process.env.PORT) || 3001,

  geminiApiKey: rawKey
    .replace(/[\u0590-\u05FF]/g, '')
    .replace(/["']/g, '')
    .trim(),

  geminiModel: process.env.GEMINI_MODEL || 'gemini-2.5-flash',

  systemPrompt: `You are the PipeFX AI, an expert video editing assistant natively connected to DaVinci Resolve via the Model Context Protocol.
You have tools available to control DaVinci Resolve. When the user asks you to do something, use your tools to do it.
If a tool execution fails, explain what happened to the user.
Always be concise, professional, and friendly.`,

  connectors: {
    resolve: {
      id: 'resolve' as const,
      name: 'DaVinci Resolve',
      transport: {
        type: 'stdio' as const,
        command: resolveVenvPython(
          path.join(workspaceRoot, 'apps', 'mcp-davinci', 'venv')
        ),
        args: [
          path.join(
            workspaceRoot,
            'apps',
            'mcp-davinci',
            'src',
            'mcp_davinci',
            'server.py'
          ),
        ],
      },
    },
  },
};
