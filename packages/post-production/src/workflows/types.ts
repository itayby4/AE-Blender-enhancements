// ── @pipefx/post-production/workflows — local-tool workflow types ────────
// The shapes used by the four chat-driven workflows that register
// themselves as connector local-tools (auto-subtitles, transcript, audio
// sync, project understanding). Distinct from the Phase 9.1 published
// contracts (`WorkflowDescriptor` / `WorkflowContext` in
// @pipefx/post-production/contracts), which describe the next-gen
// HTTP-driven workflow shape.
//
// Renaming the legacy types `LocalToolWorkflow` / `LocalToolContext`
// (from `WorkflowDefinition` / `WorkflowContext`) makes the distinction
// explicit at the type level — both shapes describe "a workflow", but
// they're consumed by different machinery: local-tools register against
// the connector registry and the brain calls them through the agent
// loop; the contract shape is for HTTP-driven background workflows
// the UI will eventually invoke directly.
//
// We keep the legacy types alive (rather than refactoring the workflows
// to fit the new contract) because:
//   1. The chat-tool integration is the actual production path today.
//   2. The contract shape is aspirational scaffolding for future
//      workflow types; nothing forces today's workflows onto it.
//   3. A real refactor crosses brain / desktop / chat surfaces and
//      belongs in its own phase, not buried inside Phase 9.

import type { ConnectorRegistry } from '@pipefx/connectors';
import { GoogleGenAI } from '@google/genai';
import { OpenAI } from 'openai';

/**
 * Per-call context handed to a local-tool workflow's `execute()`.
 * Workflows destructure what they need; we add fields here rather than
 * threading them as positional arguments.
 */
export interface LocalToolContext {
  registry: ConnectorRegistry;
  ai: GoogleGenAI;
  openai: OpenAI;
}

/**
 * Local-tool workflow shape — registered against the connector registry
 * via `registerLocalWorkflows`. The `execute` return is JSON-stringified
 * because the brain consumes it as a tool-call result (which the agent
 * loop kernel expects to be a string).
 *
 * `parameters` is a JSONSchema-ish object that the LLM uses to validate
 * tool-call arguments before dispatching. We accept `Record<string, any>`
 * rather than a typed schema because each workflow declares its own
 * shape and a discriminated union here would balloon for no payoff.
 */
export interface LocalToolWorkflow {
  name: string;
  description: string;
  parameters: Record<string, any>;
  execute: (args: any, context: LocalToolContext) => Promise<string>;
}
