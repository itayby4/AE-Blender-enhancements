import type { ConnectorRegistry } from '@pipefx/connectors';
import { GoogleGenAI } from '@google/genai';
import { OpenAI } from 'openai';

export interface WorkflowContext {
  registry: ConnectorRegistry;
  ai: GoogleGenAI;
  openai: OpenAI;
}

export interface WorkflowDefinition {
  name: string;
  description: string;
  parameters: Record<string, any>;
  execute: (args: any, context: WorkflowContext) => Promise<string>;
}
