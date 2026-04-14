import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Button } from '../../components/ui/button';
import { ScrollArea } from '../../components/ui/scroll-area';
import { Save, CheckCircle2, AlertCircle, FileEdit, X } from 'lucide-react';
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
      <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground p-8 text-center h-full">
        <FileEdit className="h-12 w-12 mb-4 opacity-20" />
        <p className="text-sm shadow-sm backdrop-blur-sm bg-background/50 p-4 rounded-xl border border-border/50">
          No skill plan active. Ask the AI to build a skill to see the
          implementation plan here.
        </p>
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
      const res = await fetch('http://localhost:3001/api/skills/create', {
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
    <div className="flex-1 flex flex-col min-h-0 bg-background/50 relative">
      {/* Header Panel */}
      <div className="h-14 border-b bg-card flex items-center justify-between px-4 shrink-0 shadow-sm z-10 relative">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <FileEdit className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h2 className="text-sm font-bold tracking-tight">
              Implementation Plan
            </h2>
            <p className="text-[10px] text-muted-foreground -mt-0.5">
              {skillName}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {status === 'idle' && (
            <Button
              size="sm"
              variant="default"
              className="h-8 shadow-sm gap-2 text-xs"
              onClick={handleSave}
              disabled={!isValid}
            >
              <Save className="h-3.5 w-3.5" />
              Approve & Install Skill
            </Button>
          )}
          {status === 'saving' && (
            <span className="text-xs text-muted-foreground animate-pulse flex items-center bg-muted px-3 py-1.5 rounded-md">
              Saving...
            </span>
          )}
          {status === 'success' && (
            <span className="text-xs text-green-500 bg-green-500/10 px-3 py-1.5 rounded-md font-medium flex items-center gap-1.5 border border-green-500/20">
              <CheckCircle2 className="h-3.5 w-3.5" /> Skill Installed!
            </span>
          )}
          {status === 'error' && (
            <span className="text-xs text-destructive font-medium flex items-center gap-1.5 bg-destructive/10 px-3 py-1.5 rounded-md border border-destructive/20">
              <AlertCircle className="h-3.5 w-3.5" /> {errorMsg}
            </span>
          )}
          <div className="w-px h-6 bg-border mx-1" />
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="h-8 w-8 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {!isValid && status === 'idle' && (
        <div className="bg-destructive/10 text-destructive text-xs py-2 px-4 border-b border-destructive/20 font-medium flex items-center gap-2 shrink-0">
          <AlertCircle className="h-3.5 w-3.5" /> Warning: Cannot install. The
          plan is missing a valid `id` in the frontmatter.
        </div>
      )}

      {/* Markdown Body */}
      <ScrollArea className="flex-1 min-h-0 bg-background/50">
        <div className="max-w-4xl mx-auto p-8 lg:p-12 pb-24">
          <article
            className="prose prose-sm dark:prose-invert max-w-none 
            prose-headings:text-foreground prose-headings:font-bold prose-h1:text-2xl prose-h2:mt-8 
            prose-a:text-primary prose-a:no-underline hover:prose-a:underline
            prose-pre:bg-muted/50 prose-pre:border prose-pre:border-border/50
            prose-code:text-primary prose-code:bg-primary/10 prose-code:px-1 prose-code:rounded-sm
            prose-code:before:content-none prose-code:after:content-none
            prose-strong:text-foreground"
          >
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
          </article>
        </div>
      </ScrollArea>
    </div>
  );
}
