import { useState } from 'react';
import { Card, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Save, CheckCircle2, AlertCircle } from 'lucide-react';
import { parseSkillFromContent } from '../../lib/load-skills';

interface SkillBuilderCardProps {
  content: string;
  onSkillSaved?: () => void;
}

export function SkillBuilderCard({
  content,
  onSkillSaved,
}: SkillBuilderCardProps) {
  const [status, setStatus] = useState<'idle' | 'saving' | 'success' | 'error'>(
    'idle'
  );
  const [errorMsg, setErrorMsg] = useState('');

  // Extract frontmatter to get the ID for the filename
  const skill = parseSkillFromContent(content);
  const isValid = skill !== null;
  const skillName = skill?.name || 'New Skill';
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
      onSkillSaved?.();

      // Reset after a delay
      setTimeout(() => setStatus('idle'), 3000);
    } catch (err) {
      setStatus('error');
      setErrorMsg(err instanceof Error ? err.message : String(err));
      setTimeout(() => setStatus('idle'), 4000);
    }
  };

  return (
    <Card className="my-2 border-primary/20 bg-primary/5">
      <CardContent className="p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="font-semibold text-sm flex items-center gap-2">
            ✨ AI Generated Skill:{' '}
            <span className="text-primary">{skillName}</span>
          </div>
          {status === 'idle' && (
            <Button
              size="sm"
              variant="default"
              className="h-7 text-xs gap-1.5"
              onClick={handleSave}
              disabled={!isValid}
            >
              <Save className="h-3.5 w-3.5" />
              Save Skill
            </Button>
          )}
          {status === 'saving' && (
            <span className="text-xs text-muted-foreground animate-pulse">
              Saving...
            </span>
          )}
          {status === 'success' && (
            <span className="text-xs text-green-500 font-medium flex items-center gap-1">
              <CheckCircle2 className="h-3.5 w-3.5" /> Saved!
            </span>
          )}
          {status === 'error' && (
            <span className="text-xs text-destructive font-medium flex items-center gap-1">
              <AlertCircle className="h-3.5 w-3.5" /> {errorMsg}
            </span>
          )}
        </div>

        {!isValid && status === 'idle' && (
          <div className="text-[10px] text-destructive mb-2">
            Skill definition is missing an ID.
          </div>
        )}

        <div className="bg-background rounded-md border border-border/50 p-2 overflow-x-auto">
          <pre className="text-[10px] text-muted-foreground font-mono m-0">
            {content.slice(0, 150)}
            {content.length > 150 ? '...\n[Content Truncated]' : ''}
          </pre>
        </div>
      </CardContent>
    </Card>
  );
}
