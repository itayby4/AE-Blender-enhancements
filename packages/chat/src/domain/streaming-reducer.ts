// ── @pipefx/chat/domain — streaming reducer ──────────────────────────────
// Pure state machine that folds a sequence of StreamEvents (plus a couple
// of local user-driven actions) into the view-state the chat UI renders.
//
// The reducer is intentionally narrow: it owns the turn transcript and the
// agent-system panels (todos / pending plan / sub-agents). It does NOT own
// usage aggregation or pipeline-action dispatch — those are side-effects
// the hook drives off the same event stream.

import type {
  PendingPlan,
  SessionId,
  StreamEvent,
  SubAgentInfo,
  TodoItem,
  TranscriptMessage,
} from '../contracts/types.js';

// ── State ────────────────────────────────────────────────────────────────

export interface CompactionInfo {
  removedCount: number;
  summary?: string;
}

export interface StreamState {
  sessionId: SessionId | null;
  messages: TranscriptMessage[];
  /** The id of the assistant message currently receiving chunks. `null`
   *  means no turn is in progress. */
  activeAssistantId: string | null;
  todos: TodoItem[];
  pendingPlan: PendingPlan | null;
  subAgents: SubAgentInfo[];
  lastError: string | null;
  lastCompaction: CompactionInfo | null;
  /** Pipeline actions extracted from the `done` event's payload. The UI
   *  dispatches these to the node editor — the reducer just surfaces them. */
  actions: unknown[];
  isStreaming: boolean;
}

export function initialStreamState(): StreamState {
  return {
    sessionId: null,
    messages: [],
    activeAssistantId: null,
    todos: [],
    pendingPlan: null,
    subAgents: [],
    lastError: null,
    lastCompaction: null,
    actions: [],
    isStreaming: false,
  };
}

// ── Turn boundaries (synchronous, UI-driven) ─────────────────────────────

export interface StartTurnInput {
  userId: string;
  userText: string;
  assistantId: string;
  taskId: string;
}

/** Append the user's message and a streaming-placeholder assistant message.
 *  Called synchronously before the fetch kicks off. */
export function startTurn(
  state: StreamState,
  input: StartTurnInput
): StreamState {
  const userMsg: TranscriptMessage = {
    id: input.userId,
    role: 'user',
    text: input.userText,
  };
  const assistantMsg: TranscriptMessage = {
    id: input.assistantId,
    role: 'assistant',
    text: '',
    taskId: input.taskId,
    isStreaming: true,
  };
  return {
    ...state,
    messages: [...state.messages, userMsg, assistantMsg],
    activeAssistantId: input.assistantId,
    lastError: null,
    actions: [],
    isStreaming: true,
  };
}

export type FinishOutcome = 'done' | 'error' | 'abort';

export interface FinishTurnInfo {
  /** Used when outcome === 'error' — replaces the placeholder text. */
  errorText?: string;
  /** Used when outcome === 'abort' — replaces the placeholder if nothing
   *  streamed. */
  fallbackText?: string;
}

export function finishTurn(
  state: StreamState,
  outcome: FinishOutcome,
  info: FinishTurnInfo = {}
): StreamState {
  const { activeAssistantId } = state;
  if (!activeAssistantId) {
    return { ...state, isStreaming: false };
  }

  const messages = state.messages.map((m) => {
    if (m.id !== activeAssistantId) return m;
    if (outcome === 'error') {
      return {
        ...m,
        text: info.errorText ?? m.text ?? 'An error occurred.',
        isStreaming: false,
      };
    }
    if (outcome === 'abort' && !m.text.trim()) {
      return {
        ...m,
        text: info.fallbackText ?? 'Stopped by user.',
        isStreaming: false,
      };
    }
    return { ...m, isStreaming: false };
  });

  return {
    ...state,
    messages,
    activeAssistantId: null,
    isStreaming: false,
  };
}

// ── SSE event application ────────────────────────────────────────────────

export function applyStreamEvent(
  state: StreamState,
  event: StreamEvent
): StreamState {
  switch (event.type) {
    case 'session':
      return { ...state, sessionId: event.sessionId };

    case 'chunk':
      return appendChunkToAssistant(state, event.text);

    case 'done':
      return applyDone(state, event);

    case 'error':
      return applyError(state, event.error);

    case 'compaction':
      return {
        ...state,
        lastCompaction: {
          removedCount: event.removedCount,
          summary: event.summary,
        },
      };

    case 'todo_updated':
      return { ...state, todos: event.todos };

    case 'plan_proposed':
      return applyPlanProposed(state, event);

    case 'plan_resolved':
      return state.pendingPlan?.taskId === event.taskId
        ? { ...state, pendingPlan: null }
        : state;

    case 'subagent_start':
      return applySubagentStart(state, event);

    case 'subagent_chunk':
      return mapSubAgent(state, event.taskId, (w) => ({
        ...w,
        lastChunk: (event.text ?? '').slice(-120),
        chunkCount: w.chunkCount + 1,
      }));

    case 'subagent_tool_start':
      return mapSubAgent(state, event.taskId, (w) => ({
        ...w,
        lastTool: event.name,
      }));

    case 'subagent_done':
      return mapSubAgent(state, event.taskId, (w) => ({
        ...w,
        status: 'done',
      }));

    case 'subagent_error':
      return mapSubAgent(state, event.taskId, (w) => ({
        ...w,
        status: 'error',
        error: event.message,
      }));

    // Events the reducer observes but doesn't reduce into view state:
    //   tool_start / tool_done — surfaced via the task manager
    //   thought                — optional UI feature, not in base state
    //   subagent_tool_done     — tool_start already surfaced the name
    //   usage_round / usage_total — aggregated by a separate subscriber
    case 'tool_start':
    case 'tool_done':
    case 'thought':
    case 'subagent_tool_done':
    case 'usage_round':
    case 'usage_total':
      return state;

    default: {
      // exhaustiveness guard — if a new StreamEvent variant lands without a
      // case above, TS flags this assignment.
      const _exhaustive: never = event;
      void _exhaustive;
      return state;
    }
  }
}

// ── Internals ────────────────────────────────────────────────────────────

function appendChunkToAssistant(
  state: StreamState,
  text: string
): StreamState {
  const { activeAssistantId } = state;
  if (!activeAssistantId) return state;
  return {
    ...state,
    messages: state.messages.map((m) =>
      m.id === activeAssistantId ? { ...m, text: m.text + text } : m
    ),
  };
}

function applyDone(
  state: StreamState,
  event: Extract<StreamEvent, { type: 'done' }>
): StreamState {
  const { activeAssistantId } = state;
  const sessionId = event.sessionId ?? state.sessionId;
  const actions = event.actions ?? state.actions;

  if (!activeAssistantId) {
    return { ...state, sessionId, actions };
  }

  const messages = state.messages.map((m) => {
    if (m.id !== activeAssistantId) return m;
    if (event.text && event.text.trim()) {
      return { ...m, text: event.text, isStreaming: false };
    }
    if (!m.text.trim()) {
      return { ...m, text: 'Done.', isStreaming: false };
    }
    return { ...m, isStreaming: false };
  });

  return {
    ...state,
    sessionId,
    messages,
    actions,
    activeAssistantId: null,
    isStreaming: false,
  };
}

function applyError(state: StreamState, errorText: string): StreamState {
  const { activeAssistantId } = state;
  if (!activeAssistantId) {
    return { ...state, lastError: errorText };
  }
  return {
    ...state,
    lastError: errorText,
    messages: state.messages.map((m) =>
      m.id === activeAssistantId
        ? { ...m, text: errorText || 'An error occurred.', isStreaming: false }
        : m
    ),
    activeAssistantId: null,
    isStreaming: false,
  };
}

function applyPlanProposed(
  state: StreamState,
  event: Extract<StreamEvent, { type: 'plan_proposed' }>
): StreamState {
  const sid = event.sessionId ?? state.sessionId;
  if (!sid || !event.taskId || !event.plan) return state;
  return {
    ...state,
    pendingPlan: {
      sessionId: sid,
      taskId: event.taskId,
      plan: event.plan,
    },
  };
}

function applySubagentStart(
  state: StreamState,
  event: Extract<StreamEvent, { type: 'subagent_start' }>
): StreamState {
  if (state.subAgents.some((w) => w.taskId === event.taskId)) return state;
  const next: SubAgentInfo = {
    taskId: event.taskId,
    description: event.description || '(no description)',
    status: 'running',
    chunkCount: 0,
  };
  return { ...state, subAgents: [...state.subAgents, next] };
}

function mapSubAgent(
  state: StreamState,
  taskId: string,
  f: (w: SubAgentInfo) => SubAgentInfo
): StreamState {
  return {
    ...state,
    subAgents: state.subAgents.map((w) => (w.taskId === taskId ? f(w) : w)),
  };
}
