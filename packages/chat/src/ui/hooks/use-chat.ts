// ── @pipefx/chat/ui — useChat ────────────────────────────────────────────
// Thin React wrapper around the pure streaming-reducer in
// `@pipefx/chat/domain`. Owns the fetch/SSE plumbing + the React state
// cell; all event-to-state logic is delegated to `applyStreamEvent`.
//
// Side-effects that fall outside the reducer's view-state (pipeline
// actions, plan detection, navigation) are reported through injected
// callbacks so this hook stays desktop-agnostic.

import { useCallback, useReducer, useRef, useState } from 'react';
import { getAccessToken } from '@pipefx/auth/ui';
import type {
  PendingPlan,
  StreamEvent,
  SubAgentInfo,
  TodoItem,
  TranscriptMessage,
} from '../../contracts/types.js';
import {
  applyStreamEvent,
  finishTurn,
  initialStreamState,
  startTurn,
  type StreamState,
} from '../../domain/streaming-reducer.js';

// ── Reducer adapter ──────────────────────────────────────────────────────

type Action =
  | { kind: 'start'; input: Parameters<typeof startTurn>[1] }
  | { kind: 'event'; event: StreamEvent }
  | {
      kind: 'finish';
      outcome: 'done' | 'error' | 'abort';
      info?: Parameters<typeof finishTurn>[2];
    }
  | { kind: 'reset' }
  | { kind: 'set-messages'; messages: TranscriptMessage[] };

function reducer(state: StreamState, action: Action): StreamState {
  switch (action.kind) {
    case 'start':
      return startTurn(state, action.input);
    case 'event':
      return applyStreamEvent(state, action.event);
    case 'finish':
      return finishTurn(state, action.outcome, action.info);
    case 'reset':
      return initialStreamState();
    case 'set-messages':
      return {
        ...initialStreamState(),
        sessionId: state.sessionId,
        messages: action.messages,
      };
  }
}

// ── Hook ─────────────────────────────────────────────────────────────────

export interface UseChatDeps {
  selectedLlmModel: string;
  activeApp: string;
  activeProjectId: string;
  /** Passed through to the backend; opaque to the hook. */
  sessionId?: string | null;
  onSessionIdChange?: (sessionId: string) => void;
  onNavigate?: (view: string) => void;
  /** Fires once the turn completes, with the final assistant text, so the
   *  caller can detect plan blocks / update downstream UI. */
  onTurnComplete?: (finalText: string) => void;
  /** Pipeline-action dispatcher injected by the app. Called with the
   *  `actions` array from a `done` event. */
  dispatchPipelineActions?: (actions: unknown[]) => void;
  /** Base URL of the chat backend. Defaults to `http://localhost:3001`. */
  apiBase?: string;
}

const DEFAULT_API_BASE = 'http://localhost:3001';

/** Safety timeout for a single chat request (2 minutes). */
const STREAM_TIMEOUT = 120_000;

export interface UseChatResult {
  messages: TranscriptMessage[];
  isAiTyping: boolean;
  currentChatTaskId: string | null;
  sessionId: string | null;
  todos: TodoItem[];
  pendingPlan: PendingPlan | null;
  subAgents: SubAgentInfo[];
  sendMessage: (text: string, skill?: unknown) => Promise<void>;
  stopGeneration: () => void;
  clearChat: () => void;
  setMessages: (messages: TranscriptMessage[]) => void;
  /** Optimistic close of the plan modal — the `plan_resolved` SSE event
   *  will also clear it, but this keeps the UI snappy. */
  resolvePendingPlan: () => void;
}

export function useChat(deps: UseChatDeps): UseChatResult {
  const [state, dispatch] = useReducer(reducer, undefined, initialStreamState);
  // Tracks the most recent chat-turn taskId so the caller can render the
  // live Chain-of-Thought block keyed by it. Sticky across turns — the
  // reducer's activeAssistantId clears on `done`, but the UI still wants
  // to show the last turn's steps.
  const [currentChatTaskId, setCurrentChatTaskId] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const apiBase = deps.apiBase ?? DEFAULT_API_BASE;

  // A ref mirror of the latest messages for building the history payload
  // without re-creating `sendMessage` on every render.
  const messagesRef = useRef<TranscriptMessage[]>(state.messages);
  messagesRef.current = state.messages;

  const sendMessage = useCallback(
    async (text: string, skill?: unknown) => {
      if (!text.trim()) return;

      abortControllerRef.current = new AbortController();
      const timeoutId = setTimeout(() => {
        abortControllerRef.current?.abort();
      }, STREAM_TIMEOUT);

      const taskId = `chat-${Date.now()}`;
      const userId = `u-${Date.now()}`;
      const assistantId = `a-${Date.now() + 1}`;

      setCurrentChatTaskId(taskId);
      dispatch({
        kind: 'start',
        input: { userId, userText: text, assistantId, taskId },
      });

      // Snapshot history BEFORE the start-turn dispatch landed, so we don't
      // echo the just-appended user turn back to the backend.
      const historyPayload = messagesRef.current.map((m) => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: m.text }],
      }));

      let finalText = '';

      try {
        const token = await getAccessToken();

        const response = await fetch(`${apiBase}/chat/stream`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            message: text,
            skill,
            history: historyPayload,
            llmModel: deps.selectedLlmModel,
            activeApp: deps.activeApp,
            projectId: deps.activeProjectId || undefined,
            taskId,
            sessionId: deps.sessionId || undefined,
          }),
          signal: abortControllerRef.current.signal,
        });

        if (!response.ok || !response.body) {
          throw new Error('Failed to connect to AI Engine');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        let streamDone = false;
        while (!streamDone) {
          const { done, value } = await reader.read();
          if (done) {
            streamDone = true;
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            let event: StreamEvent;
            try {
              event = JSON.parse(line.slice(6)) as StreamEvent;
            } catch {
              continue;
            }

            // Side-effects that live outside the reducer's view-state.
            if (event.type === 'session' && event.sessionId) {
              deps.onSessionIdChange?.(event.sessionId);
            }
            if (event.type === 'done') {
              if (event.sessionId) deps.onSessionIdChange?.(event.sessionId);
              if (event.text && event.text.trim()) finalText = event.text;
              if (event.actions?.length) {
                deps.onNavigate?.('node-system');
                deps.dispatchPipelineActions?.(event.actions);
              }
            }
            if (event.type === 'chunk') {
              finalText += event.text;
            }

            dispatch({ kind: 'event', event });
          }
        }

        if (finalText) deps.onTurnComplete?.(finalText);
      } catch (error: unknown) {
        if ((error as { name?: string })?.name === 'AbortError') {
          dispatch({
            kind: 'finish',
            outcome: 'abort',
            info: { fallbackText: 'Agent stopped by user.' },
          });
        } else {
          // eslint-disable-next-line no-console
          console.error('Failed to chat:', error);
          dispatch({
            kind: 'finish',
            outcome: 'error',
            info: { errorText: 'Error connecting to the backend. Is it running?' },
          });
        }
      } finally {
        clearTimeout(timeoutId);
      }
    },
    [apiBase, deps]
  );

  const stopGeneration = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  const clearChat = useCallback(() => {
    dispatch({ kind: 'reset' });
    setCurrentChatTaskId(null);
  }, []);

  const setMessages = useCallback((messages: TranscriptMessage[]) => {
    dispatch({ kind: 'set-messages', messages });
  }, []);

  const resolvePendingPlan = useCallback(() => {
    // The reducer only clears pendingPlan on plan_resolved; callers that
    // want an optimistic close can trigger it by dispatching a synthetic
    // event. Safe because plan_resolved always arrives from the backend
    // afterwards.
    if (state.pendingPlan) {
      dispatch({
        kind: 'event',
        event: {
          type: 'plan_resolved',
          taskId: state.pendingPlan.taskId,
          approved: true,
        },
      });
    }
  }, [state.pendingPlan]);

  return {
    messages: state.messages,
    isAiTyping: state.isStreaming,
    currentChatTaskId,
    sessionId: state.sessionId,
    todos: state.todos,
    pendingPlan: state.pendingPlan,
    subAgents: state.subAgents,
    sendMessage,
    stopGeneration,
    clearChat,
    setMessages,
    resolvePendingPlan,
  };
}
