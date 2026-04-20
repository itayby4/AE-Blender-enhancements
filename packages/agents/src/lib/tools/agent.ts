import type { ConnectorRegistry } from '@pipefx/mcp';
import { TOOL_NAME_TOKENS } from '../constants.js';
import { agentsLog } from '../log.js';
import {
  AGENT_TOOL_DESCRIPTION,
  AGENT_TOOL_INPUT_SCHEMA,
} from '../prompts/agentTool.js';
import type { SubAgentRuntime, SubAgentEvent } from '../runtime/runAgent.js';
import type { TaskType } from '../Task.js';

export interface AgentToolDeps {
  subAgents: SubAgentRuntime;
  getSessionId: () => string | undefined;
  /** Optional hook to multiplex worker events into the parent SSE stream. */
  onSubAgentEvent?: (sessionId: string, ev: SubAgentEvent) => void;
}

export function registerAgentTool(
  registry: ConnectorRegistry,
  deps: AgentToolDeps
): void {
  agentsLog.info('register tool', { tool: TOOL_NAME_TOKENS.AGENT });
  registry.registerLocalTool(
    TOOL_NAME_TOKENS.AGENT,
    AGENT_TOOL_DESCRIPTION,
    AGENT_TOOL_INPUT_SCHEMA as unknown as Record<string, unknown>,
    async (args) => {
      const sessionId = deps.getSessionId();
      if (!sessionId) {
        agentsLog.warn('AgentTool rejected', { reason: 'no-session' });
        return 'No active session.';
      }

      const {
        taskType,
        description,
        prompt,
        allowedTools,
      } = args as {
        taskType: TaskType;
        description: string;
        prompt: string;
        allowedTools?: string[];
      };

      agentsLog.info('AgentTool invoked', {
        sessionId,
        taskType,
        description,
        promptChars: prompt?.length ?? 0,
        allowedToolsCount: allowedTools?.length ?? 0,
      });

      try {
        const result = await deps.subAgents.run({
          sessionId,
          taskType,
          description,
          prompt,
          allowedTools,
          onEvent: (ev) => deps.onSubAgentEvent?.(sessionId, ev),
        });

        agentsLog.info('AgentTool returned', {
          sessionId,
          taskId: result.taskId,
          outputChars: result.output.length,
        });
        return `[${result.taskId}] ${description}\n\n${result.output}`;
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
