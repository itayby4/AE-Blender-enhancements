import { CheckCircle2, Circle, ListChecks } from 'lucide-react';
import { cn } from '../lib/utils.js';
import { TerminalSpinner } from './ui/TerminalSpinner.js';
import type { TodoItem } from '../hooks/useChat.js';

interface TodoListPanelProps {
  todos: TodoItem[];
  className?: string;
}

/**
 * Live Todo list — updated in real-time by the `todo_updated` SSE event
 * emitted by the agent's TodoWrite tool handler.
 *
 * Renders compact, inline with the chat flow. Highlights the currently
 * in-progress item (showing its `activeForm`).
 */
export function TodoListPanel({ todos, className }: TodoListPanelProps) {
  if (!todos || todos.length === 0) return null;

  const completedCount = todos.filter((t) => t.status === 'completed').length;
  const total = todos.length;

  return (
    <div
      className={cn(
        'rounded-xl border border-border/40 bg-muted/20 overflow-hidden',
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/30 bg-muted/30">
        <div className="flex items-center gap-1.5">
          <ListChecks className="h-3.5 w-3.5 text-primary" />
          <span className="text-[11px] font-semibold uppercase tracking-wider text-primary">
            Plan
          </span>
        </div>
        <span className="text-[11px] text-muted-foreground font-mono">
          {completedCount}/{total}
        </span>
      </div>

      {/* Items */}
      <ul className="divide-y divide-border/20">
        {todos.map((todo, idx) => {
          const label =
            todo.status === 'in_progress' ? todo.activeForm : todo.content;
          return (
            <li
              key={idx}
              className={cn(
                'flex items-start gap-2.5 px-3 py-2 text-[12.5px] transition-colors',
                todo.status === 'in_progress' && 'bg-primary/5',
                todo.status === 'completed' && 'text-muted-foreground'
              )}
            >
              {/* Status icon */}
              <span className="shrink-0 mt-0.5 w-4 h-4 flex items-center justify-center">
                {todo.status === 'completed' ? (
                  <CheckCircle2 className="h-4 w-4 text-success" />
                ) : todo.status === 'in_progress' ? (
                  <TerminalSpinner
                    bare
                    className="w-4 h-4 text-primary text-[13px] justify-center"
                  />
                ) : (
                  <Circle className="h-4 w-4 text-muted-foreground/40" />
                )}
              </span>

              {/* Label */}
              <span
                className={cn(
                  'leading-relaxed flex-1 min-w-0 break-words',
                  todo.status === 'in_progress' &&
                    'text-foreground font-medium',
                  todo.status === 'completed' && 'line-through decoration-muted-foreground/40'
                )}
              >
                {label}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
