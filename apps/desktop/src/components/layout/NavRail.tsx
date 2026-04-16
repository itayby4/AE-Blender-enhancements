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
}

/**
 * NavRail — Vertical icon sidebar (Linear/Cursor style).
 * Compact icon-only rail with tooltips. Groups: Core, Skills, System.
 */
export function NavRail({ activeView, onNavigate, skills, className }: NavRailProps) {
  const coreItems: NavItem[] = [
    { id: 'chat', label: 'AI Chat', icon: MessageSquare, section: 'core' },
    { id: 'skills', label: 'Skills', icon: Zap, section: 'core' },
    { id: 'video-gen', label: 'Video Studio', icon: Video, section: 'core' },
    { id: 'image-gen', label: 'Image Studio', icon: ImageIcon, section: 'core' },
    { id: 'node-system', label: 'Node Editor', icon: Network, section: 'core' },
    { id: 'autopod', label: 'AutoPod', icon: Scissors, section: 'core' },
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

  return (
    <nav
      className={cn(
        'flex flex-col items-center w-14 bg-sidebar border-r border-sidebar-border py-3 gap-1 shrink-0 animate-panel-enter',
        className
      )}
    >
      {/* Core section */}
      <div className="flex flex-col items-center gap-1 w-full px-1.5">
        {coreItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeView === item.id;
          return (
            <Tooltip key={item.id}>
              <TooltipTrigger
                  onClick={() => onNavigate(item.id)}
                  className={cn(
                    'flex items-center justify-center w-10 h-10 rounded-lg transition-all duration-150 group relative hover-scale',
                    isActive
                      ? 'bg-primary/15 text-primary'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  )}
                >
                  {isActive && (
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-primary rounded-r-full" />
                  )}
                  <Icon className="h-[18px] w-[18px]" />
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={8}>
                {item.label}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>

      {/* Skills divider */}
      {skillItems.length > 0 && (
        <>
          <div className="w-6 h-px bg-sidebar-border my-2" />
          <div className="flex flex-col items-center gap-1 w-full px-1.5">
            {skillItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeView === item.id;
              return (
                <Tooltip key={item.id}>
                  <TooltipTrigger
                      onClick={() => onNavigate(item.id)}
                      className={cn(
                        'flex items-center justify-center w-10 h-10 rounded-lg transition-all duration-150 relative hover-scale',
                        isActive
                          ? 'bg-primary/15 text-primary'
                          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                      )}
                    >
                      {isActive && (
                        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-primary rounded-r-full" />
                      )}
                      <Icon className="h-[18px] w-[18px]" />
                  </TooltipTrigger>
                  <TooltipContent side="right" sideOffset={8}>
                    {item.label}
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        </>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* System — bottom */}
      <div className="flex flex-col items-center gap-1 w-full px-1.5">
        <Tooltip>
          <TooltipTrigger
              onClick={() => onNavigate('settings')}
              className={cn(
                'flex items-center justify-center w-10 h-10 rounded-lg transition-all duration-150 hover-scale',
                activeView === 'settings'
                  ? 'bg-primary/15 text-primary'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              <Settings className="h-[18px] w-[18px]" />
          </TooltipTrigger>
          <TooltipContent side="right" sideOffset={8}>
            Settings
          </TooltipContent>
        </Tooltip>
      </div>
    </nav>
  );
}
