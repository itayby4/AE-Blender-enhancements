import { useState, useEffect, useRef, useCallback } from 'react';
import { Minus, Maximize2, Minimize2, X } from 'lucide-react';
import { cn } from '../../lib/utils.js';
import { PipeFxLogo } from '../brand/PipeFxLogo.js';

// ────────────────────────────────────────────────────────
// Tauri 2 Window API — lazy-loaded, null in browser fallback
// ────────────────────────────────────────────────────────

let _tauriWindow: Awaited<ReturnType<typeof import('@tauri-apps/api/window').getCurrentWindow>> | null = null;
let _tauriLoaded = false;

async function getTauriWindow() {
  if (_tauriLoaded) return _tauriWindow;
  try {
    const mod = await import('@tauri-apps/api/window');
    _tauriWindow = mod.getCurrentWindow();
    _tauriLoaded = true;
    return _tauriWindow;
  } catch {
    _tauriLoaded = true;
    return null;
  }
}

// ────────────────────────────────────────────────────────
// Menu definitions — File / Edit / View / Help
// ────────────────────────────────────────────────────────

interface MenuItem {
  label: string;
  shortcut?: string;
  action?: () => void;
  divider?: boolean;
  disabled?: boolean;
}

interface MenuDef {
  label: string;
  items: MenuItem[];
}

interface TitleBarProps {
  children?: React.ReactNode;
  className?: string;
  onNavigate?: (view: string) => void;
  onClearChat?: () => void;
  onToggleRightPanel?: () => void;
}

/**
 * TitleBar — Custom Tauri window chrome with traditional menu bar.
 *
 * Uses Tauri 2 startDragging() API for window drag (not -webkit-app-region).
 * Implements File/Edit/View/Help menus like professional desktop software.
 */
export function TitleBar({ children, className, onNavigate, onClearChat, onToggleRightPanel }: TitleBarProps) {
  const [isMaximized, setIsMaximized] = useState(false);
  const [openMenu, setOpenMenu] = useState<string | null>(null);

  // Track maximized state
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const win = await getTauriWindow();
      if (win && !cancelled) {
        setIsMaximized(await win.isMaximized());
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const minimize = async () => (await getTauriWindow())?.minimize();
  const toggleMaximize = async () => {
    const win = await getTauriWindow();
    if (win) {
      await win.toggleMaximize();
      setIsMaximized(await win.isMaximized());
    }
  };
  const close = async () => (await getTauriWindow())?.close();

  const startDrag = async () => {
    const win = await getTauriWindow();
    if (win) {
      await win.startDragging();
    }
  };

  const menus: MenuDef[] = [
    {
      label: 'File',
      items: [
        { label: 'New Project', shortcut: 'Ctrl+N', action: () => onNavigate?.('chat') },
        { label: 'Open Skill...', shortcut: 'Ctrl+O', action: () => onNavigate?.('skills') },
        { divider: true, label: '' },
        { label: 'Settings', shortcut: 'Ctrl+,', action: () => onNavigate?.('settings') },
        { divider: true, label: '' },
        { label: 'Exit', shortcut: 'Alt+F4', action: close },
      ],
    },
    {
      label: 'Edit',
      items: [
        { label: 'Clear Chat', shortcut: 'Ctrl+Shift+D', action: onClearChat },
        { divider: true, label: '' },
        { label: 'Undo', shortcut: 'Ctrl+Z', disabled: true },
        { label: 'Redo', shortcut: 'Ctrl+Shift+Z', disabled: true },
      ],
    },
    {
      label: 'View',
      items: [
        { label: 'AI Chat', shortcut: 'Ctrl+1', action: () => onNavigate?.('chat') },
        { label: 'Skills', shortcut: 'Ctrl+2', action: () => onNavigate?.('skills') },
        { label: 'Video Studio', shortcut: 'Ctrl+3', action: () => onNavigate?.('video-gen') },
        { label: 'Image Studio', shortcut: 'Ctrl+4', action: () => onNavigate?.('image-gen') },
        { divider: true, label: '' },
        { label: 'Toggle Sidebar', shortcut: 'Ctrl+B', action: onToggleRightPanel },
        { label: 'Settings', action: () => onNavigate?.('settings') },
      ],
    },
    {
      label: 'Help',
      items: [
        { label: 'About PipeFX', action: () => onNavigate?.('settings') },
        { label: 'Documentation', disabled: true },
        { divider: true, label: '' },
        { label: 'Version 0.1.0', disabled: true },
      ],
    },
  ];

  const closeMenu = useCallback(() => setOpenMenu(null), []);

  return (
    <div className={cn('flex items-center shrink-0 bg-card border-b select-none h-10 surface-hero', className)}>
      {/* Drag surface (PipeFX brand) — compact logo-only */}
      <div
        className="h-full flex items-center pl-2 pr-2 shrink-0"
        onMouseDown={startDrag}
        onDoubleClick={toggleMaximize}
      >
        <PipeFxLogo className="h-6 w-6 text-foreground" />
      </div>

      {/* Menu bar */}
      <MenuBar
        menus={menus}
        openMenu={openMenu}
        onOpenMenu={setOpenMenu}
        onClose={closeMenu}
      />

      <div className="h-5 w-px bg-border mx-1 shrink-0" />

      {/* App-specific toolbar content (project selector, search, etc.) */}
      <div
        className="flex-1 flex items-center min-w-0 gap-1 h-full"
        onMouseDown={startDrag}
        onDoubleClick={toggleMaximize}
      >
        {children}
      </div>

      {/* Window controls — always far-right */}
      <WindowControls
        isMaximized={isMaximized}
        onMinimize={minimize}
        onMaximize={toggleMaximize}
        onClose={close}
      />
    </div>
  );
}

// ────────────────────────────────────────────────────────
// MenuBar — File / Edit / View / Help
// ────────────────────────────────────────────────────────

function MenuBar({
  menus,
  openMenu,
  onOpenMenu,
  onClose,
}: {
  menus: MenuDef[];
  openMenu: string | null;
  onOpenMenu: (label: string | null) => void;
  onClose: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Close when clicking outside
  useEffect(() => {
    if (!openMenu) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [openMenu, onClose]);

  return (
    <div ref={containerRef} className="flex items-center gap-0">
      {menus.map((menu) => (
        <div key={menu.label} className="relative">
          <button
            className={cn(
              'px-2.5 py-1 text-xs rounded-md transition-colors',
              openMenu === menu.label
                ? 'bg-muted text-foreground'
                : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
            )}
            onClick={() => onOpenMenu(openMenu === menu.label ? null : menu.label)}
            onMouseEnter={() => openMenu && onOpenMenu(menu.label)}
          >
            {menu.label}
          </button>

          {/* Dropdown */}
          {openMenu === menu.label && (
            <div className="absolute top-full left-0 mt-0.5 z-50 min-w-[200px] depth-2 rounded-lg py-1 animate-in fade-in-0 zoom-in-95 duration-100">
              {menu.items.map((item, i) =>
                item.divider ? (
                  <div key={i} className="h-px bg-border my-1 mx-2" />
                ) : (
                  <button
                    key={item.label}
                    className={cn(
                      'w-full flex items-center justify-between px-3 py-1.5 text-xs',
                      item.disabled
                        ? 'text-muted-foreground/50 cursor-default'
                        : 'text-foreground hover:bg-accent hover:text-accent-foreground'
                    )}
                    disabled={item.disabled}
                    onClick={() => {
                      if (!item.disabled) {
                        item.action?.();
                        onClose();
                      }
                    }}
                  >
                    <span>{item.label}</span>
                    {item.shortcut && (
                      <span className="text-[10px] text-muted-foreground ml-6 font-mono">
                        {item.shortcut}
                      </span>
                    )}
                  </button>
                )
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ────────────────────────────────────────────────────────
// Window Controls — Min / Max / Close
// ────────────────────────────────────────────────────────

function WindowControls({
  isMaximized,
  onMinimize,
  onMaximize,
  onClose,
}: {
  isMaximized: boolean;
  onMinimize: () => void;
  onMaximize: () => void;
  onClose: () => void;
}) {
  return (
    <div className="flex items-center h-full shrink-0">
      <button
        onClick={onMinimize}
        aria-label="Minimize"
        className="flex items-center justify-center w-12 h-full text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
      >
        <Minus className="w-3.5 h-3.5" />
      </button>
      <button
        onClick={onMaximize}
        aria-label={isMaximized ? 'Restore' : 'Maximize'}
        className="flex items-center justify-center w-12 h-full text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
      >
        {isMaximized ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
      </button>
      <button
        onClick={onClose}
        aria-label="Close"
        className="flex items-center justify-center w-12 h-full text-muted-foreground hover:bg-destructive hover:text-white transition-colors"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
