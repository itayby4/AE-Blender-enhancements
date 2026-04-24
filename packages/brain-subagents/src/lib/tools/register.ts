/**
 * One-call registration of the whole OpenClaude-style toolset.
 *
 * Wires TodoWrite + Plan-mode (from brain-tasks + brain-planning) plus the
 * AgentTool + Task* suite (from this package) into a single
 * `ConnectorRegistry`.
 */

import type { ConnectorRegistry } from '@pipefx/mcp';
import type {
  AgentProfile,
  TaskTypeMetadata,
  TodoItem,
} from '@pipefx/brain-contracts';
import {
  AgentSessionStore,
  getAllTaskTypes,
  registerTaskTools,
  registerTodoWrite,
  type TaskOutputStore,
} from '@pipefx/brain-tasks';
import {
  type PlanApprovalBroker,
  registerPlanModeTools,
} from '@pipefx/brain-planning';
import {
  BUILT_IN_AGENTS,
} from '../domain/built-in-agents.js';
import type {
  SubAgentEvent,
  SubAgentRuntime,
} from '../domain/run-agent.js';
import { registerAgentTool } from './register-agent-tool.js';

export interface RegisterAgentToolsDeps {
  sessions: AgentSessionStore;
  subAgents: SubAgentRuntime;
  taskOutput: TaskOutputStore;
  broker: PlanApprovalBroker;
  /** Per-call session id resolver (usually reads from an AsyncLocalStorage or request). */
  getSessionId: () => string | undefined;
  /**
   * Task-type catalog to expose on AgentTool / TaskCreate.
   * Defaults to `getAllTaskTypes()`.
   */
  taskTypes?: TaskTypeMetadata[];
  /**
   * Named agent profiles to expose on AgentTool / TaskCreate.
   * Defaults to `BUILT_IN_AGENTS`. Pass a composed list to include user
   * profiles loaded via `loadAgentsDir`.
   */
  profiles?: AgentProfile[];
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
  const taskTypes = deps.taskTypes ?? getAllTaskTypes();
  const profiles = deps.profiles ?? BUILT_IN_AGENTS;

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
    taskTypes,
    profiles,
  });

  registerTaskTools(registry, {
    sessions: deps.sessions,
    subAgents: deps.subAgents,
    taskOutput: deps.taskOutput,
    getSessionId: deps.getSessionId,
    onSubAgentEvent: deps.onSubAgentEvent,
    taskTypes,
    profiles,
  });
}
