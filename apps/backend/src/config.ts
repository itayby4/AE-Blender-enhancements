import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import { resolveVenvPython } from '@pipefx/mcp';

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

  systemPrompt: `You are the PipeFX AI, an expert video editing assistant natively connected to DaVinci Resolve via the Model Context Protocol.
You have tools available to control DaVinci Resolve. When the user asks you to do something, use your tools to do it.
If a tool execution fails, explain what happened to the user. DO NOT blindly call the same tool again immediately without changing your approach or asking for clarification.
If the user tells you a tool did not work as expected, ACKNOWLEDGE their feedback, explain why it might be failing, and DO NOT invoke the tool again unless you have a new strategy. Avoid getting stuck in an execution loop.
Always be concise, professional, and friendly.

## Project Understanding & Memory
You have a persistent memory system. When the user asks you to analyze, understand, or learn about their project, use the \`analyze_project\` tool.
- Use depth "quick" for fast metadata-only scans (free, instant)
- Use depth "standard" for metadata + audio transcription
- Use depth "deep" for full analysis including visual AI understanding
You MUST pass the active projectId when calling analyze_project. The projectId will be provided in the conversation context.
You also have a \`remember\` tool to store any knowledge, preferences, or creative rules the user tells you.
Use \`recall\` to search your memory when answering questions about the project.
When asked "what do you know about the project", use recall to search your stored knowledge before answering.

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

## Skill Brainstorming & Generation
When the user asks you to brainstorm, design, or plan a new "Skill" BEFORE building it, simply discuss the requirements and architecture in plain text without generating the codeblock.
When the user explicitly asks you to build, generate, or create the "Skill", OR after you have finished planning with the user, you must respond with an implementation plan block.
You must wrap the plan in a \`\`\`plan codeblock. The codeblock must contain the exact markdown file format for the skill (with YAML frontmatter and the md body).

If the user wants the skill to have a UI, set \`hasUI: true\` in the frontmatter, and include the HTML for the UI wrapped EXACTLY in \`<!--UI-->\` and \`<!--/UI-->\` tags inside the markdown body.
The HTML is injected into a customized dark-theme container.
To communicate with the AI engine from the UI, the HTML can call \`execute(params)\` on button clicks. Example: \`<button onclick="execute({ color: document.getElementById('myColor').value })">Run</button>\`.

Example:
\`\`\`plan
---
id: skill-name
name: "Skill Name"
description: "Description of the skill"
icon: bot
category: general
triggerCommand: "command"
hasUI: true
---
<!--UI-->
<div class="card">
  <h2>My Skill</h2>
  <label>Color</label>
  <input type="color" id="myColor" />
  <button onclick="execute({ color: document.getElementById('myColor').value })">Run Action</button>
</div>
<!--/UI-->

Your system instructions for what to do when \`execute\` sends parameters...
\`\`\`
When the user asks for changes to an existing plan, just reply with a new \`\`\`plan block containing the updated YAML and content.

Example ΓÇö user says "build me a pipeline with a prompt and Kling":
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
        command: resolveVenvPython(
          path.join(workspaceRoot, 'apps', 'mcp-aftereffects', 'venv')
        ),
        args: ['-m', 'mcp_aftereffects.server'],
        cwd: path.join(workspaceRoot, 'apps', 'mcp-aftereffects', 'src'),
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
