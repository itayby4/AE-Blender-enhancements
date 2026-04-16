import { useState, useMemo, useRef, useEffect, useCallback, type ChangeEvent, type KeyboardEvent } from 'react';
import {
  Send,
  User,
  Bot,
  Loader2,
  Square,
  CheckCircle2,
  XCircle,
  Circle,
  ChevronDown,
  ChevronRight,
  Trash2,
  Brain,
  Copy,
  ThumbsUp,
  ThumbsDown,
} from 'lucide-react';
import { Button } from '../../components/ui/button.js';
import { ScrollArea } from '../../components/ui/scroll-area.js';
import { Textarea } from '../../components/ui/textarea.js';
import { cn } from '../../lib/utils.js';
import { parseMessageContent, ChatCard } from '../skills/ChatCard.js';
import { SkillBuilderCard } from '../skills/SkillBuilderCard.js';
import { SkillAutocomplete } from '../skills/SkillAutocomplete.js';
import type { ChatMessage } from '../../hooks/useChat.js';
import type { TaskDTO } from '@pipefx/tasks';
import type { Skill } from '../../lib/load-skills.js';
import { loadSkills } from '../../lib/load-skills.js';
import { ChatHeroState } from './ChatHeroState.js';

interface ChatPanelProps {
  messages: ChatMessage[];
  isTyping: boolean;
  currentTaskId: string | null;
  taskMap: Map<string, TaskDTO>;
  activeTasks: TaskDTO[];
  selectedLlmModel: string;
  selectedSkillId: string;
  skills: Skill[];
  activeApp: string;
  chatInput: string;
  onChatInputChange: (value: string) => void;
  onSendMessage: (text: string, overrideSkill?: Skill) => void;
  onStopGeneration: () => void;
  onClearChat: () => void;
  onSelectSkill: (skillId: string) => void;
  onSelectModel: (model: string) => void;
  onNavigate: (view: string) => void;
  onSkillsReloaded: (skills: Skill[]) => void;
  onPlanNavigate: (content: string) => void;
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
  skills,
  activeApp,
  chatInput,
  onChatInputChange,
  onSendMessage,
  onStopGeneration,
  onClearChat,
  onSelectSkill,
  onSelectModel,
  onNavigate,
  onSkillsReloaded,
  onPlanNavigate,
}: ChatPanelProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [isAutocompleteOpen, setIsAutocompleteOpen] = useState(false);
  const [autocompleteQuery, setAutocompleteQuery] = useState('');
  const [expandedThoughts, setExpandedThoughts] = useState<Set<string>>(new Set());

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  const filteredSkills = useMemo(
    () => skills.filter((s) => !s.compatibleApps || s.compatibleApps.length === 0 || s.compatibleApps.includes(activeApp)),
    [skills, activeApp]
  );

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

    if (val.startsWith('/') && val.indexOf(' ') === -1) {
      setIsAutocompleteOpen(true);
      setAutocompleteQuery(val.substring(1));
    } else {
      setIsAutocompleteOpen(false);
    }

    if (selectedSkillId !== 'default' && !val.startsWith('/')) {
      onSelectSkill('default');
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (isAutocompleteOpen) {
      if (['ArrowUp', 'ArrowDown', 'Enter', 'Escape'].includes(e.key)) {
        e.preventDefault();
        return;
      }
    }
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
    <div className="flex flex-col h-full bg-card rounded-xl border overflow-hidden animate-panel-enter">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-card shrink-0">
        <h2 className="text-sm font-semibold text-foreground tracking-tight">AI Chat</h2>
        <div className="flex items-center gap-2">
          <select
            className="bg-muted text-xs border border-border/50 rounded-lg px-2.5 py-1.5 focus:ring-1 focus:ring-primary/50 outline-none text-muted-foreground font-medium"
            value={selectedLlmModel}
            onChange={(e) => onSelectModel(e.target.value)}
          >
            <option value="gemini-3.1-pro-preview">Gemini 3.1 Pro</option>
            <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
            <option value="gpt-5.4">GPT-5.4</option>
            <option value="claude-sonnet-4.6">Claude Sonnet 4.6</option>
          </select>
          <Button
            onClick={onClearChat}
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-destructive"
            title="Clear Conversation"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Hero state — cinematic first impression */}
      {showHero && (
        <ChatHeroState
          onAction={(prompt) => {
            onChatInputChange(prompt);
            onSendMessage(prompt);
          }}
        />
      )}

      {/* Messages — regular chat interface */}
      {!showHero && (
      <ScrollArea className="flex-1 min-h-0 relative">
        {/* Background signal lines — reuses hero CSS animations, GPU-only */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
          {/* Horizontal signal flows */}
          <div className="absolute top-1/4 left-0 right-0 h-px opacity-[0.06] hero-line-h" />
          <div className="absolute top-3/4 left-0 right-0 h-px opacity-[0.05] hero-line-h-reverse" />
          {/* Vertical signal flows */}
          <div className="absolute left-1/3 top-0 bottom-0 w-px opacity-[0.05] hero-line-v" />
          <div className="absolute right-1/4 top-0 bottom-0 w-px opacity-[0.04] hero-line-v-reverse" />
          {/* Corner node intersections */}
          <div className="absolute top-1/4 left-1/3 w-1 h-1 rounded-full bg-primary opacity-[0.15] hero-node-pulse" />
          <div className="absolute top-3/4 right-1/4 w-1.5 h-1.5 rounded-full bg-primary opacity-[0.15] hero-node-pulse" style={{ animationDelay: '1.2s' }} />
          <div className="absolute top-1/4 right-1/4 w-1 h-1 rounded-full bg-primary opacity-[0.10] hero-node-pulse" style={{ animationDelay: '0.6s' }} />
          <div className="absolute top-3/4 left-1/3 w-1 h-1 rounded-full bg-primary opacity-[0.10] hero-node-pulse" style={{ animationDelay: '1.8s' }} />
        </div>
        <div className="flex flex-col gap-3 p-5 pb-4 chat-content-width mx-auto">
          {messages.map((msg) => (
            <div key={msg.id} className="flex flex-col">
              {msg.sender === 'user' ? (
                /* ── User Command Card ── */
                <div className="flex gap-3 group mt-5 first:mt-0">
                  {/* Avatar */}
                  <div className="h-8 w-8 rounded-xl flex items-center justify-center shrink-0 mt-1 bg-primary/15 text-primary border border-primary/30 shadow-sm">
                    <User className="h-3.5 w-3.5" />
                  </div>
                  {/* Card */}
                  <div className="flex-1 min-w-0 rounded-2xl bg-card border border-border shadow-sm overflow-hidden">
                    {/* Card accent + header */}
                    <div className="h-0.5 bg-gradient-to-r from-primary/50 via-primary/20 to-transparent" />
                    <div className="px-4 pt-2.5 pb-0.5">
                      <span className="text-[10px] font-bold text-primary tracking-[0.1em] uppercase">You</span>
                    </div>
                    {/* Card body */}
                    <div className="px-4 pt-1 pb-4 text-[14.5px] text-foreground font-medium leading-relaxed select-text cursor-text whitespace-pre-wrap">
                      {msg.text}
                    </div>
                  </div>
                </div>
              ) : (
                /* ── AI Response ── */
                <div className="flex gap-3 group mt-3">
                  {/* Avatar */}
                  <div className="h-8 w-8 rounded-xl flex items-center justify-center shrink-0 mt-1 bg-card border border-primary/30 text-primary shadow-sm relative">
                    <div className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300" style={{ boxShadow: '0 0 12px oklch(from var(--primary) l c h / 0.2)' }} />
                    <span className="font-mono text-[12px] font-bold leading-none select-none">◈</span>
                  </div>
                  {/* Content with left accent stripe */}
                  <div className="flex-1 min-w-0 border-l-2 border-primary/30 pl-4 py-1">
                    <div className="text-[10px] font-bold text-primary tracking-[0.1em] uppercase mb-2">PipeFX</div>
                    <div className="text-[14.5px] text-foreground/90 leading-relaxed select-text cursor-text">
                    <div className="space-y-3">
                      {parseMessageContent(msg.text).map((part, i) => {
                        if (typeof part === 'string') {
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
                          return (
                            <SkillBuilderCard
                              key={i}
                              content={part.content}
                              onSkillSaved={() => {
                                loadSkills().then(onSkillsReloaded);
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
                    </div>
                  </div>
                </div>
              )}

              {/* Inline message feedback — visible on hover */}
              {msg.sender === 'ai' && (
                <div className="pl-11 msg-actions flex items-center gap-1 mt-0.5">
                  <button
                    onClick={() => handleCopy(msg.text)}
                    className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                    title="Copy message"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                  <button
                    className="p-1.5 rounded-md text-muted-foreground hover:text-success hover:bg-success/10 transition-colors"
                    title="Good response"
                  >
                    <ThumbsUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                    title="Bad response"
                  >
                    <ThumbsDown className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {/* Chain of Thought block — Warp-style */}
              {msg.sender === 'ai' && msg.taskId && taskMap.get(msg.taskId) && (() => {
                const task = taskMap.get(msg.taskId!)!;
                if (task.steps.length === 0) return null;
                const isExpanded = expandedThoughts.has(msg.taskId!);
                return (
                  <div className="ml-11">
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
          ))}

          {/* Typing indicator with live CoT */}
          {isTyping && (
            <div className="flex flex-col gap-2">
              <div className="flex gap-3 text-[15px]">
                <div className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0 bg-muted border border-border/50">
                  <Bot className="h-4 w-4" />
                </div>
                <div className="py-3 px-4 rounded-2xl bg-muted/60 rounded-tl-md border border-border/30 text-muted-foreground flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary animate-thinking-pulse" style={{ animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-primary animate-thinking-pulse" style={{ animationDelay: '200ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-primary animate-thinking-pulse" style={{ animationDelay: '400ms' }} />
                </div>
              </div>

              {/* Live Chain of Thought while typing */}
              {currentTaskId && taskMap.get(currentTaskId) && (
                <div className="ml-11">
                  <ChainOfThoughtBlock task={taskMap.get(currentTaskId)!} isLive />
                </div>
              )}
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>
      )}

      {/* Input Area — elevated glass effect */}
      <div className="p-4 border-t border-border/50 shrink-0" style={{ background: 'linear-gradient(to top, var(--card), transparent)' }}>
        <div className="relative chat-content-width mx-auto">
          {isAutocompleteOpen && (
            <SkillAutocomplete
              skills={filteredSkills}
              query={autocompleteQuery}
              onSelect={(skill) => {
                setIsAutocompleteOpen(false);
                onSelectSkill(skill.id);
                if (skill.hasUI) {
                  onChatInputChange('');
                  onNavigate(skill.id);
                } else {
                  onChatInputChange(`/${skill.triggerCommand || skill.id} `);
                }
              }}
              onDismiss={() => {
                setIsAutocompleteOpen(false);
                onChatInputChange('');
              }}
            />
          )}
          <div className="relative flex items-end">
            <Textarea
              id="chat-input"
              value={chatInput}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="Ask AI or type / to search skills..."
              className={cn(
                'pr-12 min-h-[48px] max-h-[150px] resize-none overflow-y-auto py-3 px-4 flex-1 rounded-xl text-[15px] transition-all',
                selectedSkillId !== 'default'
                  ? 'border-primary/50 bg-primary/5 focus-visible:ring-primary/30'
                  : 'bg-muted/30 border-border/40 focus-visible:ring-primary/50',
                'focus-visible:shadow-[0_0_0_3px_oklch(from_var(--primary)_l_c_h_/_0.1)]'
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
          <div className="text-center mt-2 text-[11px] text-muted-foreground">
            Type{' '}
            <kbd className="px-1.5 py-0.5 rounded-md bg-muted border text-[10px] font-mono font-semibold">
              /
            </kbd>{' '}
            to search skills · Enter to send
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
                  <Loader2 className="w-4 h-4 text-primary animate-spin" />
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
