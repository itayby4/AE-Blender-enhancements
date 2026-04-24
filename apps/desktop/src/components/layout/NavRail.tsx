import {
  Video,
  ImageIcon,
  Network,
  Scissors,
  Zap,
  MessageSquare,
  Bot,
  Settings,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '../../lib/utils.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip.js';
import type { Skill } from '../../lib/load-skills.js';
import type { ComponentType } from 'react';

/** Map icon names from skill frontmatter to lucide components */
const ICON_MAP: Record<string, ComponentType<{ className?: string }>> = {
  bot: Bot,
  scissors: Scissors,
  network: Network,
  wand2: Zap,
  zap: Zap,
  video: Video,
};

interface NavItem {
  id: string;
  label: string;
  icon: LucideIcon | ComponentType<{ className?: string }>;
  section: 'core' | 'skills' | 'system';
}

interface NavRailProps {
  activeView: string;
  onNavigate: (view: string) => void;
  skills: Skill[];
  className?: string;
  /** When true, rail widens and shows labels beside icons. */
  isExpanded?: boolean;
}

// ────────────────────────────────────────────────────────
// NavButton — single rail item, collapses/expands smoothly
// ────────────────────────────────────────────────────────

function NavButton({
  item,
  isActive,
  isExpanded,
  onNavigate,
}: {
  item: NavItem;
  isActive: boolean;
  isExpanded: boolean;
  onNavigate: (id: string) => void;
}) {
  const Icon = item.icon;

  const button = (
    <button
      type="button"
      onClick={() => onNavigate(item.id)}
      className={cn(
        'relative flex items-center rounded-lg transition-colors group',
        isExpanded
          ? 'w-full h-9 gap-2.5 px-2.5 justify-start'
          : 'w-10 h-10 justify-center',
        isActive
          ? 'bg-primary/15 text-primary'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
      )}
    >
      {isActive && (
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-primary rounded-r-full" />
      )}
      <Icon className="h-[18px] w-[18px] shrink-0" />
      {isExpanded && (
        <span className="text-[13px] font-medium truncate">{item.label}</span>
      )}
    </button>
  );

  // Only show the tooltip in collapsed mode — labels are visible when expanded.
  if (isExpanded) return button;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side="right" sideOffset={8}>
        {item.label}
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * NavRail — Vertical sidebar (Linear/Cursor style).
 * Collapsed: 56px icon rail with tooltips.
 * Expanded:  224px labeled rail with icon + text.
 */
export function NavRail({
  activeView,
  onNavigate,
  skills,
  className,
  isExpanded = false,
}: NavRailProps) {
  const coreItems: NavItem[] = [
    { id: 'chat', label: 'AI Chat', icon: MessageSquare, section: 'core' },
    { id: 'skills', label: 'Skills', icon: Zap, section: 'core' },
    { id: 'video-gen', label: 'Video Studio', icon: Video, section: 'core' },
    { id: 'image-gen', label: 'Image Studio', icon: ImageIcon, section: 'core' },
    { id: 'node-system', label: 'Node Editor', icon: Network, section: 'core' },
  ];

  // Dynamic skill items with UIs
  const skillItems: NavItem[] = skills
    .filter((s) => s.hasUI && s.id !== 'default')
    .map((s) => ({
      id: s.id,
      label: s.name,
      icon: ICON_MAP[s.icon || 'bot'] || Bot,
      section: 'skills' as const,
    }));

  const systemItem: NavItem = {
    id: 'settings',
    label: 'Settings',
    icon: Settings,
    section: 'system',
  };

  return (
    <nav
      className={cn(
        'flex flex-col bg-sidebar border-r border-sidebar-border py-3 gap-1 shrink-0 transition-[width] duration-200',
        isExpanded ? 'w-56 items-stretch' : 'w-14 items-center',
        className
      )}
    >
      {/* Core section */}
      <div
        className={cn(
          'flex flex-col gap-1 w-full',
          isExpanded ? 'items-stretch px-2' : 'items-center px-1.5'
        )}
      >
        {isExpanded && (
          <div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground px-2.5 py-1.5">
            Workspace
          </div>
        )}
        {coreItems.map((item) => (
          <NavButton
            key={item.id}
            item={item}
            isActive={activeView === item.id}
            isExpanded={isExpanded}
            onNavigate={onNavigate}
          />
        ))}
      </div>

      {/* Skills section */}
      {skillItems.length > 0 && (
        <>
          {isExpanded ? (
            <div className="h-px bg-sidebar-border my-2 mx-2" />
          ) : (
            <div className="w-6 h-px bg-sidebar-border my-2 self-center" />
          )}
          <div
            className={cn(
              'flex flex-col gap-1 w-full',
              isExpanded ? 'items-stretch px-2' : 'items-center px-1.5'
            )}
          >
            {isExpanded && (
              <div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground px-2.5 py-1.5">
                Skills
              </div>
            )}
            {skillItems.map((item) => (
              <NavButton
                key={item.id}
                item={item}
                isActive={activeView === item.id}
                isExpanded={isExpanded}
                onNavigate={onNavigate}
              />
            ))}
          </div>
        </>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* System — bottom */}
      <div
        className={cn(
          'flex flex-col gap-1 w-full',
          isExpanded ? 'items-stretch px-2' : 'items-center px-1.5'
        )}
      >
        <NavButton
          item={systemItem}
          isActive={activeView === 'settings'}
          isExpanded={isExpanded}
          onNavigate={onNavigate}
        />
      </div>
    </nav>
  );
}
