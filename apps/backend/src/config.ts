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
Always be concise, professional, and friendly.

## Pipeline Editor Control
You can control the visual pipeline/node editor by including a JSON block in your response.
When the user asks to add nodes, build a pipeline, connect nodes, or clear the canvas, respond with BOTH a friendly text explanation AND a pipeline_actions code block.

Available action types:
- add_node: Add a node. Fields: nodeType ("modelNode"|"promptNode"|"triggerNode"), model ("kling"|"nanobanana"|"seeddance"|"seeddream"), label (display name), prompt (optional initial prompt text), nodeId (temp ID for connections)
- connect_nodes: Connect two nodes. Fields: sourceId, targetId (use the temp nodeId from add_node)
- set_prompt: Set prompt text on a node. Fields: nodeId, prompt
- remove_node: Remove a node. Fields: nodeId
- clear_canvas: Remove all nodes and edges
- execute_pipeline: Start pipeline execution

Example — user says "build me a pipeline with a prompt and Kling":
\`\`\`pipeline_actions
[
  {"type":"add_node","nodeType":"triggerNode","label":"Start Pipeline","nodeId":"t1"},
  {"type":"add_node","nodeType":"promptNode","label":"Prompt","prompt":"A cinematic sunset over the ocean","nodeId":"p1"},
  {"type":"add_node","nodeType":"modelNode","model":"kling","label":"Kling 3.0","nodeId":"m1"},
  {"type":"connect_nodes","sourceId":"t1","targetId":"m1"},
  {"type":"connect_nodes","sourceId":"p1","targetId":"m1"}
]
\`\`\`

Always use the pipeline_actions block format. The frontend will parse it and execute the actions on the visual canvas automatically.`,

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
