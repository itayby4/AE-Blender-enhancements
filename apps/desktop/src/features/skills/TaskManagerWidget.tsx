import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '../../components/ui/card';
import { CheckCircle2, Circle, Loader2, XCircle, X, Brain, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useState } from 'react';
import type { TaskDTO } from '@pipefx/tasks';

export function TaskManagerWidget({
  tasks,
  isMinimized,
  onMinimize,
}: {
  tasks: TaskDTO[];
  isMinimized: boolean;
  onMinimize: () => void;
}) {
  const manualTasks = tasks.filter((t) => !t.id.startsWith('chat-'));

  if (manualTasks.length === 0) return null;
  if (isMinimized) return null;

  return (
    <div className="fixed bottom-4 left-4 z-[100] w-80 max-h-[50vh] flex flex-col bg-background/95 backdrop-blur-xl shadow-2xl rounded-xl border border-border/60 overflow-hidden">
      {/* Header bar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/40 bg-muted/30 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Task Manager
          </span>
          <span className="text-[10px] text-muted-foreground/60 font-mono">
            {manualTasks.length}
          </span>
        </div>
        <div className="flex items-center gap-0.5">
          <button
            onClick={onMinimize}
            className="h-5 w-5 flex items-center justify-center rounded hover:bg-muted-foreground/20 text-muted-foreground transition-colors"
            title="Minimize"
          >
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() =>
              fetch('http://localhost:3001/api/tasks/clear', {
                method: 'POST',
              })
            }
            className="h-5 w-5 flex items-center justify-center rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors"
            title="Clear All Tasks"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Task list */}
      <div className="flex flex-col gap-1.5 p-2 overflow-y-auto">
        {manualTasks.map((task) => (
          <TaskCard key={task.id} task={task} />
        ))}
      </div>
    </div>
  );
}

function TaskCard({ task }: { task: TaskDTO }) {
  const [showThoughts, setShowThoughts] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <Card className="border-border/40 bg-card/80 shadow-sm overflow-hidden">
      <CardHeader className="p-2 pb-1.5 flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-[11px] font-medium flex items-center gap-1.5 truncate">
          <StatusIcon status={task.status} />
          <span className="truncate">{task.name}</span>
        </CardTitle>
        <div className="flex items-center gap-0.5 shrink-0 ml-1">
          {task.thoughts.length > 0 && (
            <button
              onClick={() => setShowThoughts(!showThoughts)}
              className={cn(
                'h-4 w-4 rounded flex items-center justify-center transition-colors',
                showThoughts
                  ? 'bg-primary/20 text-primary'
                  : 'text-muted-foreground hover:bg-muted-foreground/20'
              )}
              title={showThoughts ? 'Hide AI Reasoning' : 'Show AI Reasoning'}
            >
              <Brain className="w-2.5 h-2.5" />
            </button>
          )}
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="h-4 w-4 rounded flex items-center justify-center text-muted-foreground hover:bg-muted-foreground/20 transition-colors"
          >
            {isCollapsed ? <ChevronDown className="w-2.5 h-2.5" /> : <ChevronUp className="w-2.5 h-2.5" />}
          </button>
          {(task.status === 'in-progress' || task.status === 'pending') && (
            <button
              onClick={() => {
                fetch('http://localhost:3001/api/tasks/cancel', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ taskId: task.id }),
                });
              }}
              className="h-4 w-4 rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive flex items-center justify-center transition-colors"
              title="Cancel Task"
            >
              <XCircle className="w-2.5 h-2.5" />
            </button>
          )}
        </div>
      </CardHeader>

      {!isCollapsed && (
        <CardContent className="px-2 pb-2 pt-0">
          {/* Steps */}
          {task.steps.length > 0 && (
            <div className="flex flex-col gap-1 relative ml-0.5">
              <div className="absolute left-[5px] top-1.5 bottom-1.5 w-px bg-border/50 -z-10" />
              {task.steps.map((step, idx) => (
                <div key={idx} className="flex items-start gap-1.5 text-[10px]">
                  <div className="w-3 h-3 rounded-full flex items-center justify-center shrink-0 mt-px bg-card">
                    <StatusIcon status={step.status} size="sm" />
                  </div>
                  <span
                    className={cn(
                      'leading-snug transition-colors',
                      step.status === 'done'
                        ? 'text-muted-foreground line-through'
                        : step.status === 'in-progress'
                        ? 'text-foreground font-medium'
                        : 'text-muted-foreground'
                    )}
                  >
                    {step.description}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Chain of Thought panel */}
          {showThoughts && task.thoughts.length > 0 && (
            <div className="mt-1.5 border-t border-border/30 pt-1.5">
              <div className="flex items-center gap-1 mb-1">
                <Brain className="w-2.5 h-2.5 text-primary" />
                <span className="text-[9px] font-semibold uppercase tracking-wider text-primary">
                  AI Reasoning
                </span>
              </div>
              <div className="flex flex-col gap-1 max-h-24 overflow-y-auto">
                {task.thoughts.map((thought, idx) => (
                  <p
                    key={idx}
                    className="text-[10px] text-muted-foreground leading-relaxed bg-muted/30 rounded px-1.5 py-1 border border-border/20"
                  >
                    {thought}
                  </p>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

function StatusIcon({ status, size = 'md' }: { status: string; size?: 'sm' | 'md' }) {
  const cls = size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5';
  switch (status) {
    case 'in-progress':
      return <Loader2 className={cn(cls, 'text-primary animate-spin')} />;
    case 'done':
      return <CheckCircle2 className={cn(cls, 'text-green-500')} />;
    case 'error':
    case 'cancelled':
      return <XCircle className={cn(cls, 'text-destructive')} />;
    default:
      return <Circle className={cn(cls, 'text-muted-foreground')} />;
  }
}
