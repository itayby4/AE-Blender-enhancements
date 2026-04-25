import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Button } from '../../components/ui/button';
import { ScrollArea } from '../../components/ui/scroll-area';
import { Save, FileEdit, X } from 'lucide-react';
import { StatusIcon } from '../../components/StatusIcon';
import { parseSkillFromContent } from '../../lib/load-skills';

interface SkillPlannerPageProps {
  content: string | null;
  onClose: () => void;
  onSkillSaved: () => void;
}

export function SkillPlannerPage({
  content,
  onClose,
  onSkillSaved,
}: SkillPlannerPageProps) {
  const [status, setStatus] = useState<'idle' | 'saving' | 'success' | 'error'>(
    'idle'
  );
  const [errorMsg, setErrorMsg] = useState('');

  if (!content) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 h-full bg-background/50">
        <div className="flex flex-col items-center gap-2 px-5 py-6 rounded-xl bg-background/95 backdrop-blur-xl border border-border/60 shadow-2xl">
          <FileEdit className="w-5 h-5 text-muted-foreground/60" />
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            No Active Plan
          </span>
          <p className="text-[11px] text-muted-foreground/70 max-w-[260px] text-center leading-snug">
            Ask the AI to build a skill and the implementation plan will appear here.
          </p>
        </div>
      </div>
    );
  }

  const skill = parseSkillFromContent(content);
  const isValid = skill !== null;
  const skillName = skill?.name || 'New Skill Plan';
  const skillId = skill?.id || 'new-skill';

  const handleSave = async () => {
    if (!isValid) return;
    setStatus('saving');

    try {
      const filename = `${skillId}.md`;
      const res = await fetch('http://localhost:3001/api/skill-files/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename, content }),
      });

      if (!res.ok) {
        throw new Error('Failed to save skill');
      }

      setStatus('success');
      onSkillSaved();

      setTimeout(() => setStatus('idle'), 3000);
    } catch (err) {
      setStatus('error');
      setErrorMsg(err instanceof Error ? err.message : String(err));
      setTimeout(() => setStatus('idle'), 4000);
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 p-3">
      <div className="flex-1 min-h-0 flex flex-col bg-background/95 backdrop-blur-xl shadow-2xl rounded-xl border border-border/60 overflow-hidden">
        {/* Header bar — matches TaskManagerWidget density */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-border/40 bg-muted/30 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-2 h-2 rounded-full bg-primary animate-pulse shrink-0" />
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground shrink-0">
              Implementation Plan
            </span>
            <span className="text-[11px] text-foreground/80 truncate">
              {skillName}
            </span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {status === 'idle' && (
              <Button
                size="sm"
                variant="default"
                className="h-6 px-2 gap-1 text-[10px] font-medium"
                onClick={handleSave}
                disabled={!isValid}
              >
                <Save className="w-3 h-3" />
                Approve & Install
              </Button>
            )}
            {status === 'saving' && (
              <span className="flex items-center gap-1 text-[10px] text-muted-foreground bg-muted/50 px-2 h-6 rounded">
                <StatusIcon status="saving" size="sm" />
                Saving…
              </span>
            )}
            {status === 'success' && (
              <span className="flex items-center gap-1 text-[10px] text-green-500 bg-green-500/10 border border-green-500/20 px-2 h-6 rounded">
                <StatusIcon status="done" size="sm" />
                Installed
              </span>
            )}
            {status === 'error' && (
              <span
                className="flex items-center gap-1 text-[10px] text-destructive bg-destructive/10 border border-destructive/20 px-2 h-6 rounded max-w-[220px] truncate"
                title={errorMsg}
              >
                <StatusIcon status="error" size="sm" />
                {errorMsg}
              </span>
            )}
            <button
              onClick={onClose}
              className="h-5 w-5 flex items-center justify-center rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors ml-0.5"
              title="Close"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        </div>

        {!isValid && status === 'idle' && (
          <div className="px-3 py-1.5 border-b border-destructive/20 bg-destructive/10 text-destructive text-[10px] flex items-center gap-1.5 shrink-0">
            <StatusIcon status="error" size="sm" />
            Missing a valid <code className="font-mono bg-destructive/10 px-1 rounded">id</code> in frontmatter — cannot install.
          </div>
        )}

        {/* Markdown body — tighter typography than prose-sm */}
        <ScrollArea className="flex-1 min-h-0">
          <div className="max-w-3xl mx-auto px-6 py-5 pb-12">
            <article
              className="prose prose-sm dark:prose-invert max-w-none
              prose-headings:text-foreground prose-headings:font-semibold
              prose-h1:text-base prose-h1:mb-3 prose-h1:mt-0
              prose-h2:text-sm prose-h2:mt-5 prose-h2:mb-2
              prose-h3:text-[12px] prose-h3:mt-4 prose-h3:mb-1.5 prose-h3:uppercase prose-h3:tracking-wider prose-h3:text-muted-foreground
              prose-p:text-[12px] prose-p:leading-relaxed prose-p:text-foreground/90
              prose-li:text-[12px] prose-li:leading-relaxed prose-li:text-foreground/90
              prose-a:text-primary prose-a:no-underline hover:prose-a:underline
              prose-pre:bg-muted/40 prose-pre:border prose-pre:border-border/40 prose-pre:text-[11px]
              prose-code:text-primary prose-code:bg-primary/10 prose-code:px-1 prose-code:rounded-sm prose-code:text-[11px]
              prose-code:before:content-none prose-code:after:content-none
              prose-strong:text-foreground prose-strong:font-semibold
              prose-hr:border-border/40"
            >
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
            </article>
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
