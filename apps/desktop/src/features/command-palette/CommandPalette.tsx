import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  MessageSquare,
  Zap,
  Video,
  ImageIcon,
  Network,
  Scissors,
  Settings,
  Trash2,
  Brain,
  Search,
  type LucideIcon,
} from 'lucide-react';

interface Command {
  id: string;
  label: string;
  icon: LucideIcon;
  shortcut?: string;
  section: string;
  action: () => void;
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (view: string) => void;
  onClearChat: () => void;
  onOpenPreferences: () => void;
}

/**
 * CommandPalette — Global Ctrl+K overlay.
 * Grouped results with fuzzy matching, keyboard navigation, and shortcut badges.
 */
export function CommandPalette({
  isOpen,
  onClose,
  onNavigate,
  onClearChat,
  onOpenPreferences,
}: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const commands = useMemo<Command[]>(
    () => [
      // Navigation
      { id: 'nav-chat', label: 'AI Chat', icon: MessageSquare, shortcut: 'Ctrl+1', section: 'Navigation', action: () => onNavigate('chat') },
      { id: 'nav-skills', label: 'Skills', icon: Zap, shortcut: 'Ctrl+2', section: 'Navigation', action: () => onNavigate('skills') },
      { id: 'nav-video', label: 'Video Studio', icon: Video, shortcut: 'Ctrl+3', section: 'Navigation', action: () => onNavigate('video-gen') },
      { id: 'nav-image', label: 'Image Studio', icon: ImageIcon, shortcut: 'Ctrl+4', section: 'Navigation', action: () => onNavigate('image-gen') },
      { id: 'nav-node', label: 'Node Editor', icon: Network, shortcut: 'Ctrl+5', section: 'Navigation', action: () => onNavigate('node-system') },
      { id: 'nav-autopod', label: 'AutoPod Studio', icon: Scissors, shortcut: 'Ctrl+6', section: 'Navigation', action: () => onNavigate('autopod') },
      // Actions
      { id: 'act-clear', label: 'Clear Chat History', icon: Trash2, section: 'Actions', action: onClearChat },
      { id: 'act-brain', label: 'Project Brain', icon: Brain, section: 'Actions', action: () => onNavigate('chat') },
      // Settings
      { id: 'set-pref', label: 'API Keys & Preferences', icon: Settings, shortcut: 'Ctrl+,', section: 'Settings', action: onOpenPreferences },
    ],
    [onNavigate, onClearChat, onOpenPreferences]
  );

  const filtered = useMemo(() => {
    if (!query.trim()) return commands;
    const q = query.toLowerCase();
    return commands.filter(
      (c) =>
        c.label.toLowerCase().includes(q) ||
        c.section.toLowerCase().includes(q)
    );
  }, [query, commands]);

  const grouped = useMemo(() => {
    const groups: Record<string, Command[]> = {};
    for (const cmd of filtered) {
      if (!groups[cmd.section]) groups[cmd.section] = [];
      groups[cmd.section].push(cmd);
    }
    return groups;
  }, [filtered]);

  // Reset on open
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const executeSelected = useCallback(() => {
    if (filtered[selectedIndex]) {
      filtered[selectedIndex].action();
      onClose();
    }
  }, [filtered, selectedIndex, onClose]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      executeSelected();
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  if (!isOpen) return null;

  let flatIndex = 0;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh]">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Palette */}
      <div
        className="relative w-full max-w-lg bg-popover border border-border/60 rounded-xl shadow-2xl overflow-hidden animate-in fade-in-0 zoom-in-95 duration-150"
        onKeyDown={handleKeyDown}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b">
          <Search className="w-4 h-4 text-muted-foreground shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            placeholder="Search or run a command..."
            className="flex-1 bg-transparent text-[15px] text-foreground placeholder:text-muted-foreground outline-none"
          />
          <kbd className="px-2 py-0.5 rounded-md bg-muted border text-[10px] font-mono text-muted-foreground">
            Esc
          </kbd>
        </div>

        {/* Results */}
        <div className="max-h-[360px] overflow-y-auto p-1.5">
          {Object.entries(grouped).map(([section, cmds]) => (
            <div key={section}>
              <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {section}
              </div>
              {cmds.map((cmd) => {
                const itemIndex = flatIndex++;
                const Icon = cmd.icon;
                const isSelected = itemIndex === selectedIndex;
                return (
                  <button
                    key={cmd.id}
                    onClick={() => {
                      cmd.action();
                      onClose();
                    }}
                    onMouseEnter={() => setSelectedIndex(itemIndex)}
                    className={cn(
                      'flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm transition-colors',
                      isSelected
                        ? 'bg-primary/10 text-foreground'
                        : 'text-muted-foreground hover:bg-muted'
                    )}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="flex-1 text-left font-medium">{cmd.label}</span>
                    {cmd.shortcut && (
                      <kbd className="px-1.5 py-0.5 rounded-md bg-muted border text-[10px] font-mono text-muted-foreground">
                        {cmd.shortcut}
                      </kbd>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="px-3 py-8 text-center text-sm text-muted-foreground">
              No commands found
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Utility needed for cn usage
function cn(...classes: (string | false | undefined)[]) {
  return classes.filter(Boolean).join(' ');
}
