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
  registerLocalWorkflows(registry, {
    geminiApiKey: config.geminiApiKey,
    openaiApiKey: config.openaiApiKey,
  });

  await registry.connectAll();

  const agent = createAgent({
    model: config.geminiModel,
    apiKey: config.geminiApiKey,
    openaiApiKey: config.openaiApiKey,
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
          const { message, skill, history } = JSON.parse(body);
          if (!message) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Message is required' }));
            return;
          }

          const text = await agent.chat(message, {
            modelOverride: skill?.model,
            systemPromptOverride: skill?.systemInstruction,
            allowedTools: skill?.allowedTools,
            history: history,
          });

          // Extract pipeline actions from AI response if present
          let cleanText = text;
          let actions: any[] = [];
          const actionBlockRegex = /```pipeline_actions\s*\n([\s\S]*?)\n```/g;
          let match;
          while ((match = actionBlockRegex.exec(text)) !== null) {
            try {
              const parsed = JSON.parse(match[1]);
              if (Array.isArray(parsed)) actions.push(...parsed);
            } catch (e) {
              console.warn('[CHAT] Failed to parse pipeline actions block:', e);
            }
            cleanText = cleanText.replace(match[0], '').trim();
          }

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ text: cleanText, actions }));
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
