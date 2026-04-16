import type { Router } from '../router.js';
import type { Agent } from '@pipefx/ai';
import type { ConnectorRegistry } from '@pipefx/mcp';
import { readBody, jsonResponse, jsonError } from '../router.js';
import { config, updateConfig } from '../config.js';
import { loadSettings, saveSettings } from '../utils/settings.js';
import { createSubtitleHandler } from '../api/subtitles.js';
import { createAudioSyncHandler } from '../api/audio-sync.js';
import { handleAiModelRequest } from '../api/ai-models/router.js';
import { handleSaveRenderRequest } from '../api/save-render.js';
import { getTimelineInfoWorkflow, autopodWorkflow } from '../workflows/index.js';
import { createAgent } from '@pipefx/ai';
import { GoogleGenAI } from '@google/genai';
import { OpenAI } from 'openai';

/**
 * Registers settings, switch-app, subtitles, autopod, ai-models, and save-render routes.
 */
export function registerMiscRoutes(
  router: Router,
  deps: {
    registry: ConnectorRegistry;
    setAgent: (a: Agent) => void;
    getWorkflowContext: () => { registry: ConnectorRegistry; ai: any; openai: any };
    setWorkflowContext: (ctx: { registry: ConnectorRegistry; ai: any; openai: any }) => void;
    getSubtitleHandler: () => (req: any, res: any) => void;
    setSubtitleHandler: (h: (req: any, res: any) => void) => void;
  }
) {
  // GET /api/settings
  router.get('/api/settings', async (_req, res) => {
    const currentSettings = await loadSettings();
    jsonResponse(res, currentSettings);
  });

  // POST /api/settings
  router.post('/api/settings', async (req, res) => {
    try {
      const body = await readBody(req);
      const newSettings = JSON.parse(body);
      await saveSettings(newSettings);
      updateConfig(newSettings);

      const newCtx = {
        registry: deps.registry,
        ai: new GoogleGenAI({ apiKey: config.geminiApiKey }),
        openai: new OpenAI({ apiKey: config.openaiApiKey }),
      };
      deps.setWorkflowContext(newCtx);

      deps.setSubtitleHandler(
        createSubtitleHandler(deps.registry, newCtx)
      );

      deps.setAgent(
        createAgent({
          model: config.geminiModel,
          apiKey: config.geminiApiKey,
          openaiApiKey: config.openaiApiKey,
          anthropicApiKey: config.anthropicApiKey,
          systemPrompt: config.systemPrompt,
          registry: deps.registry,
        })
      );

      console.log('[Settings] Hot-Reloaded AI agent successfully');
      jsonResponse(res, { success: true });
    } catch (err) {
      jsonError(res, err);
    }
  });

  // POST /api/switch-app
  router.post('/api/switch-app', async (req, res) => {
    try {
      const body = await readBody(req);
      const { activeApp } = JSON.parse(body);
      if (activeApp) {
        await deps.registry.switchActiveConnector(activeApp);
      }
      jsonResponse(res, { success: true });
    } catch (err) {
      jsonError(res, err);
    }
  });

  // POST /api/ai-models
  router.post('/api/ai-models', (req, res) => {
    handleAiModelRequest(req, res);
  });

  // POST /api/save-render
  router.post('/api/save-render', (req, res) => {
    handleSaveRenderRequest(req, res);
  });

  // POST /api/subtitles/generate
  router.post('/api/subtitles/generate', (req, res) => {
    deps.getSubtitleHandler()(req, res);
  });

  // POST /api/audio-sync/run
  router.post('/api/audio-sync/run', (req, res) => {
    const handler = createAudioSyncHandler(deps.getWorkflowContext());
    handler(req, res);
  });

  // POST /api/autopod/discover
  router.post('/api/autopod/discover', async (req, res) => {
    try {
      const body = await readBody(req);
      const { app_target } = JSON.parse(body);
      if (app_target) {
        await deps.registry.switchActiveConnector(app_target);
      }
      await deps.registry.getAllTools();
      const result = await getTimelineInfoWorkflow.execute(
        { app_target: app_target || 'premiere' },
        deps.getWorkflowContext()
      );
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(result);
    } catch (err) {
      jsonError(res, err);
    }
  });

  // POST /api/autopod/run
  router.post('/api/autopod/run', async (req, res) => {
    try {
      const body = await readBody(req);
      const { app_target, mapping_json, fallback, use_generative } =
        JSON.parse(body);
      if (app_target) {
        await deps.registry.switchActiveConnector(app_target);
      }
      await deps.registry.getAllTools();
      const result = await autopodWorkflow.execute(
        {
          app_target: app_target || 'premiere',
          mapping_json,
          fallback,
          use_generative,
        },
        deps.getWorkflowContext()
      );
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(result);
    } catch (err) {
      console.error('[AUTOPOD API] Error:', err);
      jsonError(res, err);
    }
  });
}
