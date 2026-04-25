import type { Router } from '../router.js';
import type { Agent } from '@pipefx/agent-loop-kernel';
import type { ConnectorRegistry } from '@pipefx/connectors';
import {
  createLocalToolContext,
  type LocalToolContext,
} from '@pipefx/post-production/workflows';
import { readBody, jsonResponse, jsonError } from '../router.js';
import { config, updateConfig } from '../config.js';
import { loadSettings, saveSettings } from '../utils/settings.js';
import { handleAiModelRequest } from '../api/ai-models/router.js';
import { handleSaveRenderRequest } from '../api/save-render.js';
import { createAgent } from '@pipefx/brain-loop';

/**
 * Settings + connector + AI-models + save-render routes.
 *
 * Phase 9.3: the workflow HTTP routes (subtitles/audio-sync/autopod) used
 * to live here too; they moved into `mountWorkflowRoutes` from
 * `@pipefx/post-production/backend`. This file is now strictly about
 * cross-cutting backend concerns — settings reload, app switch, AI model
 * dispatch, file save — none of which are workflow-specific.
 */
export function registerMiscRoutes(
  router: Router,
  deps: {
    registry: ConnectorRegistry;
    setAgent: (a: Agent) => void;
    getWorkflowContext: () => LocalToolContext;
    setWorkflowContext: (ctx: LocalToolContext) => void;
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

      // Hot-rebuild the workflow context so freshly-saved API keys take
      // effect on the next request without a server restart. The closure
      // mounted in `mountWorkflowRoutes` reads the context via
      // `getContext()`, so swapping it here propagates automatically.
      deps.setWorkflowContext(
        createLocalToolContext(deps.registry, {
          geminiApiKey: config.geminiApiKey,
          openaiApiKey: config.openaiApiKey,
        })
      );

      // Resolve cloud config if user is in cloud mode
      const loadedSettings = await loadSettings();
      const cloudConfig = loadedSettings.apiMode === 'cloud' && loadedSettings.deviceToken
        ? { cloudApiUrl: loadedSettings.cloudApiUrl, deviceToken: loadedSettings.deviceToken }
        : undefined;

      deps.setAgent(
        createAgent({
          model: config.geminiModel,
          apiKey: config.geminiApiKey,
          openaiApiKey: config.openaiApiKey,
          anthropicApiKey: config.anthropicApiKey,
          systemPrompt: config.systemPrompt,
          registry: deps.registry,
          cloudConfig,
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
}
