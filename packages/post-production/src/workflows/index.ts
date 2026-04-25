// ── @pipefx/post-production/workflows — barrel ───────────────────────────
// Public surface of the local-tool workflows. Two consumption modes:
//
//   1. As connector local-tools (the chat path) — `registerLocalWorkflows`
//      registers each workflow as a tool the brain can call through the
//      agent loop.
//   2. As direct callables (the desktop dashboards path) — each workflow
//      is exported by name so the backend HTTP handlers in `../backend/`
//      can invoke them without going through the registry.
//
// The two-mode structure mirrors what apps/backend's workflows/index.ts
// did before Phase 9.3; the move into the package preserves the surface
// 1:1 so callers (apps/backend/src/main.ts, the desktop dashboards)
// switch by import path only.

import type { ConnectorRegistry } from '@pipefx/connectors';
import { GoogleGenAI } from '@google/genai';
import { OpenAI } from 'openai';

import { autoSubtitlesWorkflow } from './subtitles.js';
import { timelineTranscriptWorkflow } from './transcript.js';
import { analyzeProjectWorkflow } from './understanding.js';
import { syncExternalAudioWorkflow } from './audio-sync.js';
import type { LocalToolContext } from './types.js';

// ── Type re-exports ──────────────────────────────────────────────────────

export type { LocalToolContext, LocalToolWorkflow } from './types.js';

// ── Workflow re-exports ──────────────────────────────────────────────────
// Named exports so HTTP handlers and tests can grab a single workflow
// without invoking the registration helper.

export { autoSubtitlesWorkflow } from './subtitles.js';
export { timelineTranscriptWorkflow } from './transcript.js';
export { analyzeProjectWorkflow } from './understanding.js';
export { syncExternalAudioWorkflow } from './audio-sync.js';
export { getTimelineInfoWorkflow, autopodWorkflow } from './autopod.js';

// Pipeline shared internals — re-exported because the desktop
// /api/subtitles/generate handler reaches into the transcription
// pipeline directly rather than going through autoSubtitlesWorkflow.
export { runTranscriptionPipeline } from './pipeline.js';
export type {
  PipelineOptions,
  SubtitleSegment,
} from './pipeline.js';

// ── Build a context for tool registration ────────────────────────────────

/**
 * Construct a `LocalToolContext` from the apps/backend config. Exposed so
 * HTTP handlers can build their own context for direct invocations
 * without re-implementing the wiring.
 */
export function createLocalToolContext(
  registry: ConnectorRegistry,
  config: { geminiApiKey: string; openaiApiKey: string }
): LocalToolContext {
  return {
    registry,
    ai: new GoogleGenAI({ apiKey: config.geminiApiKey }),
    openai: new OpenAI({ apiKey: config.openaiApiKey }),
  };
}

/**
 * Register every local-tool workflow against the connector registry so
 * the brain can call them through the agent loop. Idempotent at the
 * registry level — calling twice replaces the prior registration.
 */
export function registerLocalWorkflows(
  registry: ConnectorRegistry,
  config: { geminiApiKey: string; openaiApiKey: string }
) {
  const context = createLocalToolContext(registry, config);

  const workflows = [
    autoSubtitlesWorkflow,
    timelineTranscriptWorkflow,
    analyzeProjectWorkflow,
    syncExternalAudioWorkflow,
  ];

  for (const workflow of workflows) {
    registry.registerLocalTool(
      workflow.name,
      workflow.description,
      workflow.parameters,
      async (args) => {
        return await workflow.execute(args, context);
      }
    );
  }
}
