import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import { resolveVenvPython } from '@pipefx/mcp';

dotenv.config();

const geminiRaw = process.env.GEMINI_API_KEY;
if (!geminiRaw) {
  console.error('ERROR: GEMINI_API_KEY is not set in the environment variables.');
  process.exit(1);
}

const openaiRaw = process.env.OPENAI_API_KEY;
if (!openaiRaw) {
  console.error('ERROR: OPENAI_API_KEY is not set in the environment variables.');
  process.exit(1);
}

let currentDir = __dirname;
while (!fs.existsSync(path.join(currentDir, 'nx.json')) && currentDir !== path.parse(currentDir).root) {
  currentDir = path.dirname(currentDir);
}
const workspaceRoot = currentDir;

export const config = {
  port: Number(process.env.PORT) || 3001,

  geminiApiKey: geminiRaw
    .replace(/[\u0590-\u05FF]/g, '')
    .replace(/["']/g, '')
    .trim(),

  geminiModel: process.env.GEMINI_MODEL || 'gemini-2.5-flash',

  openaiApiKey: openaiRaw
    .replace(/[\u0590-\u05FF]/g, '')
    .replace(/["']/g, '')
    .trim(),

  klingApiKey: process.env.KLING_API_KEY || 'ATpePpKM4LgHMCLprEChTJbThfDgRPkk',
  klingApiSecret: process.env.KLING_API_SECRET || '8g3NNYDd9pNfGCTfnyTtKENahdBN9MyJ',

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
          '-m',
          'mcp_davinci.server',
        ],
        cwd: path.join(workspaceRoot, 'apps', 'mcp-davinci', 'src'),
      },
    },
  },
};
