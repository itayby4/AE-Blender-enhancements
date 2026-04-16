import { useState, useRef, useCallback, useEffect } from 'react';
import { sendChat, type ChatPayload } from '../lib/api.js';
import type { Skill } from '../lib/load-skills.js';
import { parseMessageContent } from '../features/skills/ChatCard.js';
import { dispatchPipelineActions } from '../lib/pipeline-actions.js';

export interface ChatMessage {
  id: number;
  sender: 'user' | 'ai';
  text: string;
  taskId?: string;
}

const INITIAL_CHAT: ChatMessage[] = [];

/**
 * Hook: encapsulates all chat state and the send/abort logic.
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

      const payload: ChatPayload = {
        message: text,
        skill: activeSkillContext,
        history: historyPayload,
        llmModel: deps.selectedLlmModel,
        activeApp: deps.activeApp,
        projectId: deps.activeProjectId || undefined,
        taskId,
      };

      try {
        const data = await sendChat(payload, abortControllerRef.current.signal);

        const responseText = data.text?.trim()
          ? data.text
          : data.actions?.length
          ? `Generated ${data.actions.length} pipeline actions in the Node Editor.`
          : 'Done.';

        const aiMsg = { id: Date.now(), sender: 'ai' as const, text: responseText, taskId };
        setChatMessages((prev) => {
          const next = [...prev, aiMsg];
          // Auto-save to history after every AI response
          if (deps.sessionId && deps.onSaveSession) {
            deps.onSaveSession(deps.sessionId, next);
          }
          return next;
        });

        // Dispatch pipeline actions to node editor
        if (data.actions?.length) {
          deps.onNavigate?.('node-system');
          dispatchPipelineActions(data.actions);
        }

        // Detect plan blocks
        const parts = parseMessageContent(responseText);
        const planPart = parts.find(
          (p) => typeof p === 'object' && p.type === 'plan'
        );
        if (planPart) {
          deps.onPlanDetected?.((planPart as any).content);
        }

        setIsAiTyping(false);
      } catch (error: any) {
        if (error.name === 'AbortError' || error.status === 499) {
          setChatMessages((prev) => [
            ...prev,
            { id: Date.now(), sender: 'ai', text: 'Agent stopped by user.' },
          ]);
        } else {
          console.error('Failed to chat:', error);
          setChatMessages((prev) => [
            ...prev,
            {
              id: Date.now(),
              sender: 'ai',
              text: 'Error connecting to the backend. Is it running?',
            },
          ]);
        }
        setIsAiTyping(false);
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
