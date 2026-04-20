/**
 * One-call registration of the whole OpenClaude-style toolset.
 */

import type { ConnectorRegistry } from '@pipefx/mcp';
import type { AgentSessionStore, TodoItem } from '../sessionState.js';
import type { SubAgentEvent, SubAgentRuntime } from '../runtime/runAgent.js';
import type { TaskOutputStore } from '../output/store.js';
import type { PlanApprovalBroker } from '../planApproval.js';
import { registerTodoWrite } from './todoWrite.js';
import { registerPlanModeTools } from './enterPlanMode.js';
import { registerAgentTool } from './agent.js';
import { registerTaskTools } from './taskTools.js';

export interface RegisterAgentToolsDeps {
  sessions: AgentSessionStore;
  subAgents: SubAgentRuntime;
  taskOutput: TaskOutputStore;
  broker: PlanApprovalBroker;
  /** Per-call session id resolver (usually reads from an AsyncLocalStorage or request). */
  getSessionId: () => string | undefined;
  /** Optional — fire when todos update (for SSE broadcast). */
  onTodosUpdated?: (sessionId: string, todos: TodoItem[]) => void;
  /** Optional — fire when a plan is proposed (for SSE `plan_proposed`). */
  onPlanProposed?: (sessionId: string, taskId: string, plan: string) => void;
  /** Optional — fire when plan is accepted/rejected. */
  onPlanResolved?: (
    sessionId: string,
    taskId: string,
    approved: boolean,
    feedback?: string
  ) => void;
  /** Optional — multiplex sub-agent events into the parent SSE stream. */
  onSubAgentEvent?: (sessionId: string, ev: SubAgentEvent) => void;
}

/**
 * Wire every OpenClaude-style tool into the given ConnectorRegistry.
 *
 * Call after the base registry is built but before the HTTP server starts.
 */
export function registerAgentTools(
  registry: ConnectorRegistry,
  deps: RegisterAgentToolsDeps
): void {
  registerTodoWrite(registry, {
    sessions: deps.sessions,
    getSessionId: deps.getSessionId,
    onUpdate: deps.onTodosUpdated,
  });

  registerPlanModeTools(registry, {
    sessions: deps.sessions,
    broker: deps.broker,
    getSessionId: deps.getSessionId,
    onPlanProposed: deps.onPlanProposed,
    onPlanResolved: deps.onPlanResolved,
  });

  registerAgentTool(registry, {
    subAgents: deps.subAgents,
    getSessionId: deps.getSessionId,
    onSubAgentEvent: deps.onSubAgentEvent,
  });

  registerTaskTools(registry, {
    sessions: deps.sessions,
    subAgents: deps.subAgents,
    taskOutput: deps.taskOutput,
    getSessionId: deps.getSessionId,
    onSubAgentEvent: deps.onSubAgentEvent,
  });
}
