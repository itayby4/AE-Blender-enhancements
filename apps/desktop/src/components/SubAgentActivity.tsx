import { useState } from 'react';
import {
  Bot,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Wrench,
} from 'lucide-react';
import { cn } from '../lib/utils.js';
import { TerminalSpinner } from './ui/TerminalSpinner.js';
import type { SubAgentInfo } from '../hooks/useChat.js';

interface SubAgentActivityProps {
  subAgents: SubAgentInfo[];
  className?: string;
}

/**
 * Live running-workers panel. Shows each sub-agent spawned by AgentTool
 * with its current status, last tool called, and last streamed chunk.
 *
 * Driven by `subagent_start|chunk|tool_start|tool_done|done|error` SSE
 * events tagged by the worker's `taskId`.
 */
export function SubAgentActivity({
  subAgents,
  className,
}: SubAgentActivityProps) {
  const [expanded, setExpanded] = useState(true);

  if (!subAgents || subAgents.length === 0) return null;

  const running = subAgents.filter((w) => w.status === 'running').length;
  const done = subAgents.filter((w) => w.status === 'done').length;
  const errored = subAgents.filter((w) => w.status === 'error').length;

  return (
    <div
      className={cn(
        'rounded-xl border border-border/40 bg-muted/15 overflow-hidden',
        className
      )}
    >
      {/* Header — click to toggle */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2 border-b border-border/30 bg-muted/30 hover:bg-muted/50 transition-colors"
      >
        <div className="flex items-center gap-1.5">
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
          )}
          <Bot className="h-3.5 w-3.5 text-primary" />
          <span className="text-[11px] font-semibold uppercase tracking-wider text-primary">
            Sub-agents
          </span>
        </div>
        <div className="flex items-center gap-2 text-[11px] font-mono text-muted-foreground">
          {running > 0 && (
            <span className="flex items-center gap-1 text-primary">
              <TerminalSpinner bare className="text-[11px]" />
              {running}
            </span>
          )}
          {done > 0 && (
            <span className="flex items-center gap-1 text-success">
              <CheckCircle2 className="h-3 w-3" />
              {done}
            </span>
          )}
          {errored > 0 && (
            <span className="flex items-center gap-1 text-destructive">
              <XCircle className="h-3 w-3" />
              {errored}
            </span>
          )}
        </div>
      </button>

      {/* Worker list */}
      {expanded && (
        <ul className="divide-y divide-border/20">
          {subAgents.map((worker) => (
            <li
              key={worker.taskId}
              className={cn(
                'px-3 py-2.5 text-[12.5px] transition-colors',
                worker.status === 'running' && 'bg-primary/5',
                worker.status === 'error' && 'bg-destructive/5'
              )}
            >
              {/* Row 1: status + description */}
              <div className="flex items-start gap-2.5">
                <span className="shrink-0 mt-0.5 w-4 h-4 flex items-center justify-center">
                  {worker.status === 'done' ? (
                    <CheckCircle2 className="h-4 w-4 text-success" />
                  ) : worker.status === 'error' ? (
                    <XCircle className="h-4 w-4 text-destructive" />
                  ) : (
                    <TerminalSpinner
                      bare
                      className="w-4 h-4 text-primary text-[13px] justify-center"
                    />
                  )}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        'font-medium text-foreground/90 truncate',
                        worker.status === 'done' && 'text-muted-foreground'
                      )}
                    >
                      {worker.description}
                    </span>
                    <span className="text-[10px] font-mono text-muted-foreground/70 shrink-0">
                      {worker.taskId.slice(-6)}
                    </span>
                  </div>

                  {/* Last tool */}
                  {worker.lastTool && worker.status === 'running' && (
                    <div className="flex items-center gap-1.5 mt-1 text-[11px] text-muted-foreground">
                      <Wrench className="h-3 w-3" />
                      <span className="font-mono">{worker.lastTool}</span>
                    </div>
                  )}

                  {/* Last chunk preview (bounded to 120 chars upstream) */}
                  {worker.lastChunk && worker.status === 'running' && (
                    <p className="mt-1 text-[11px] text-muted-foreground/80 font-mono leading-relaxed break-words line-clamp-2 border-l-2 border-primary/20 pl-2">
                      {worker.lastChunk}
                    </p>
                  )}

                  {/* Error message */}
                  {worker.status === 'error' && worker.error && (
                    <p className="mt-1 text-[11px] text-destructive break-words">
                      {worker.error}
                    </p>
                  )}

                  {/* Chunk count for finished workers */}
                  {worker.status !== 'running' && worker.chunkCount > 0 && (
                    <p className="mt-0.5 text-[10px] text-muted-foreground/60 font-mono">
                      {worker.chunkCount} chunks streamed
                    </p>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
