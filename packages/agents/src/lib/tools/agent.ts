import type { ConnectorRegistry } from '@pipefx/mcp';
import { TOOL_NAME_TOKENS } from '../constants.js';
import { agentsLog } from '../log.js';
import {
  buildAgentToolDescription,
  buildAgentToolInputSchema,
} from '../prompts/agentTool.js';
import type { SubAgentRuntime, SubAgentEvent } from '../runtime/runAgent.js';
import type { TaskType } from '../Task.js';
import type { TaskTypeMetadata } from '../tasks.js';
import type { AgentProfile } from '../runtime/builtInAgents.js';

export interface AgentToolDeps {
  subAgents: SubAgentRuntime;
  getSessionId: () => string | undefined;
  /** Optional hook to multiplex worker events into the parent SSE stream. */
  onSubAgentEvent?: (sessionId: string, ev: SubAgentEvent) => void;
  /** Task-type catalog to render into the tool description. */
  taskTypes: TaskTypeMetadata[];
  /** Named agent profiles to expose as `agentName` enum. */
  profiles: AgentProfile[];
}

export function registerAgentTool(
  registry: ConnectorRegistry,
  deps: AgentToolDeps
): void {
  const description = buildAgentToolDescription(deps.taskTypes, deps.profiles);
  const inputSchema = buildAgentToolInputSchema(deps.taskTypes, deps.profiles);

  agentsLog.info('register tool', {
    tool: TOOL_NAME_TOKENS.AGENT,
    descriptionChars: description.length,
    taskTypes: deps.taskTypes.length,
    profiles: deps.profiles.length,
  });

  registry.registerLocalTool(
    TOOL_NAME_TOKENS.AGENT,
    description,
    inputSchema,
    async (args) => {
      const sessionId = deps.getSessionId();
      if (!sessionId) {
        agentsLog.warn('AgentTool rejected', { reason: 'no-session' });
        return 'No active session.';
      }

      const {
        taskType,
        description: desc,
        prompt,
        allowedTools,
        agentName,
      } = args as {
        taskType: TaskType;
        description: string;
        prompt: string;
        allowedTools?: string[];
        agentName?: string;
      };

      agentsLog.info('AgentTool invoked', {
        sessionId,
        taskType,
        agentName,
        description: desc,
        promptChars: prompt?.length ?? 0,
        allowedToolsCount: allowedTools?.length ?? 0,
      });

      try {
        const result = await deps.subAgents.run({
          sessionId,
          taskType,
          description: desc,
          prompt,
          allowedTools,
          agentName,
          onEvent: (ev) => deps.onSubAgentEvent?.(sessionId, ev),
        });

        agentsLog.info('AgentTool returned', {
          sessionId,
          taskId: result.taskId,
          outputChars: result.output.length,
        });
        return `[${result.taskId}] ${desc}\n\n${result.output}`;
      } catch (err) {
        agentsLog.error('AgentTool threw', {
          sessionId,
          error: err instanceof Error ? err.message : String(err),
        });
        throw err;
      }
    }
  );
}
