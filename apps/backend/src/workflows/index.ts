import type { ConnectorRegistry } from '@pipefx/mcp';
import { GoogleGenAI } from '@google/genai';
import { OpenAI } from 'openai';
import { autoSubtitlesWorkflow } from './subtitles.js';
import { timelineTranscriptWorkflow } from './transcript.js';
import { analyzeProjectWorkflow } from './understanding.js';
import { syncExternalAudioWorkflow } from './audio-sync.js';
import type { WorkflowContext } from './types.js';

export { getTimelineInfoWorkflow, autopodWorkflow } from './autopod.js';

export function registerLocalWorkflows(
  registry: ConnectorRegistry,
  config: { geminiApiKey: string; openaiApiKey: string }
) {
  const context: WorkflowContext = {
    registry,
    ai: new GoogleGenAI({ apiKey: config.geminiApiKey }),
    openai: new OpenAI({ apiKey: config.openaiApiKey }),
  };

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
