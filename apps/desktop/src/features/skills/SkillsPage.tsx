import { useRef, useState, useMemo } from 'react';
import {
  Bot,
  Captions,
  Scissors,
  Smartphone,
  Network,
  Wand2,
  Zap,
  Clapperboard,
  ArrowRight,
  Trash2,
  Search,
  Upload,
  X,
  CheckCircle2,
  AlertCircle,
  LayoutGrid,
} from 'lucide-react';
import type { ComponentType } from 'react';
import { Card, CardContent } from '../../components/ui/card.js';
import { Badge } from '../../components/ui/badge.js';
import { Button } from '../../components/ui/button.js';
import { ScrollArea } from '../../components/ui/scroll-area.js';
import { cn } from '../../lib/utils.js';
import { type Skill, parseSkillFromContent } from '../../lib/load-skills.js';

/** Map icon string names from skill frontmatter to lucide components */
const ICON_MAP: Record<string, ComponentType<{ className?: string }>> = {
  bot: Bot,
  subtitles: Captions,
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
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<string>('all');

  // The currently-active skill (non-default)
  const activeSkill = skills.find(
    (s) => s.id === selectedSkillId && s.id !== 'default'
  );

  // Filter skills by search + category
  const filteredSkills = useMemo(() => {
    let result = skills;

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.description?.toLowerCase().includes(q) ||
          s.triggerCommand?.toLowerCase().includes(q) ||
          s.category?.toLowerCase().includes(q)
      );
    }

    // Category filter
    if (activeFilter !== 'all') {
      result = result.filter(
        (s) => (s.category || 'general') === activeFilter
      );
    }

    return result;
  }, [skills, searchQuery, activeFilter]);

  // Group filtered skills by category
  const grouped = filteredSkills.reduce<Record<string, Skill[]>>(
    (acc, skill) => {
      const cat = skill.category || 'general';
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(skill);
      return acc;
    },
    {}
  );

  // Add any categories from skills that aren't in CATEGORY_ORDER to the end
  const dynamicCategories = Object.keys(grouped).filter(
    (cat) => !CATEGORY_ORDER.includes(cat)
  );
  const allCategoriesOrder = [...CATEGORY_ORDER, ...dynamicCategories];

  const sortedCategories = allCategoriesOrder.filter(
    (cat) => grouped[cat]?.length
  );

  // Categories that have at least one skill (for filter chips)
  const availableCategories = useMemo(() => {
    const cats = new Set(skills.map((s) => s.category || 'general'));
    return CATEGORY_ORDER.filter((c) => cats.has(c)).concat(
      [...cats].filter((c) => !CATEGORY_ORDER.includes(c))
    );
  }, [skills]);

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

  const isSearching = searchQuery.trim().length > 0;

  return (
    <div className="flex flex-col h-full">
      {/* ── Header ── */}
      <div className="shrink-0 border-b bg-card">
        {/* Title row */}
        <div className="flex items-center justify-between px-5 py-3">
          <h2 className="text-sm font-semibold text-foreground tracking-tight">Skills</h2>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[10px] font-mono h-5 px-1.5">
              {skills.length}
            </Badge>

            {/* Import status feedback */}
            {importStatus !== 'idle' && (
              <span className={cn(
                'text-[11px] font-medium flex items-center gap-1',
                importStatus === 'success' ? 'text-success' : 'text-destructive'
              )}>
                {importStatus === 'success'
                  ? <><CheckCircle2 className="h-3 w-3" /> {importMessage}</>
                  : <><AlertCircle className="h-3 w-3" /> {importMessage}</>
                }
              </span>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept=".md"
              className="hidden"
              onChange={handleImportFile}
            />
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1.5"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="h-3 w-3" />
              Import
            </Button>
          </div>
        </div>

        {/* Search + filter bar */}
        <div className="px-5 pb-3 flex flex-col gap-2">
          {/* Search input */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/60" />
            <input
              type="text"
              placeholder='Search skills... (type / in chat to activate)'
              className="w-full h-8 pl-9 pr-8 rounded-lg bg-muted/50 border border-border/50 text-xs text-foreground placeholder:text-muted-foreground/50 outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary/30 transition-colors"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded text-muted-foreground/50 hover:text-foreground transition-colors"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>

          {/* Category filter chips */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              onClick={() => setActiveFilter('all')}
              className={cn(
                'px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors',
                activeFilter === 'all'
                  ? 'bg-primary/15 text-primary border border-primary/25'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/60 border border-transparent'
              )}
            >
              All
            </button>
            {availableCategories.map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveFilter(activeFilter === cat ? 'all' : cat)}
                className={cn(
                  'px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors',
                  activeFilter === cat
                    ? 'bg-primary/15 text-primary border border-primary/25'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/60 border border-transparent'
                )}
              >
                {CATEGORY_LABELS[cat] || cat}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Content ── */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="p-5 pb-10">
          {/* Active skill banner */}
          {activeSkill && !isSearching && (
            <div className="mb-5 flex items-center gap-3 px-4 py-3 rounded-xl bg-primary/10 border border-primary/20">
              <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                {(() => {
                  const IC = ICON_MAP[activeSkill.icon || 'bot'] || Bot;
                  return <IC className="h-3.5 w-3.5 text-primary" />;
                })()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold text-foreground truncate">
                  {activeSkill.name} <span className="font-normal text-muted-foreground">is active</span>
                </p>
                <p className="text-[11px] text-muted-foreground">Type in chat to use this skill</p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-muted-foreground hover:text-foreground shrink-0"
                onClick={() => onSelectSkill({ id: 'default', name: 'Default Assistant' })}
              >
                Deactivate
              </Button>
            </div>
          )}

          {/* Empty state */}
          {filteredSkills.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <LayoutGrid className="h-10 w-10 text-muted-foreground/30 mb-4" />
              <p className="text-sm font-medium text-muted-foreground">No skills found</p>
              <p className="text-xs text-muted-foreground/60 mt-1">
                {isSearching ? 'Try a different search term' : 'Import a skill to get started'}
              </p>
            </div>
          )}

          {/* Categorized skill cards */}
          {sortedCategories.map((category) => (
            <div key={category} className="mb-6">
              {/* Category header — only show when not filtering to a single category */}
              {(activeFilter === 'all' || isSearching) && sortedCategories.length > 1 && (
                <div className="flex items-center gap-2 mb-3">
                  <h3 className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
                    {CATEGORY_LABELS[category] || category}
                  </h3>
                  <div className="flex-1 h-px bg-border/60" />
                  <span className="text-[10px] text-muted-foreground/50">{grouped[category].length}</span>
                </div>
              )}

              {/* Responsive grid — auto-fit instead of fixed columns */}
              <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
                {grouped[category].map((skill) => {
                  const IconComp = ICON_MAP[skill.icon || 'bot'] || Bot;
                  const isSelected = selectedSkillId === skill.id;
                  const isDashboard = !!skill.hasUI;

                  return (
                    <Card
                      key={skill.id}
                      onClick={() => handleSkillClick(skill)}
                      className={cn(
                        'group relative cursor-pointer transition-all duration-200 overflow-hidden',
                        'border-border/60 bg-card hover:border-primary/40 hover:shadow-md',
                        'active:scale-[0.98]',
                        isDashboard && 'border-l-2 border-l-primary/30',
                        isSelected && 'ring-2 ring-primary/60 border-primary/50 bg-primary/[0.03] shadow-md',
                      )}
                    >
                      <CardContent className="p-4 flex flex-col min-h-[130px] relative">
                        {/* Top row: icon + action area */}
                        <div className="flex items-start justify-between mb-2.5">
                          <div className={cn(
                            'h-9 w-9 rounded-xl flex items-center justify-center shrink-0 transition-colors duration-200 shadow-sm',
                            isSelected
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground'
                          )}>
                            <IconComp className="h-4 w-4" />
                          </div>
                          <div className="flex gap-1 items-center relative z-20">
                            {isDashboard && (
                              <Badge
                                variant="secondary"
                                className="text-[9px] px-1.5 py-0 h-5 bg-primary/10 text-primary border-primary/20"
                              >
                                Dashboard
                              </Badge>
                            )}
                            {isSelected && (
                              <Badge className="text-[9px] px-1.5 py-0 h-5 bg-primary text-primary-foreground">
                                Active
                              </Badge>
                            )}
                            {skill.id !== 'default' && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onDeleteSkill?.(skill);
                                }}
                                className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-destructive/10 hover:text-destructive rounded-md text-muted-foreground/50"
                                title="Delete Skill"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Name */}
                        <div className={cn(
                          'font-semibold text-[13px] leading-tight transition-colors',
                          isSelected ? 'text-primary' : 'text-foreground group-hover:text-primary'
                        )}>
                          {skill.name}
                        </div>

                        {/* Description */}
                        {skill.description && (
                          <p className="text-[11px] text-muted-foreground mt-1.5 leading-relaxed line-clamp-2 flex-1">
                            {skill.description}
                          </p>
                        )}

                        {/* Bottom row: trigger command + CTA */}
                        <div className="flex items-center justify-between mt-auto pt-2.5">
                          {skill.triggerCommand ? (
                            <span className="text-[10px] font-mono text-muted-foreground/60 bg-muted/40 px-1.5 py-0.5 rounded">
                              /{skill.triggerCommand}
                            </span>
                          ) : <span />}

                          {/* Always-visible CTA */}
                          <span className={cn(
                            'text-[11px] font-medium flex items-center gap-1 transition-colors',
                            isSelected
                              ? 'text-primary'
                              : 'text-muted-foreground/60 group-hover:text-primary'
                          )}>
                            {isDashboard ? 'Open' : isSelected ? 'Active' : 'Activate'}
                            {isDashboard && (
                              <ArrowRight className="h-3 w-3 group-hover:translate-x-0.5 transition-transform" />
                            )}
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
