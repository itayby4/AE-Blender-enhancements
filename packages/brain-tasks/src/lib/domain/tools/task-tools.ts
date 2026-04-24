import type { LocalToolRegistry } from '../local-tool-registry.js';
import { TOOL_NAME_TOKENS } from '@pipefx/brain-contracts';
import type {
  SubAgentsApi,
  SubAgentEvent,
  TaskType,
  TaskStatus,
  TaskTypeMetadata,
  AgentProfile,
} from '@pipefx/brain-contracts';
import { brainTasksLog } from '../../log.js';
import {
  TASK_GET_DESCRIPTION,
  TASK_GET_INPUT_SCHEMA,
  TASK_LIST_DESCRIPTION,
  TASK_LIST_INPUT_SCHEMA,
  TASK_OUTPUT_DESCRIPTION,
  TASK_OUTPUT_INPUT_SCHEMA,
  TASK_STOP_DESCRIPTION,
  TASK_STOP_INPUT_SCHEMA,
  TASK_UPDATE_DESCRIPTION,
  TASK_UPDATE_INPUT_SCHEMA,
  buildTaskCreateDescription,
  buildTaskCreateInputSchema,
} from './task-tools-prompts.js';
import type { AgentSessionStore } from '../session-store.js';
import type { TaskOutputStore } from '../../data/output-store.js';

export interface TaskToolsDeps {
  sessions: AgentSessionStore;
  subAgents: SubAgentsApi;
  taskOutput: TaskOutputStore;
  getSessionId: () => string | undefined;
  onSubAgentEvent?: (sessionId: string, ev: SubAgentEvent) => void;
  taskTypes: TaskTypeMetadata[];
  profiles: AgentProfile[];
}

export function registerTaskTools(
  registry: LocalToolRegistry,
  deps: TaskToolsDeps
): void {
  for (const t of [
    TOOL_NAME_TOKENS.TASK_CREATE,
    TOOL_NAME_TOKENS.TASK_LIST,
    TOOL_NAME_TOKENS.TASK_GET,
    TOOL_NAME_TOKENS.TASK_UPDATE,
    TOOL_NAME_TOKENS.TASK_STOP,
    TOOL_NAME_TOKENS.TASK_OUTPUT,
  ]) {
    brainTasksLog.info('register tool', { tool: t });
  }

  const taskCreateDescription = buildTaskCreateDescription(deps.taskTypes, deps.profiles);
  const taskCreateSchema = buildTaskCreateInputSchema(deps.taskTypes, deps.profiles);

  // ── TaskCreate ────────────────────────────────────────────────────────────
  registry.registerLocalTool(
    TOOL_NAME_TOKENS.TASK_CREATE,
    taskCreateDescription,
    taskCreateSchema,
    async (args) => {
      const sessionId = deps.getSessionId();
      if (!sessionId) return 'No active session.';

      const { taskType, description, prompt, allowedTools, agentName } = args as {
        taskType: TaskType;
        description: string;
        prompt: string;
        allowedTools?: string[];
        agentName?: string;
      };

      // Fire-and-forget: return the task id immediately so the model can
      // manage the task via other Task* tools while it runs.
      const runPromise = deps.subAgents
        .run({
          sessionId,
          taskType,
          description,
          prompt,
          allowedTools,
          agentName,
          onEvent: (ev) => deps.onSubAgentEvent?.(sessionId, ev),
        })
        .catch(() => {
          /* Errors land on the task record via its status/error fields. */
        });

      // The runtime sets state.tasks synchronously before the first await, so
      // after one microtask the task record is visible.
      await Promise.resolve();
      void runPromise;

      const state = deps.sessions.get(sessionId);
      const latest = Array.from(state.tasks.values()).at(-1);
      if (!latest) {
        brainTasksLog.error('TaskCreate failed', { sessionId, reason: 'no-task-record' });
        return 'Task creation failed — no task record appeared.';
      }
      brainTasksLog.info('TaskCreate', {
        sessionId,
        taskId: latest.id,
        taskType: latest.type,
        description: latest.description,
        agentName,
      });
      return `Task created: ${latest.id} (${latest.type}${
        agentName ? `, profile=${agentName}` : ''
      }) — ${latest.description}`;
    }
  );

  // ── TaskList ──────────────────────────────────────────────────────────────
  registry.registerLocalTool(
    TOOL_NAME_TOKENS.TASK_LIST,
    TASK_LIST_DESCRIPTION,
    TASK_LIST_INPUT_SCHEMA as unknown as Record<string, unknown>,
    async (args) => {
      const sessionId = deps.getSessionId();
      if (!sessionId) return 'No active session.';
      const { status } = args as { status?: TaskStatus };
      const state = deps.sessions.get(sessionId);
      let items = Array.from(state.tasks.values());
      if (status) items = items.filter((t) => t.status === status);
      if (items.length === 0) return 'No tasks.';
      return items
        .map(
          (t) =>
            `${t.id}  ${t.status.padEnd(10)}  ${t.type.padEnd(16)}  ${t.description}`
        )
        .join('\n');
    }
  );

  // ── TaskGet ───────────────────────────────────────────────────────────────
  registry.registerLocalTool(
    TOOL_NAME_TOKENS.TASK_GET,
    TASK_GET_DESCRIPTION,
    TASK_GET_INPUT_SCHEMA as unknown as Record<string, unknown>,
    async (args) => {
      const sessionId = deps.getSessionId();
      if (!sessionId) return 'No active session.';
      const { taskId } = args as { taskId: string };
      const state = deps.sessions.get(sessionId);
      const task = state.tasks.get(taskId);
      if (!task) return `Task ${taskId} not found.`;
      return JSON.stringify(
        {
          id: task.id,
          type: task.type,
          status: task.status,
          description: task.description,
          createdAt: task.createdAt,
          startedAt: task.startedAt,
          finishedAt: task.finishedAt,
          error: task.error,
        },
        null,
        2
      );
    }
  );

  // ── TaskUpdate ────────────────────────────────────────────────────────────
  registry.registerLocalTool(
    TOOL_NAME_TOKENS.TASK_UPDATE,
    TASK_UPDATE_DESCRIPTION,
    TASK_UPDATE_INPUT_SCHEMA as unknown as Record<string, unknown>,
    async (args) => {
      const sessionId = deps.getSessionId();
      if (!sessionId) return 'No active session.';
      const { taskId, message } = args as { taskId: string; message: string };
      if (!taskId || !message) {
        return 'Rejected: both `taskId` and `message` are required.';
      }

      brainTasksLog.info('TaskUpdate', { sessionId, taskId, messageChars: message.length });

      try {
        const result = await deps.subAgents.resume({
          sessionId,
          taskId,
          followUp: message,
          onEvent: (ev) => deps.onSubAgentEvent?.(sessionId, ev),
        });
        return `[${result.taskId}] (resumed)\n\n${result.output}`;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        brainTasksLog.error('TaskUpdate failed', { sessionId, taskId, error: msg });
        return `TaskUpdate failed: ${msg}`;
      }
    }
  );

  // ── TaskStop ──────────────────────────────────────────────────────────────
  registry.registerLocalTool(
    TOOL_NAME_TOKENS.TASK_STOP,
    TASK_STOP_DESCRIPTION,
    TASK_STOP_INPUT_SCHEMA as unknown as Record<string, unknown>,
    async (args) => {
      const sessionId = deps.getSessionId();
      if (!sessionId) return 'No active session.';
      const { taskId } = args as { taskId: string };
      const state = deps.sessions.get(sessionId);
      const task = state.tasks.get(taskId);
      if (!task) return `Task ${taskId} not found.`;
      brainTasksLog.info('TaskStop', { sessionId, taskId, prevStatus: task.status });
      deps.subAgents.stop(taskId);
      return `Stop signal sent to ${taskId}. Current status: ${task.status}.`;
    }
  );

  // ── TaskOutput ────────────────────────────────────────────────────────────
  registry.registerLocalTool(
    TOOL_NAME_TOKENS.TASK_OUTPUT,
    TASK_OUTPUT_DESCRIPTION,
    TASK_OUTPUT_INPUT_SCHEMA as unknown as Record<string, unknown>,
    async (args) => {
      const sessionId = deps.getSessionId();
      if (!sessionId) return 'No active session.';
      const { taskId, bytes } = args as { taskId: string; bytes?: number };
      const state = deps.sessions.get(sessionId);
      if (!state.tasks.has(taskId)) return `Task ${taskId} not found.`;
      const text =
        typeof bytes === 'number'
          ? await deps.taskOutput.tail(sessionId, taskId, bytes)
          : await deps.taskOutput.read(sessionId, taskId);
      return text || '(empty)';
    }
  );
}
