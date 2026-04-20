/**
 * Coordinator mode factory.
 *
 * In coordinator mode:
 *  - The agent's system prompt swaps to COORDINATOR_SYSTEM_PROMPT.
 *  - The full task-management tool suite is exposed.
 *  - Connector tools and Todo/PlanMode remain available.
 *
 * This is just configuration plumbing; the underlying agent is the same
 * createAgent() from @pipefx/ai.
 */

import type { Agent, AgentConfig } from '@pipefx/ai';
import { createAgent } from '@pipefx/ai';
import { COORDINATOR_SYSTEM_PROMPT } from '../prompts/coordinator.js';
import { TOOL_NAME_TOKENS } from '../constants.js';

export interface CoordinatorOptions {
  /**
   * Additional instructions appended after the coordinator system prompt
   * (e.g. the app's domain context — "You control DaVinci Resolve").
   */
  domainContext?: string;
}

export function createCoordinatorAgent(
  baseConfig: AgentConfig,
  opts: CoordinatorOptions = {}
): Agent {
  const systemPrompt = opts.domainContext
    ? `${COORDINATOR_SYSTEM_PROMPT}\n\n${opts.domainContext}`
    : COORDINATOR_SYSTEM_PROMPT;

  return createAgent({
    ...baseConfig,
    systemPrompt,
  });
}

/**
 * Tool-name allowlist for coordinator mode. When coordinator is NOT active,
 * these tools should be filtered out of the agent's tool list.
 */
export const COORDINATOR_ONLY_TOOLS: readonly string[] = [
  TOOL_NAME_TOKENS.AGENT,
  TOOL_NAME_TOKENS.TASK_CREATE,
  TOOL_NAME_TOKENS.TASK_LIST,
  TOOL_NAME_TOKENS.TASK_GET,
  TOOL_NAME_TOKENS.TASK_UPDATE,
  TOOL_NAME_TOKENS.TASK_STOP,
  TOOL_NAME_TOKENS.TASK_OUTPUT,
];

/**
 * Given the full tool list and the coordinator flag, return the subset
 * the agent should see this turn.
 */
export function filterToolsForCoordinatorMode<T extends { name: string }>(
  tools: T[],
  coordinatorEnabled: boolean
): T[] {
  if (coordinatorEnabled) return tools;
  const blocked = new Set(COORDINATOR_ONLY_TOOLS);
  return tools.filter((t) => !blocked.has(t.name));
}
