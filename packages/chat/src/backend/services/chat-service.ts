// ── @pipefx/chat/backend — chat orchestration service ───────────────────
// Pure orchestration. Depends on:
//   - own contracts (ChatSessionStore, TranscriptStore, TaskProgressTracker,
//     ChatLogger, PostRoundReminderFactory, StreamEvent)
//   - @pipefx/brain-contracts (TasksApi, PlanApprovalBroker, AgentSessionState)
//   - @pipefx/agent-loop-kernel (Agent, AggregatedUsage)
//   - @pipefx/llm-providers (UsageData)
//   - @pipefx/connectors (ConnectorRegistry)
//
// Explicitly does NOT import brain-loop / brain-tasks / brain-memory /
// brain-planning / brain-subagents — that coupling lives in the app layer
// where the concrete adapters get wired into these ports.

import type { AsyncLocalStorage } from 'node:async_hooks';
import type { Agent, AggregatedUsage } from '@pipefx/agent-loop-kernel';
import type { UsageData } from '@pipefx/llm-providers';
import type { ConnectorRegistry } from '@pipefx/connectors';
import type {
  AgentSessionState,
  PlanApprovalBroker,
  TasksApi,
} from '@pipefx/brain-contracts';
import type {
  ChatLogger,
  ChatSessionStore,
  PostRoundReminderFactory,
  StreamEvent,
  TaskProgressTracker,
  TranscriptStore,
} from '../../contracts/index.js';

// ── Cost / usage shapes (structural) ─────────────────────────────────────
// Apps wire the real `calculateCost` / `createUsageEvent` from
// @pipefx/usage (scope:usage — not reachable from feature:chat).

export interface CostShape {
  costUsd: number;
  credits: number;
  breakdown: {
    inputCost: number;
    outputCost: number;
    thinkingCost: number;
    cachedDiscount: number;
  };
}

export interface UsageStoreLike {
  record(event: unknown): void;
}

// ── Shared deps ──────────────────────────────────────────────────────────

export interface ChatServiceDeps {
  /** Lazy accessor — apps may rebuild the agent on settings changes. */
  getAgent: () => Agent;
  registry: ConnectorRegistry;

  // Ports (own contracts)
  sessions: ChatSessionStore;
  transcript: TranscriptStore;
  taskProgress: TaskProgressTracker;
  logger: ChatLogger;
  reminders: PostRoundReminderFactory;

  // Brain-contracts (optional — service degrades gracefully when absent)
  tasks?: TasksApi;
  planBroker?: PlanApprovalBroker;

  sessionALS?: AsyncLocalStorage<string>;
  sseBroker?: {
    set: (sessionId: string, emit: (ev: Record<string, unknown>) => void) => void;
    clear: (sessionId: string) => void;
  };
  usageStore?: UsageStoreLike;

  buildSystemPrompt: (
    skill: unknown,
    activeApp: string | undefined,
    projectId: string | undefined
  ) => Promise<string>;
  calculateCost: (usage: UsageData) => CostShape;
  createUsageEvent: (args: {
    userId: string;
    sessionId: string;
    requestId: string;
    roundIndex: number;
    usage: UsageData;
    cost: CostShape;
    isByok: boolean;
  }) => unknown;
}

export interface ChatTurnRequest {
  message: string;
  // skill / history are opaque to the service — forwarded straight to the agent.
  skill?: { systemInstruction?: string; model?: string; allowedTools?: string[] } | null;
  history?: unknown[];
  llmModel?: string;
  activeApp?: string;
  projectId?: string;
  taskId?: string;
}

export interface ChatTurnResult {
  text: string;
  actions?: unknown[];
}

export interface ChatStreamRequest extends ChatTurnRequest {
  sessionId?: string;
}

export type StreamEmit = (event: StreamEvent | Record<string, unknown>) => void;

const STREAM_TIMEOUT = 120_000;

// ── runChatTurn: legacy non-streaming JSON ──────────────────────────────

export async function runChatTurn(
  req: ChatTurnRequest,
  deps: ChatServiceDeps,
  signal: AbortSignal
): Promise<ChatTurnResult> {
  const { message, skill, history, llmModel, activeApp, projectId, taskId } = req;

  const systemPromptOverride = await deps.buildSystemPrompt(skill, activeApp, projectId);
  const resolvedTaskId = taskId || `chat-${Date.now()}`;

  deps.taskProgress.start(resolvedTaskId, 'AI Assistant Working', projectId);
  const stepIndices = new Map<string, number>();

  try {
    const text = await deps.getAgent().chat(message, {
      providerOverride: llmModel,
      modelOverride: skill?.model,
      systemPromptOverride,
      allowedTools: skill?.allowedTools,
      history: history as never,
      signal,
      onToolCallStart: (toolName: string) => {
        const idx = deps.taskProgress.addStep(
          resolvedTaskId,
          `Calling ${toolName}`,
          'in-progress'
        );
        stepIndices.set(toolName, idx);
      },
      onToolCallComplete: (toolName: string, _result: unknown, err?: Error) => {
        const idx = stepIndices.get(toolName);
        if (idx !== undefined && idx >= 0) {
          deps.taskProgress.updateStep(resolvedTaskId, idx, err ? 'error' : 'done');
        }
      },
      onThought: (thought: string) => {
        deps.taskProgress.emitThought(resolvedTaskId, thought);
      },
    });

    deps.taskProgress.finish(resolvedTaskId, 'done');

    return extractPipelineActions(text);
  } catch (err) {
    deps.taskProgress.finish(resolvedTaskId, 'error');
    throw err;
  }
}

function extractPipelineActions(text: string): ChatTurnResult {
  let cleanText = text;
  const actions: unknown[] = [];
  const actionBlockRegex = /```(?:pipeline_actions|json)?\s*\n([\s\S]*?)```/g;
  let match;
  while ((match = actionBlockRegex.exec(text)) !== null) {
    try {
      const jsonString = match[1]
        .replace(/^\s*\/\/.*$/gm, '')
        .replace(/,\s*([\]}])/g, '$1');
      const parsed = JSON.parse(jsonString);
      if (Array.isArray(parsed) && parsed.length > 0 && parsed[0]?.type) {
        actions.push(...parsed);
        cleanText = cleanText.replace(match[0], '').trim();
      }
    } catch {
      /* ignore malformed JSON in pipeline actions */
    }
  }

  if (actions.length === 0) {
    try {
      const jsonString = text
        .replace(/^\s*\/\/.*$/gm, '')
        .replace(/,\s*([\]}])/g, '$1');
      const arrStart = jsonString.indexOf('[');
      const arrEnd = jsonString.lastIndexOf(']');
      if (arrStart !== -1 && arrEnd !== -1 && arrEnd > arrStart) {
        const parsed = JSON.parse(jsonString.substring(arrStart, arrEnd + 1));
        if (Array.isArray(parsed) && parsed.length > 0 && parsed[0]?.type) {
          actions.push(...parsed);
          cleanText = cleanText.replace(text.substring(arrStart, arrEnd + 1), '').trim();
        }
      }
    } catch {
      /* ignore fallback parse */
    }
  }

  return {
    text: cleanText,
    actions: actions.length > 0 ? actions : undefined,
  };
}

// ── runChatStream: SSE streaming ────────────────────────────────────────

export async function runChatStream(
  req: ChatStreamRequest,
  deps: ChatServiceDeps,
  emit: StreamEmit,
  signal: AbortSignal
): Promise<void> {
  const { message, skill, history, llmModel, activeApp, projectId, taskId, sessionId } = req;

  // Resolve session
  const resolvedSessionId =
    sessionId || `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const sessionIsNew = !deps.sessions.exists(resolvedSessionId);
  if (sessionIsNew) {
    deps.sessions.create(resolvedSessionId, projectId, llmModel);
  }
  deps.logger.info('chat turn start', {
    sessionId: resolvedSessionId,
    sessionIsNew,
    projectId,
    llmModel,
    activeApp,
    messageChars: typeof message === 'string' ? message.length : 0,
  });

  // User message persisted before the agent runs.
  deps.transcript.append(resolvedSessionId, 'user', message);

  // Tell the desktop the resolved sessionId immediately so mid-turn events
  // (plan_proposed, todo_updated) can be routed before `done`.
  emit({ type: 'session', sessionId: resolvedSessionId });

  const systemPromptOverride = await deps.buildSystemPrompt(skill, activeApp, projectId);
  const resolvedTaskId = taskId || `chat-${Date.now()}`;
  const stepIndices = new Map<string, number>();
  deps.taskProgress.start(resolvedTaskId, 'AI Assistant Working', projectId);

  if (deps.sseBroker) {
    deps.sseBroker.set(resolvedSessionId, (ev) => emit(ev));
  }

  // Drop idempotency caches from the previous turn so a genuine re-run of
  // the same (tool, args) is allowed to actually re-fire.
  deps.registry.clearIdempotencyCaches();

  // Internal abort = caller signal ∪ our own timeout.
  const innerAbort = new AbortController();
  const onCallerAbort = () => innerAbort.abort();
  if (signal.aborted) innerAbort.abort();
  signal.addEventListener('abort', onCallerAbort);

  let terminalEmitted = false;
  const emitTerminal = (ev: StreamEvent | Record<string, unknown>) => {
    if (terminalEmitted) return;
    terminalEmitted = true;
    emit(ev);
  };

  const streamTimeout = setTimeout(() => {
    innerAbort.abort();
    emitTerminal({ type: 'error', error: 'Request timed out after 2 minutes.' });
    deps.taskProgress.finish(resolvedTaskId, 'error');
  }, STREAM_TIMEOUT);

  // Cleanup runs once on either path.
  const cleanup = () => {
    clearTimeout(streamTimeout);
    signal.removeEventListener('abort', onCallerAbort);
    if (deps.sseBroker) deps.sseBroker.clear(resolvedSessionId);
  };

  // ── Excluded tools ────────────────────────────────────────────────────
  const excludedTools: string[] = [];

  if (deps.tasks && deps.tasks.hasSession(resolvedSessionId)) {
    const existing = deps.tasks.getSession(resolvedSessionId);
    if (existing?.planMode?.approved === true) {
      excludedTools.push('EnterPlanMode');
      deps.logger.info('chat turn excluding EnterPlanMode', {
        sessionId: resolvedSessionId,
        reason: 'plan-already-approved',
      });
    }
  }

  // ── AE bridge preflight ──────────────────────────────────────────────
  if (activeApp === 'aftereffects') {
    try {
      await deps.registry.getAllTools();
      const probe = await deps.registry.callTool('bridge-health', {});
      const probeText = (() => {
        const c = probe.content as unknown;
        if (typeof c === 'string') return c;
        if (Array.isArray(c)) {
          return c
            .map((p: unknown) =>
              typeof p === 'string' ? p : (p as { text?: string })?.text ?? ''
            )
            .join('');
        }
        return '';
      })();
      let verdict = 'unknown';
      try {
        verdict = (JSON.parse(probeText)?.verdict as string) ?? 'unknown';
      } catch {
        /* keep verdict = unknown */
      }
      deps.logger.info('bridge-health preflight', {
        sessionId: resolvedSessionId,
        verdict,
      });
      if (verdict !== 'alive') {
        deps.taskProgress.finish(resolvedTaskId, 'error');
        const msg =
          `The After Effects bridge isn't responding (verdict: ${verdict}). ` +
          `Bring After Effects to the front, dismiss any open dialogs, then retry.`;
        deps.transcript.append(resolvedSessionId, 'assistant', msg);
        emitTerminal({ type: 'done', text: msg, sessionId: resolvedSessionId });
        cleanup();
        return;
      }
      excludedTools.push('bridge-health');
    } catch (err) {
      deps.logger.error('bridge-health preflight failed', {
        sessionId: resolvedSessionId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Per-turn reminder closure — reset per turn.
  const reminderFn = deps.reminders.create();

  const runChat = async () =>
    deps.getAgent().chat(message, {
      providerOverride: llmModel,
      modelOverride: skill?.model,
      systemPromptOverride,
      allowedTools: skill?.allowedTools,
      excludedTools,
      history: history as never,
      signal: innerAbort.signal,
      onStreamChunk: (chunk: string) => emit({ type: 'chunk', text: chunk }),
      onToolCallStart: (toolName: string, args: unknown) => {
        const idx = deps.taskProgress.addStep(
          resolvedTaskId,
          `Calling ${toolName}`,
          'in-progress'
        );
        stepIndices.set(toolName, idx);
        emit({ type: 'tool_start', name: toolName, args });
      },
      onToolCallComplete: (toolName: string, _result: unknown, err?: Error) => {
        const idx = stepIndices.get(toolName);
        if (idx !== undefined && idx >= 0) {
          deps.taskProgress.updateStep(resolvedTaskId, idx, err ? 'error' : 'done');
        }
        emit({ type: 'tool_done', name: toolName, error: err?.message });
      },
      onThought: (thought: string) => {
        deps.taskProgress.emitThought(resolvedTaskId, thought);
        emit({ type: 'thought', text: thought });
      },
      onCompaction: (removedCount: number, summary?: string) => {
        emit({ type: 'compaction', removedCount, summary });
      },
      getPostRoundReminder: (ctx: unknown) => {
        const session: AgentSessionState | null =
          deps.tasks && deps.tasks.hasSession(resolvedSessionId)
            ? deps.tasks.getSession(resolvedSessionId)
            : null;
        return reminderFn(ctx as never, session);
      },
      onRoundUsage: (usage: UsageData, roundNumber: number) => {
        const cost = deps.calculateCost(usage);
        emit({
          type: 'usage_round',
          roundNumber,
          usage: {
            inputTokens: usage.inputTokens,
            outputTokens: usage.outputTokens,
            thinkingTokens: usage.thinkingTokens,
            cachedTokens: usage.cachedTokens,
            model: usage.model,
            provider: usage.provider,
          },
          cost: { costUsd: cost.costUsd, credits: cost.credits },
        });

        if (deps.usageStore) {
          const ev = deps.createUsageEvent({
            userId: 'local-user',
            sessionId: resolvedSessionId,
            requestId: resolvedTaskId,
            roundIndex: roundNumber,
            usage,
            cost,
            isByok: true,
          });
          deps.usageStore.record(ev);
        }
      },
      onUsage: (aggregated: AggregatedUsage) => {
        emit({
          type: 'usage_total',
          totalInputTokens: aggregated.totalInputTokens,
          totalOutputTokens: aggregated.totalOutputTokens,
          totalThinkingTokens: aggregated.totalThinkingTokens,
          totalCachedTokens: aggregated.totalCachedTokens,
          toolCallRounds: aggregated.toolCallRounds,
          rounds: aggregated.rounds.length,
        });
      },
    });

  try {
    const text = deps.sessionALS
      ? await deps.sessionALS.run(resolvedSessionId, runChat)
      : await runChat();

    deps.taskProgress.finish(resolvedTaskId, 'done');
    deps.logger.info('chat turn done', {
      sessionId: resolvedSessionId,
      outputChars: text?.length ?? 0,
    });

    const { text: cleanText, actions } = extractPipelineActions(text || '');
    deps.transcript.append(resolvedSessionId, 'assistant', cleanText);
    emitTerminal({
      type: 'done',
      text: cleanText,
      sessionId: resolvedSessionId,
      actions,
    });
  } catch (agentError) {
    deps.taskProgress.finish(resolvedTaskId, 'error');
    const msg =
      agentError instanceof Error ? agentError.message : String(agentError);
    if (msg.includes('AbortError')) {
      deps.logger.warn('chat turn aborted', { sessionId: resolvedSessionId });
      emitTerminal({ type: 'error', error: 'Request cancelled' });
    } else {
      deps.logger.error('chat turn failed', {
        sessionId: resolvedSessionId,
        error: msg,
      });
      emitTerminal({ type: 'error', error: msg });
    }
  } finally {
    cleanup();
  }
}
