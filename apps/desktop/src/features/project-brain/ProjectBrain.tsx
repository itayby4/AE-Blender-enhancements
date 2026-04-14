/**
 * PipeFX — Project Brain Panel
 *
 * A collapsible UI component that displays what the AI agent knows about
 * the currently active project. Data is fetched from the backend knowledge API
 * and organized into visual category groups.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Brain,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Sparkles,
  FileText,
  Palette,
  AlertCircle,
  Tag,
  BookOpen,
  Lightbulb,
  Package,
  ScanSearch,
  Clock,
  Trash2,
} from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { ScrollArea } from '../../components/ui/scroll-area';
import { cn } from '../../lib/utils';

interface KnowledgeItem {
  id: number;
  projectId: string | null;
  category: string;
  subject: string;
  content: string;
  source: string;
  confidence: number;
  accessCount: number;
  createdAt: number;
  updatedAt: number;
}

/**
 * Map knowledge categories to display metadata.
 */
const CATEGORY_META: Record<
  string,
  { label: string; icon: typeof Brain; color: string }
> = {
  content_analysis: {
    label: 'Content Analysis',
    icon: ScanSearch,
    color: 'text-blue-400',
  },
  media_inventory: {
    label: 'Media Inventory',
    icon: Package,
    color: 'text-emerald-400',
  },
  creative_rule: {
    label: 'Creative Rules',
    icon: Palette,
    color: 'text-purple-400',
  },
  preference: {
    label: 'Preferences',
    icon: Lightbulb,
    color: 'text-amber-400',
  },
  fact: { label: 'Facts', icon: BookOpen, color: 'text-cyan-400' },
  decision: { label: 'Decisions', icon: AlertCircle, color: 'text-orange-400' },
  constraint: { label: 'Constraints', icon: AlertCircle, color: 'text-red-400' },
  style_guide: {
    label: 'Style Guide',
    icon: FileText,
    color: 'text-pink-400',
  },
  behavior: { label: 'Behavior', icon: Tag, color: 'text-teal-400' },
};

function getRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

interface ProjectBrainProps {
  projectId: string;
  onAnalyzeRequest?: () => void;
}

export function ProjectBrain({
  projectId,
  onAnalyzeRequest,
}: ProjectBrainProps) {
  const [items, setItems] = useState<KnowledgeItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set()
  );
  const [error, setError] = useState<string | null>(null);

  const fetchKnowledge = useCallback(async () => {
    if (!projectId) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `http://localhost:3001/api/knowledge?projectId=${encodeURIComponent(projectId)}`
      );
      if (!res.ok) throw new Error('Failed to fetch knowledge');
      const data = await res.json();
      setItems(data);
    } catch (err: any) {
      setError(err.message || 'Connection error');
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchKnowledge().then(() => {
      // Auto-expand if items were fetched
      setItems((current) => {
        if (current.length > 0) setIsExpanded(true);
        return current;
      });
    });
    // Poll every 30s for updates (e.g. while analyze_project runs)
    const interval = setInterval(fetchKnowledge, 30000);
    return () => clearInterval(interval);
  }, [fetchKnowledge]);

  const handleDelete = async (id: number) => {
    try {
      await fetch('http://localhost:3001/api/knowledge', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      setItems((prev) => prev.filter((item) => item.id !== id));
    } catch {
      // Silently fail — non-critical
    }
  };

  const toggleCategory = (category: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  };

  // Group items by category
  const grouped = items.reduce(
    (acc, item) => {
      if (!acc[item.category]) acc[item.category] = [];
      acc[item.category].push(item);
      return acc;
    },
    {} as Record<string, KnowledgeItem[]>
  );

  const categoryOrder = [
    'content_analysis',
    'media_inventory',
    'creative_rule',
    'style_guide',
    'fact',
    'preference',
    'decision',
    'constraint',
    'behavior',
  ];

  const sortedCategories = Object.keys(grouped).sort((a, b) => {
    const ai = categoryOrder.indexOf(a);
    const bi = categoryOrder.indexOf(b);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });

  const isEmpty = items.length === 0 && !isLoading;

  return (
    <div className="border-b bg-card/30">
      {/* Header — always visible */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 w-full px-4 py-2.5 text-left hover:bg-muted/30 transition-colors group"
      >
        <Brain className="h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground group-hover:text-foreground transition-colors flex-1">
          Project Brain
        </span>
        {items.length > 0 && (
          <Badge variant="secondary" className="text-[10px] h-4 px-1.5 font-mono">
            {items.length}
          </Badge>
        )}
        {isLoading && (
          <RefreshCw className="h-3 w-3 text-muted-foreground animate-spin" />
        )}
        {isExpanded ? (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
        )}
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="px-2 pb-2">
          {error && (
            <div className="px-2 py-1.5 text-[11px] text-red-400 flex items-center gap-1.5">
              <AlertCircle className="h-3 w-3 shrink-0" />
              {error}
            </div>
          )}

          {isEmpty && !error && (
            <div className="flex flex-col items-center py-4 gap-2">
              <div className="h-10 w-10 rounded-full bg-muted/50 flex items-center justify-center">
                <Brain className="h-5 w-5 text-muted-foreground" />
              </div>
              <p className="text-[11px] text-muted-foreground text-center leading-relaxed px-4">
                No knowledge yet.
                <br />
                Ask the AI to{' '}
                <button
                  className="text-foreground font-medium hover:underline"
                  onClick={(e) => {
                    e.stopPropagation();
                    onAnalyzeRequest?.();
                  }}
                >
                  analyze the project
                </button>{' '}
                to build understanding.
              </p>
            </div>
          )}

          {!isEmpty && (
            <ScrollArea className="max-h-[280px]">
              <div className="space-y-0.5">
                {sortedCategories.map((category) => {
                  const categoryItems = grouped[category];
                  const meta = CATEGORY_META[category] || {
                    label: category,
                    icon: Tag,
                    color: 'text-muted-foreground',
                  };
                  const Icon = meta.icon;
                  const isCatExpanded = expandedCategories.has(category);

                  return (
                    <div key={category}>
                      {/* Category header */}
                      <button
                        onClick={() => toggleCategory(category)}
                        className="flex items-center gap-2 w-full px-2 py-1.5 rounded-sm hover:bg-muted/50 transition-colors text-left"
                      >
                        {isCatExpanded ? (
                          <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
                        ) : (
                          <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
                        )}
                        <Icon
                          className={cn('h-3.5 w-3.5 shrink-0', meta.color)}
                        />
                        <span className="text-[11px] font-medium text-foreground flex-1">
                          {meta.label}
                        </span>
                        <span className="text-[10px] text-muted-foreground font-mono">
                          {categoryItems.length}
                        </span>
                      </button>

                      {/* Category items */}
                      {isCatExpanded && (
                        <div className="ml-5 space-y-px">
                          {categoryItems.map((item) => (
                            <div
                              key={item.id}
                              className="group/item px-2 py-1.5 rounded-sm hover:bg-muted/30 transition-colors"
                            >
                              <div className="flex items-start gap-1.5">
                                <div className="flex-1 min-w-0">
                                  <div className="text-[11px] font-medium text-foreground leading-tight truncate">
                                    {item.subject}
                                  </div>
                                  <div className="text-[10px] text-muted-foreground leading-relaxed mt-0.5 line-clamp-2">
                                    {item.content.replace(
                                      /_fingerprint:[^\s]*/g,
                                      ''
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2 mt-1">
                                    <span className="text-[9px] text-muted-foreground flex items-center gap-0.5">
                                      <Clock className="h-2.5 w-2.5" />
                                      {getRelativeTime(item.updatedAt)}
                                    </span>
                                    {item.source === 'ai_inferred' && (
                                      <span className="text-[9px] text-muted-foreground flex items-center gap-0.5">
                                        <Sparkles className="h-2.5 w-2.5" />
                                        AI
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-5 w-5 opacity-0 group-hover/item:opacity-100 transition-opacity text-muted-foreground hover:text-destructive shrink-0"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDelete(item.id);
                                  }}
                                  title="Remove this knowledge"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          )}

          {/* Footer actions */}
          {!isEmpty && (
            <div className="flex items-center justify-between px-2 pt-1.5 mt-1 border-t border-border/30">
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-[10px] text-muted-foreground hover:text-foreground gap-1 px-1.5"
                onClick={() => fetchKnowledge()}
                disabled={isLoading}
              >
                <RefreshCw
                  className={cn(
                    'h-2.5 w-2.5',
                    isLoading && 'animate-spin'
                  )}
                />
                Refresh
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-[10px] text-muted-foreground hover:text-foreground gap-1 px-1.5"
                onClick={() => onAnalyzeRequest?.()}
              >
                <ScanSearch className="h-2.5 w-2.5" />
                Re-analyze
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
