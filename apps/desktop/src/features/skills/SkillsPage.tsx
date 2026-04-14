import { useRef, useState } from 'react';
import {
  Bot,
  Subtitles,
  Scissors,
  Smartphone,
  Network,
  Wand2,
  Zap,
  Clapperboard,
  Settings,
  ArrowRight,
  Trash2,
} from 'lucide-react';
import type { ComponentType } from 'react';
import { Card, CardContent } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { ScrollArea } from '../../components/ui/scroll-area';
import { type Skill, parseSkillFromContent } from '../../lib/load-skills';

/** Map icon string names from skill frontmatter to lucide components */
const ICON_MAP: Record<string, ComponentType<{ className?: string }>> = {
  bot: Bot,
  subtitles: Subtitles,
  scissors: Scissors,
  smartphone: Smartphone,
  network: Network,
  wand2: Wand2,
  zap: Zap,
  clapperboard: Clapperboard,
};

const CATEGORY_LABELS: Record<string, string> = {
  general: 'General',
  production: 'Production',
  color: 'Color / Grading',
  editing: 'Editing',
  generation: 'Generation',
  utility: 'Utility',
};

const CATEGORY_ORDER = [
  'general',
  'production',
  'color',
  'editing',
  'generation',
  'utility',
];

interface SkillsPageProps {
  skills: Skill[];
  selectedSkillId: string;
  activeApp: string;
  onSelectSkill: (skill: Skill) => void;
  onNavigateToSkill: (skill: Skill) => void;
  onImportSkill?: (skill: Skill) => void;
  onDeleteSkill?: (skill: Skill) => void;
}

export function SkillsPage({
  skills,
  selectedSkillId,
  activeApp: _activeApp,
  onSelectSkill,
  onNavigateToSkill,
  onImportSkill,
  onDeleteSkill,
}: SkillsPageProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importStatus, setImportStatus] = useState<
    'idle' | 'success' | 'error'
  >('idle');
  const [importMessage, setImportMessage] = useState('');
  // Group skills by category
  const grouped = skills.reduce<Record<string, Skill[]>>((acc, skill) => {
    const cat = skill.category || 'general';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(skill);
    return acc;
  }, {});

  // Add any categories from skills that aren't in CATEGORY_ORDER to the end
  const dynamicCategories = Object.keys(grouped).filter(
    (cat) => !CATEGORY_ORDER.includes(cat)
  );
  const allCategoriesOrder = [...CATEGORY_ORDER, ...dynamicCategories];

  const sortedCategories = allCategoriesOrder.filter(
    (cat) => grouped[cat]?.length
  );

  const handleSkillClick = (skill: Skill) => {
    if (skill.hasUI) {
      onNavigateToSkill(skill);
    } else {
      onSelectSkill(skill);
    }
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async () => {
      const content = reader.result as string;
      const skill = parseSkillFromContent(content);

      if (!skill) {
        setImportStatus('error');
        setImportMessage('Invalid skill file — missing id in frontmatter');
        setTimeout(() => setImportStatus('idle'), 3000);
        return;
      }

      // Check for duplicate
      if (skills.some((s) => s.id === skill.id)) {
        setImportStatus('error');
        setImportMessage(`Skill "${skill.name}" already exists`);
        setTimeout(() => setImportStatus('idle'), 3000);
        return;
      }

      try {
        setImportStatus('saving' as any);
        const res = await fetch('http://localhost:3001/api/skills/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filename: file.name, content }),
        });

        if (!res.ok) {
          throw new Error('Failed to upload skill');
        }

        skill.filename = file.name;
        onImportSkill?.(skill);
        setImportStatus('success');
        setImportMessage(`Imported "${skill.name}"`);
        setTimeout(() => setImportStatus('idle'), 3000);
      } catch (err) {
        setImportStatus('error');
        setImportMessage('Failed to save to server');
        setTimeout(() => setImportStatus('idle'), 3000);
      }
    };
    reader.readAsText(file);

    // Reset input so the same file can be imported again
    e.target.value = '';
  };

  return (
    <ScrollArea className="flex-1 min-h-0 p-6 relative">
      <div className="max-w-5xl mx-auto pb-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-2xl font-bold tracking-tight flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
                <Zap className="h-5 w-5 text-primary" />
              </div>
              AI Skills
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Select a skill to enhance your AI assistant or open its dashboard
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs gap-1">
              {skills.length} skills
            </Badge>
            <Button size="sm" variant="outline" className="gap-2">
              <Settings className="h-3.5 w-3.5" />
              Manage
            </Button>
          </div>
        </div>

        {/* Tip */}
        <div className="mb-8 p-4 rounded-xl bg-primary/5 border border-primary/10">
          <p className="text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">💡 Tip:</span> Type{' '}
            <kbd className="px-1.5 py-0.5 rounded bg-muted border text-[10px] font-mono font-bold">
              /
            </kbd>{' '}
            in the chat to quickly search and activate skills.
          </p>
        </div>

        {/* Categorized Skill Cards */}
        {sortedCategories.map((category) => (
          <div key={category} className="mb-8">
            <div className="flex items-center gap-2 mb-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {CATEGORY_LABELS[category] || category}
              </h3>
              <div className="flex-1 h-px bg-border" />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
              {grouped[category].map((skill) => {
                const IconComp = ICON_MAP[skill.icon || 'bot'] || Bot;
                const isSelected = selectedSkillId === skill.id;

                return (
                  <Card
                    key={skill.id}
                    onClick={() => handleSkillClick(skill)}
                    className={`group relative cursor-pointer active:scale-[0.97] transition-all duration-200 border-border/60 hover:border-primary/50 hover:shadow-lg bg-card/80 backdrop-blur-sm overflow-hidden ${
                      isSelected
                        ? 'ring-2 ring-primary border-primary shadow-md'
                        : ''
                    }`}
                  >
                    {/* Gradient overlay on hover */}
                    <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

                    <CardContent className="p-5 flex flex-col h-36 relative z-10">
                      {/* Top row: icon + badges */}
                      <div className="flex items-start justify-between mb-3">
                        <div className="h-10 w-10 rounded-xl bg-muted flex items-center justify-center group-hover:bg-primary group-hover:text-primary-foreground transition-colors duration-200 shadow-sm">
                          <IconComp className="h-5 w-5" />
                        </div>
                        <div className="flex gap-1 items-center relative z-20">
                          {skill.hasUI && (
                            <Badge
                              variant="secondary"
                              className="text-[9px] px-1.5 py-0 h-5 bg-primary/10 text-primary border-primary/20 mr-1"
                            >
                              Dashboard
                            </Badge>
                          )}
                          {skill.id !== 'default' && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onDeleteSkill?.(skill);
                              }}
                              className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-destructive/10 hover:text-destructive rounded-md text-muted-foreground"
                              title="Delete Skill"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Name */}
                      <div className="font-semibold text-sm leading-tight group-hover:text-primary transition-colors">
                        {skill.name}
                      </div>

                      {/* Description */}
                      {skill.description && (
                        <p className="text-[11px] text-muted-foreground mt-1.5 leading-relaxed line-clamp-2 flex-1">
                          {skill.description}
                        </p>
                      )}

                      {/* Bottom row: trigger command */}
                      <div className="flex items-center justify-between mt-auto pt-2">
                        {skill.triggerCommand && (
                          <span className="text-[10px] font-mono text-muted-foreground/70 bg-muted/50 px-1.5 py-0.5 rounded">
                            /{skill.triggerCommand}
                          </span>
                        )}
                        {skill.hasUI && (
                          <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/40 group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        ))}

        {/* Import Skill */}
        <div className="mt-4">
          <input
            ref={fileInputRef}
            type="file"
            accept=".md"
            className="hidden"
            onChange={handleImportFile}
          />
          <Card
            onClick={() => fileInputRef.current?.click()}
            className={`cursor-pointer border-dashed border-2 transition-colors bg-transparent max-w-[200px] ${
              importStatus === 'success'
                ? 'border-green-500/50 bg-green-500/5'
                : importStatus === 'error'
                ? 'border-destructive/50 bg-destructive/5'
                : 'hover:border-primary/50 hover:bg-primary/5'
            }`}
          >
            <CardContent className="p-5 flex flex-col items-center justify-center text-center h-36 text-muted-foreground hover:text-primary">
              {importStatus === 'idle' ? (
                <>
                  <div className="h-10 w-10 rounded-xl border-2 border-current border-dashed flex items-center justify-center mb-2">
                    <span className="text-xl leading-none">+</span>
                  </div>
                  <div className="font-medium text-sm">Import Skill</div>
                  <div className="text-[10px] mt-1 opacity-70">
                    Drop a .md file
                  </div>
                </>
              ) : (
                <>
                  <div
                    className={`text-2xl mb-2 ${
                      importStatus === 'success'
                        ? 'text-green-500'
                        : 'text-destructive'
                    }`}
                  >
                    {importStatus === 'success' ? '✅' : '❌'}
                  </div>
                  <div
                    className={`font-medium text-xs ${
                      importStatus === 'success'
                        ? 'text-green-500'
                        : 'text-destructive'
                    }`}
                  >
                    {importMessage}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </ScrollArea>
  );
}
