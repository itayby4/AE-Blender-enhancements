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
import { createAgent } from '@pipefx/brain-loop';

/**
 * Settings + connector switch routes.
 *
 * Phase 9.3 took the workflow HTTP routes (subtitles/audio-sync/autopod)
 * out of here and into `mountWorkflowRoutes` from
 * `@pipefx/post-production/backend`. Phase 9.B did the same for the
 * media-gen routes (`/api/ai-models`, `/api/save-render`) — they live
 * in `@pipefx/media-gen/backend` now and are mounted from `main.ts`.
 *
 * What's left here is what genuinely belongs in the host app: settings
 * reload (which has to rebuild the agent + workflow context inline) and
 * the active-app connector switch.
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

      // Propagate media gen keys to process.env so @pipefx/media-providers
      // (which read from process.env) pick up freshly-saved BYOK keys.
      const loadedSettings = await loadSettings();
      if (loadedSettings.elevenlabsApiKey) process.env.ELEVENLABS_API_KEY = loadedSettings.elevenlabsApiKey;
      if (loadedSettings.klingApiKey) process.env.KLING_API_KEY = loadedSettings.klingApiKey;
      if (loadedSettings.klingApiSecret) process.env.KLING_API_SECRET = loadedSettings.klingApiSecret;
      if (loadedSettings.byteplusApiKey) process.env.BYTEPLUS_API_KEY = loadedSettings.byteplusApiKey;
      if (loadedSettings.byteplusSeedDreamEndpoint) process.env.BYTEPLUS_SEEDDREAM_ENDPOINT = loadedSettings.byteplusSeedDreamEndpoint;
      if (loadedSettings.byteplusArkApiKey) process.env.BYTEPLUS_ARK_API_KEY = loadedSettings.byteplusArkApiKey;

      // Resolve cloud config if user is in cloud mode
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

      console.log('[Settings] Hot-Reloaded AI agent + media gen keys successfully');
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
}
