import { useState, useRef, useCallback } from 'react';
import type { Skill } from '../lib/load-skills.js';
import { parseMessageContent } from '../features/skills/ChatCard.js';
import { dispatchPipelineActions } from '../lib/pipeline-actions.js';
import { getAccessToken } from '../lib/auth-context.js';

export interface ChatMessage {
  id: number;
  sender: 'user' | 'ai';
  text: string;
  taskId?: string;
}

const INITIAL_CHAT: ChatMessage[] = [];
const API_BASE = 'http://localhost:3001';

/** Safety timeout for a single chat request (2 minutes). */
const STREAM_TIMEOUT = 120_000;

/**
 * Hook: encapsulates all chat state and the send/abort logic.
 * Uses SSE streaming to the `/chat/stream` endpoint.
 */
export function useChat(deps: {
  skills: Skill[];
  selectedSkillId: string;
  selectedLlmModel: string;
  activeApp: string;
  activeProjectId: string;
  onNavigate?: (view: string) => void;
  onPlanDetected?: (content: string) => void;
  // History integration
  sessionId?: string | null;
  onSessionIdChange?: (sessionId: string) => void;
  onSaveSession?: (sessionId: string, messages: ChatMessage[]) => void;
}) {
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(INITIAL_CHAT);
  const [isAiTyping, setIsAiTyping] = useState(false);
  const [currentChatTaskId, setCurrentChatTaskId] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const sendMessageToAi = useCallback(
    async (text: string, overrideSkill?: Skill) => {
      if (!text.trim() || isAiTyping) return;

      abortControllerRef.current = new AbortController();

      // Combine manual abort with a safety timeout
      const timeoutId = setTimeout(() => {
        abortControllerRef.current?.abort();
      }, STREAM_TIMEOUT);

      const newMsg: ChatMessage = { id: Date.now(), sender: 'user', text };
      setChatMessages((prev) => [...prev, newMsg]);
      setIsAiTyping(true);

      const activeSkillContext =
        overrideSkill ||
        (deps.skills.find((s) => s.id === deps.selectedSkillId) &&
        deps.selectedSkillId !== 'default'
          ? deps.skills.find((s) => s.id === deps.selectedSkillId)
          : undefined);

      // Send all previous messages as history context
      const historyPayload = chatMessages
        .map((m) => ({
          role: m.sender === 'user' ? 'user' : 'model',
          parts: [{ text: m.text }],
        }));

      const taskId = `chat-${Date.now()}`;
      setCurrentChatTaskId(taskId);

      // Create a placeholder AI message that we'll update with streaming text
      const aiMsgId = Date.now() + 1;
      setChatMessages((prev) => [
        ...prev,
        { id: aiMsgId, sender: 'ai', text: '', taskId },
      ]);

      let streamedText = '';

      try {
        // Get the current auth token for the SSE request
        const token = await getAccessToken();

        const response = await fetch(`${API_BASE}/chat/stream`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            message: text,
            skill: activeSkillContext,
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

        // Read SSE stream
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            try {
              const event = JSON.parse(line.slice(6));

              switch (event.type) {
                case 'chunk':
                  streamedText += event.text;
                  setChatMessages((prev) =>
                    prev.map((m) =>
                      m.id === aiMsgId ? { ...m, text: streamedText } : m
                    )
                  );
                  break;

                case 'tool_start':
                  // Tool calls are already handled by the TaskManager SSE
                  break;

                case 'tool_done':
                  break;

                case 'thought':
                  // Could show thoughts in the UI in the future
                  break;

                case 'done':
                  // Track session ID from backend
                  if (event.sessionId) {
                    deps.onSessionIdChange?.(event.sessionId);
                  }
                  // Final text — update with the complete response
                  if (event.text && event.text.trim()) {
                    setChatMessages((prev) =>
                      prev.map((m) =>
                        m.id === aiMsgId
                          ? { ...m, text: event.text }
                          : m
                      )
                    );
                    streamedText = event.text;
                  } else if (!streamedText.trim()) {
                    setChatMessages((prev) =>
                      prev.map((m) =>
                        m.id === aiMsgId
                          ? { ...m, text: 'Done.' }
                          : m
                      )
                    );
                  }

                  // Dispatch pipeline actions to node editor
                  if (event.actions?.length) {
                    deps.onNavigate?.('node-system');
                    dispatchPipelineActions(event.actions);
                  }
                  break;

                case 'error':
                  setChatMessages((prev) =>
                    prev.map((m) =>
                      m.id === aiMsgId
                        ? { ...m, text: event.error || 'An error occurred.' }
                        : m
                    )
                  );
                  break;

                case 'compaction':
                  // Context compaction occurred — log it
                  console.log(`[Compaction] Removed ${event.removedCount} older messages`);
                  break;
              }
            } catch (_e) {
              // Ignore malformed SSE lines
            }
          }
        }

        // Detect plan blocks in final response
        const finalText = streamedText;
        if (finalText) {
          const parts = parseMessageContent(finalText);
          const planPart = parts.find(
            (p) => typeof p === 'object' && p.type === 'plan'
          );
          if (planPart) {
            deps.onPlanDetected?.((planPart as any).content);
          }
        }

        setIsAiTyping(false);
      } catch (error: any) {
        if (error.name === 'AbortError') {
          setChatMessages((prev) =>
            prev.map((m) =>
              m.id === aiMsgId
                ? { ...m, text: streamedText || 'Agent stopped by user.' }
                : m
            )
          );
        } else {
          console.error('Failed to chat:', error);
          setChatMessages((prev) =>
            prev.map((m) =>
              m.id === aiMsgId
                ? { ...m, text: 'Error connecting to the backend. Is it running?' }
                : m
            )
          );
        }
        setIsAiTyping(false);
      } finally {
        clearTimeout(timeoutId);
      }
    },
    [isAiTyping, chatMessages, deps]
  );

  const stopGeneration = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  const clearChat = useCallback(() => {
    setChatMessages(INITIAL_CHAT);
    setCurrentChatTaskId(null);
  }, []);

  return {
    chatMessages,
    setChatMessages,
    isAiTyping,
    currentChatTaskId,
    sendMessageToAi,
    stopGeneration,
    clearChat,
  };
}
