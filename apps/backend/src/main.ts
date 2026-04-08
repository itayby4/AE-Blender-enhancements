import { ConnectorRegistry } from '@pipefx/mcp';
import { createAgent } from '@pipefx/ai';
import { createServer } from 'http';
import { config } from './config.js';
import { registerLocalWorkflows } from './workflows/index.js';
import { handleAiModelRequest } from './api/ai-models/router.js';
import { handleSaveRenderRequest } from './api/save-render.js';

async function main() {
  console.log('Starting PipeFX AI Engine...');

  const registry = new ConnectorRegistry();
  registry.register(config.connectors.resolve);
  if (config.connectors.premiere) registry.register(config.connectors.premiere);
  if (config.connectors.aftereffects) registry.register(config.connectors.aftereffects);
  if (config.connectors.blender) registry.register(config.connectors.blender);
  if (config.connectors.ableton) registry.register(config.connectors.ableton);
  registerLocalWorkflows(registry, {
    geminiApiKey: config.geminiApiKey,
    openaiApiKey: config.openaiApiKey,
  });

  await registry.switchActiveConnector('resolve');

  const agent = createAgent({
    model: config.geminiModel,
    apiKey: config.geminiApiKey,
    openaiApiKey: config.openaiApiKey,
    anthropicApiKey: config.anthropicApiKey,
    systemPrompt: config.systemPrompt,
    registry,
  });

  const server = createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'OPTIONS, POST');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    if (req.method === 'POST' && req.url === '/chat') {
      let body = '';
      req.on('data', (chunk: Buffer) => {
        body += chunk.toString();
      });

      req.on('end', async () => {
        try {
          const { message, skill, history, llmModel, activeApp } = JSON.parse(body);
          if (!message) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Message is required' }));
            return;
          }

          let systemPromptOverride = skill?.systemInstruction;
          if (!systemPromptOverride && activeApp) {
            const appNames: Record<string, string> = {
               'resolve': 'DaVinci Resolve',
               'premiere': 'Adobe Premiere Pro',
               'aftereffects': 'Adobe After Effects',
               'blender': 'Blender',
               'ableton': 'Ableton Live'
            };
            const appName = appNames[activeApp] || 'the Video Editing Software';
            systemPromptOverride = config.systemPrompt.replace(/DaVinci Resolve/g, appName);
          }

          const text = await agent.chat(message, {
            providerOverride: llmModel,
            modelOverride: skill?.model,
            systemPromptOverride: systemPromptOverride,
            allowedTools: skill?.allowedTools,
            history: history,
          });

          // Extract pipeline actions from AI response if present
          let cleanText = text;
          let actions: any[] = [];
          
          // First, try to extract from markdown blocks
          const actionBlockRegex = /```(?:pipeline_actions|json)?\s*\n([\s\S]*?)```/g;
          let match;
          while ((match = actionBlockRegex.exec(text)) !== null) {
            try {
              // Strip JS-style line comments (//) and trailing commas
              const jsonString = match[1].replace(/^\s*\/\/.*$/gm, '').replace(/,\s*([\]}])/g, '$1');
              const parsed = JSON.parse(jsonString);
              if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].type) {
                actions.push(...parsed);
                cleanText = cleanText.replace(match[0], '').trim();
              }
            } catch (e) {
              // Ignore block parse errors
            }
          }

          // Fallback: search for a JSON array natively in the raw text if no blocks matched
          if (actions.length === 0) {
            try {
              const jsonString = text.replace(/^\s*\/\/.*$/gm, '').replace(/,\s*([\]}])/g, '$1');
              const arrStart = jsonString.indexOf('[');
              const arrEnd = jsonString.lastIndexOf(']');
              if (arrStart !== -1 && arrEnd !== -1 && arrEnd > arrStart) {
                const parsed = JSON.parse(jsonString.substring(arrStart, arrEnd + 1));
                if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].type) {
                  actions.push(...parsed);
                  cleanText = cleanText.replace(text.substring(arrStart, arrEnd + 1), '').trim();
                }
              }
            } catch (e) {
              console.warn('[CHAT] Fallback raw JSON parse failed:', e);
            }
          }

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ text: cleanText, actions }));
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: msg }));
        }
      });
    } else if (req.method === 'POST' && req.url === '/api/switch-app') {
      let body = '';
      req.on('data', (chunk: Buffer) => {
        body += chunk.toString();
      });
      req.on('end', async () => {
        try {
          const { activeApp } = JSON.parse(body);
          if (activeApp) {
            await registry.switchActiveConnector(activeApp);
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true }));
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: msg }));
        }
      });
    } else if (req.method === 'POST' && req.url === '/api/ai-models') {
      handleAiModelRequest(req, res);
    } else if (req.method === 'POST' && req.url === '/api/save-render') {
      handleSaveRenderRequest(req, res);
    } else {
      res.writeHead(404);
      res.end();
    }
  });

  server.listen(config.port, () => {
    console.log(
      `\nBackend HTTP server is listening on http://localhost:${config.port}`
    );
    console.log('Ready to receive commands from PipeFX Desktop!');
  });
}

main().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
