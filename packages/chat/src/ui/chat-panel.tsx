import {
  useState,
  useRef,
  useEffect,
  useCallback,
  type ChangeEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import {
  Send,
  Square,
  CheckCircle2,
  XCircle,
  Circle,
  ChevronDown,
  ChevronRight,
  History,
  PlusCircle,
  Trash2,
  Brain,
  Copy,
  ThumbsUp,
  ThumbsDown,
  Clock,
} from 'lucide-react';
import {
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
  ScrollArea,
  TerminalSpinner,
  Textarea,
  cn,
} from '@pipefx/ui-kit';
import { getAccessToken } from '@pipefx/auth/ui';
import { SkillBuilderCard } from '@pipefx/skills/ui';
import type { InstalledSkill } from '@pipefx/skills/contracts';
import type { TaskDTO } from '@pipefx/tasks';
import type {
  ChatSession,
  TranscriptMessage,
  TodoItem,
  SubAgentInfo,
} from '../contracts/types.js';
import { parseMessageContent, ChatCard } from './chat-card.js';
import { ChatHeroState } from './chat-hero-state.js';
import { TodoListPanel } from './todo-list-panel.js';
import { SubAgentActivity } from './sub-agent-activity.js';

interface ChatPanelProps {
  messages: TranscriptMessage[];
  isTyping: boolean;
  currentTaskId: string | null;
  taskMap: Map<string, TaskDTO>;
  activeTasks: TaskDTO[];
  selectedLlmModel: string;
  selectedSkillId: string;
  chatInput: string;
  onChatInputChange: (value: string) => void;
  /** Receives only the user-typed text; legacy `overrideSkill` second
   *  parameter is host-driven and not surfaced from the panel. */
  onSendMessage: (text: string) => void;
  onStopGeneration: () => void;
  onClearChat: () => void;
  onSelectSkill: (skillId: string) => void;
  onSelectModel: (model: string) => void;
  onNavigate: (view: string) => void;
  onPlanNavigate: (content: string) => void;
  /** Phase 12.14: fired when the inline `SkillBuilderCard` finishes
   *  installing a fresh chat-authored skill. The host wires this to its
   *  `useSkills().refresh()` + sets editor state so the user can iterate. */
  onSkillCreated?: (record: InstalledSkill) => void;
  // History
  chatSessions: ChatSession[];
  onLoadSession: (sessionId: string) => void;
  onDeleteSession: (sessionId: string) => void;
  onNewSession: () => void;
  activeSessionId: string | null;
  // Agent-system surface (from useChat)
  todos?: TodoItem[];
  subAgents?: SubAgentInfo[];
  /** Optional brand mark rendered inside `ChatHeroState`. The chat
   *  package is brand-agnostic — hosts pass their own logo node. */
  heroLogo?: ReactNode;
}

/**
 * ChatPanel — The hero panel of the Command Center.
 * Contains the message list, Chain of Thought blocks, and input area.
 * Designed as the primary workspace following the Bento layout.
 */
export function ChatPanel({
  messages,
  isTyping,
  currentTaskId,
  taskMap,
  activeTasks,
  selectedLlmModel,
  selectedSkillId,
  chatInput,
  onChatInputChange,
  onSendMessage,
  onStopGeneration,
  onClearChat,
  onSelectSkill,
  onSelectModel,
  onNavigate,
  onPlanNavigate,
  onSkillCreated,
  chatSessions,
  onLoadSession,
  onDeleteSession,
  onNewSession,
  activeSessionId,
  todos,
  subAgents,
  heroLogo,
}: ChatPanelProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [expandedThoughts, setExpandedThoughts] = useState<Set<string>>(new Set());

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  // `filteredSkills` lived here for the v1 SkillAutocomplete (now
  // retired). Kept the props (`skills`, `activeApp`) on the interface
  // for callers; underscore-prefixed to silence unused-var lint.

  const toggleThought = (taskId: string) => {
    setExpandedThoughts((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  };

  const handleInputChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    onChatInputChange(val);

    if (selectedSkillId !== 'default' && !val.startsWith('/')) {
      onSelectSkill('default');
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // While the v2 SkillQuickFilter is open it intercepts Enter / Esc /
    // arrows in the capture phase — so we don't need a guard here. A
    // bare Enter (no Shift, popover closed) submits.
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSend = () => {
    if (!chatInput.trim() || isTyping) return;
    let text = chatInput;
    const match = text.match(/^\/([^\s]+)\s*/);
    if (match) text = text.substring(match[0].length).trim();
    if (!text) return;
    onChatInputChange('');
    onSendMessage(text);
  };

  // Copy message text to clipboard
  const handleCopy = useCallback((text: string) => {
    navigator.clipboard.writeText(text);
  }, []);

  // Whether to show the cinematic hero state
  const showHero = messages.length === 0 && !isTyping;

  return (
    <div className="@container flex flex-col h-full bg-card rounded-xl border overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 px-3 @[360px]:px-4 py-3 border-b bg-card shrink-0 min-w-0">
        <h2 className="text-sm font-semibold text-foreground tracking-tight truncate">AI Chat</h2>
        <div className="flex items-center gap-2 shrink-0">
          {/* Model select — hidden when chat panel is narrow */}
          <select
            className="hidden @[380px]:block bg-muted text-xs border border-border/50 rounded-lg px-2.5 py-1.5 focus:ring-1 focus:ring-primary/50 outline-none text-muted-foreground font-medium max-w-[160px] truncate"
            value={selectedLlmModel}
            onChange={(e) => onSelectModel(e.target.value)}
          >
            <option value="gemini-3.1-pro-preview">Gemini 3.1 Pro</option>
            <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
            <option value="gpt-5.4">GPT-5.4</option>
            <option value="claude-sonnet-4.6">Claude Sonnet 4.6</option>
          </select>
          {/* History popover — replaces the trash bin */}
          <Popover open={isHistoryOpen} onOpenChange={setIsHistoryOpen}>
            <PopoverTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-foreground relative"
                  title="Chat History"
                />
              }
            >
              <History className="h-3.5 w-3.5" />
              {chatSessions.length > 0 && (
                <span className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-primary" />
              )}
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72 p-0 overflow-hidden" sideOffset={6}>
              {/* Popover header */}
              <div className="flex items-center justify-between px-3 py-2.5 border-b">
                <span className="text-xs font-semibold text-foreground tracking-tight">Chat History</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs gap-1.5 text-primary hover:text-primary hover:bg-primary/10"
                  onClick={() => {
                    onNewSession();
                    onClearChat();
                    setIsHistoryOpen(false);
                  }}
                >
                  <PlusCircle className="h-3 w-3" />
                  New Chat
                </Button>
              </div>

              {/* Session list */}
              <ScrollArea className="max-h-72">
                {chatSessions.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 py-8 px-4 text-center">
                    <Clock className="h-7 w-7 text-muted-foreground/40" />
                    <p className="text-xs text-muted-foreground">No previous chats yet.</p>
                    <p className="text-[11px] text-muted-foreground/60">Conversations are saved automatically.</p>
                  </div>
                ) : (
                  <div className="py-1">
                    {chatSessions.map((session) => (
                      <div
                        key={session.id}
                        className={cn(
                          'flex items-center gap-2 px-3 py-2.5 group cursor-pointer hover:bg-muted/50 transition-colors',
                          session.id === activeSessionId && 'bg-primary/8 border-l-2 border-primary pl-2.5'
                        )}
                        onClick={() => {
                          onLoadSession(session.id);
                          setIsHistoryOpen(false);
                        }}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-medium text-foreground truncate leading-snug">
                            {session.title || 'Untitled'}
                          </p>
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            {new Date(session.updatedAt).toLocaleDateString(undefined, {
                              month: 'short', day: 'numeric',
                              hour: '2-digit', minute: '2-digit',
                            })}
                            {' · '}{session.messageCount} msgs
                          </p>
                        </div>
                        <button
                          className="shrink-0 p-1 rounded-md text-muted-foreground/30 hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-all"
                          title="Delete session"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteSession(session.id);
                          }}
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Hero state — cinematic first impression */}
      {showHero && (
        <ChatHeroState
          logo={heroLogo}
          onAction={(prompt) => {
            onChatInputChange(prompt);
            onSendMessage(prompt);
          }}
        />
      )}

      {/* Messages — regular chat interface */}
      {!showHero && (
      <ScrollArea className="flex-1 min-h-0 relative">
        <div className="flex flex-col gap-1 p-5 pb-4 chat-content-width mx-auto">
          {messages.map((msg, msgIdx) => {
            // Group consecutive user messages; show separator between user/ai
            const prevMsg = msgIdx > 0 ? messages[msgIdx - 1] : null;
            const showSenderSwitch = prevMsg && prevMsg.role !== msg.role;

            return (
            <div key={msg.id} className="flex flex-col">
              {/* Visual separator when switching between user/ai */}
              {showSenderSwitch && <div className="h-3" />}

              {msg.role === 'user' ? (
                /* ── User Message ── Clean right-aligned chat bubble */
                <div className="flex justify-end mt-1 first:mt-0 group">
                  <div
                    className={cn(
                      'max-w-[85%] rounded-2xl rounded-br-md px-4 py-2.5',
                      'bg-primary/10 text-foreground',
                      'text-[14px] leading-relaxed',
                      'select-text cursor-text whitespace-pre-wrap break-words'
                    )}
                  >
                    {msg.text}
                  </div>
                </div>
              ) : (
                /* ── AI Response ── Avatar + clean content */
                <div className="flex gap-3 group mt-1">
                  {/* Avatar */}
                  <div className="h-7 w-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 bg-primary/10 border border-primary/25 text-primary">
                    <span className="text-[11px] font-bold leading-none select-none">◈</span>
                  </div>
                  {/* Content */}
                  <div className="flex-1 min-w-0 pt-0.5 pb-1">
                    <div className="text-[14px] text-foreground/90 leading-relaxed select-text cursor-text">
                    {/* Loading spinner while waiting for first chunk */}
                    {!msg.text.trim() && isTyping ? (
                      <div className="flex items-center gap-2 py-0.5 text-primary/80">
                        <TerminalSpinner bare className="text-[14px]" />
                        <span className="text-[12px] text-muted-foreground">thinking...</span>
                      </div>
                    ) : (
                    <div className="space-y-2.5">
                      {parseMessageContent(msg.text).map((part, i) => {
                        if (typeof part === 'string') {
                          if (!part.trim()) return null;
                          return (
                            <div key={i} style={{ whiteSpace: 'pre-wrap' }}>
                              {part}
                            </div>
                          );
                        }
                        if (part.type === 'card') {
                          return (
                            <ChatCard
                              key={i}
                              card={part}
                              onAction={(actionName, params) => {
                                onChatInputChange(
                                  `[Action executed: ${actionName} with params ${JSON.stringify(params)}]\n\nPlease process this action and return the result.`
                                );
                              }}
                            />
                          );
                        }
                        if (part.type === 'skill') {
                          // Phase 12.14: chat-driven skill author. The
                          // assistant emits a fenced ```md block with v2
                          // SKILL.md frontmatter; SkillBuilderCard parses
                          // it, shows id/name/mode badges + a Save button,
                          // and POSTs `/api/skills/install-text`. Replaces
                          // the 12.2 stub `<pre>` with the real card.
                          return (
                            <SkillBuilderCard
                              key={i}
                              content={part.content}
                              getToken={getAccessToken}
                              onSaved={(record) => {
                                onSkillCreated?.(record);
                              }}
                            />
                          );
                        }
                        if (part.type === 'plan') {
                          return (
                            <div key={i} className="mt-2">
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => onPlanNavigate((part as any).content)}
                                className="w-full justify-start gap-2 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20"
                              >
                                View Implementation Plan
                              </Button>
                            </div>
                          );
                        }
                        return null;
                      })}
                    </div>
                    )}
                    </div>

                    {/* Inline feedback actions — only show after message is complete */}
                    {msg.text.trim() && !isTyping && (
                    <div className="msg-actions flex items-center gap-0.5 mt-1.5 -ml-1">
                      <button
                        onClick={() => handleCopy(msg.text)}
                        className="p-1.5 rounded-md text-muted-foreground/50 hover:text-foreground hover:bg-muted/60 transition-colors"
                        title="Copy message"
                      >
                        <Copy className="w-3 h-3" />
                      </button>
                      <button
                        className="p-1.5 rounded-md text-muted-foreground/50 hover:text-success hover:bg-success/10 transition-colors"
                        title="Good response"
                      >
                        <ThumbsUp className="w-3 h-3" />
                      </button>
                      <button
                        className="p-1.5 rounded-md text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 transition-colors"
                        title="Bad response"
                      >
                        <ThumbsDown className="w-3 h-3" />
                      </button>
                    </div>
                    )}
                  </div>
                </div>
              )}

              {/* Chain of Thought block — Warp-style */}
              {msg.role === 'assistant' && msg.taskId && taskMap.get(msg.taskId) && (() => {
                const task = taskMap.get(msg.taskId!)!;
                if (task.steps.length === 0) return null;
                const isExpanded = expandedThoughts.has(msg.taskId!);
                return (
                  <div className="ml-10 mt-1">
                    <button
                      onClick={() => toggleThought(msg.taskId!)}
                      className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors mb-1"
                    >
                      {isExpanded ? (
                        <ChevronDown className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5" />
                      )}
                      <span className="font-medium">
                        {task.steps.length} step{task.steps.length !== 1 ? 's' : ''}
                      </span>
                      {!isExpanded && (
                        <span className="text-muted-foreground/70">
                          — {task.steps[task.steps.length - 1]?.description}
                        </span>
                      )}
                    </button>
                    {isExpanded && (
                      <ChainOfThoughtBlock task={task} />
                    )}
                  </div>
                );
              })()}
            </div>
          );
          })}

          {/* Live Chain of Thought while typing */}
          {isTyping && currentTaskId && taskMap.get(currentTaskId) && (
            <div className="ml-6 mt-1">
              <ChainOfThoughtBlock task={taskMap.get(currentTaskId)!} isLive />
            </div>
          )}

          {/* ── Agent-system panels (Todo list + live sub-agents) ── */}
          {todos && todos.length > 0 && (
            <div className="ml-6 mt-2">
              <TodoListPanel todos={todos} />
            </div>
          )}
          {subAgents && subAgents.length > 0 && (
            <div className="ml-6 mt-2">
              <SubAgentActivity subAgents={subAgents} />
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>
      )}

      {/* Input Area — elevated glass effect */}
      <div className="px-3 py-3 @[360px]:p-4 border-t border-border/50 shrink-0" style={{ background: 'linear-gradient(to top, var(--card), transparent)' }}>
        <div className="relative chat-content-width mx-auto">
          {/* v1 SkillAutocomplete retired in 12.10.5 — replaced by
              `SkillQuickFilter`, mounted at the app shell. */}
          <div className="relative flex items-end">
            <Textarea
              id="chat-input"
              value={chatInput}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="Ask AI or type / to search skills..."
              className={cn(
                'pr-14 min-h-[46px] max-h-[150px] resize-none overflow-y-auto py-3 pl-4 flex-1 rounded-xl text-[14px] transition-colors',
                selectedSkillId !== 'default'
                  ? 'border-primary/50 bg-primary/5 focus-visible:ring-primary/30'
                  : 'bg-muted/25 border-border/50 focus-visible:ring-primary/50'
              )}
              disabled={isTyping}
            />
            {isTyping ? (
              <Button
                onClick={onStopGeneration}
                size="icon"
                variant="destructive"
                className="absolute right-2 bottom-2 h-8 w-8 rounded-lg"
                title="Stop Generation"
              >
                <Square className="h-3.5 w-3.5 fill-current" />
              </Button>
            ) : (
              <Button
                onClick={handleSend}
                size="icon"
                variant="ghost"
                className="absolute right-2 bottom-2 h-8 w-8 text-primary hover:bg-primary/10 rounded-lg"
                title="Send message (Enter)"
                disabled={isTyping}
              >
                <Send className="h-4 w-4" />
              </Button>
            )}
          </div>
          <div className="hidden @[320px]:block text-center mt-2 text-[11px] text-muted-foreground font-mono">
            <span className="text-muted-foreground/60">#</span>{' '}
            <kbd className="px-1.5 py-0.5 rounded-md bg-muted border text-[10px] font-mono font-semibold">
              /
            </kbd>{' '}
            search skills · <kbd className="px-1.5 py-0.5 rounded-md bg-muted border text-[10px] font-mono font-semibold">Enter</kbd> send
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
// Chain of Thought Block — Warp Terminal Style
// ═══════════════════════════════════════════

function ChainOfThoughtBlock({ task, isLive }: { task: TaskDTO; isLive?: boolean }) {
  return (
    <div
      className={cn(
        'rounded-xl border overflow-hidden',
        isLive ? 'border-primary/30 glow-accent-sm' : 'border-border/40'
      )}
    >
      {/* Steps */}
      <div className="divide-y divide-border/20">
        {task.steps.map((step, idx) => {
          const isActive = step.status === 'in-progress';
          return (
            <div
              key={idx}
              className={cn(
                'flex items-start gap-3 px-4 py-2.5 text-xs transition-colors',
                isActive ? 'bg-primary/5' : 'bg-muted/20'
              )}
            >
              {/* Status icon */}
              <div className="w-4 h-4 flex items-center justify-center shrink-0 mt-0.5">
                {step.status === 'done' ? (
                  <CheckCircle2 className="w-4 h-4 text-success" />
                ) : step.status === 'in-progress' ? (
                  <TerminalSpinner bare className="w-4 h-4 text-primary text-[13px] justify-center" />
                ) : step.status === 'error' || step.status === 'cancelled' ? (
                  <XCircle className="w-4 h-4 text-destructive" />
                ) : (
                  <Circle className="w-4 h-4 text-muted-foreground/40" />
                )}
              </div>
              {/* Description */}
              <span
                className={cn(
                  'leading-relaxed font-medium',
                  isActive ? 'text-foreground' : 'text-muted-foreground'
                )}
              >
                {step.description}
              </span>
            </div>
          );
        })}
      </div>

      {/* Thoughts (reasoning) */}
      {task.thoughts.length > 0 && (
        <div className="border-t border-border/20 px-4 py-3 bg-muted/10">
          <div className="flex items-center gap-1.5 mb-2">
            <Brain className="w-3 h-3 text-primary" />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-primary">
              Reasoning
            </span>
          </div>
          <div className="space-y-1">
            {task.thoughts.map((thought, idx) => (
              <p
                key={idx}
                className="text-[12px] text-muted-foreground leading-relaxed pl-3 border-l-2 border-primary/20 font-mono"
              >
                {thought}
              </p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
