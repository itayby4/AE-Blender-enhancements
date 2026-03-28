import type { ConnectorRegistry } from '@pipefx/mcp';
import { GoogleGenAI } from '@google/genai';
import { OpenAI } from 'openai';
import { hebrewSubtitlesWorkflow } from './subtitles.js';
import { timelineTranscriptWorkflow } from './transcript.js';
import type { WorkflowContext } from './types.js';

export function registerLocalWorkflows(registry: ConnectorRegistry, config: { geminiApiKey: string; openaiApiKey: string }) {
  const context: WorkflowContext = {
    registry,
    ai: new GoogleGenAI({ apiKey: config.geminiApiKey }),
    openai: new OpenAI({ apiKey: config.openaiApiKey }),
  };

  const workflows = [
    hebrewSubtitlesWorkflow,
    timelineTranscriptWorkflow,
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
