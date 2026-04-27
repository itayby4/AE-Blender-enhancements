// ── @pipefx/post-production/contracts — events ───────────────────────────
// Event-bus event names + payload shapes for workflow lifecycle. Consumed
// by any subscriber wired through `@pipefx/event-bus` — typically the
// chat agent loop (so the LLM can react to in-flight workflow state) and
// the desktop's task widget (so the user sees what's running).
//
// Naming convention mirrors the rest of the codebase: dotted, lowercase,
// noun.verb. Past-tense verb because every event represents something
// that already happened.
//
// Why publish events instead of returning a stream from `execute()`:
// the orchestrator may want to fire-and-forget (e.g. queue a long autopod
// run from chat), and the LLM-side listener wants observability without
// holding a reference to the Promise.

import type {
  WorkflowArtifact,
  WorkflowError,
  WorkflowProgressEvent,
  WorkflowRunId,
  WorkflowStatus,
} from './types.js';

// ── Event payloads ───────────────────────────────────────────────────────

export interface WorkflowStartedEvent {
  runId: WorkflowRunId;
  workflowId: string;
  /** ISO timestamp — easier for the UI to format than a number. */
  startedAt: string;
}

export interface WorkflowProgressedEvent extends WorkflowProgressEvent {
  workflowId: string;
}

export interface WorkflowFinishedEvent {
  runId: WorkflowRunId;
  workflowId: string;
  status: Exclude<WorkflowStatus, 'pending' | 'running'>;
  /** ISO timestamp. */
  finishedAt: string;
  durationMs: number;
  artifacts: ReadonlyArray<WorkflowArtifact>;
  /** Populated when `status === 'failed'`. */
  error?: WorkflowError;
}

// ── Event-bus shape ──────────────────────────────────────────────────────
// Intersected with any other domain's event map to form the unified bus
// type — e.g. `EventBus<McpEventMap & SkillEventMap & WorkflowEventMap>`.

export interface WorkflowEventMap {
  'workflow.started': WorkflowStartedEvent;
  'workflow.progressed': WorkflowProgressedEvent;
  'workflow.finished': WorkflowFinishedEvent;
}
