import { useState, useEffect, useMemo, useCallback, useRef, type MouseEvent as ReactMouseEvent } from 'react';
import {
  PanelRightClose,
  PanelLeftClose,
  PanelLeftOpen,
  Scissors,
  PaintBucket,
  Volume2,
  Wand2,
  Play,
  Type,
  AlignLeft,
  Settings,
  Brain,
  MessageSquare,
  Zap,
  Video,
  ImageIcon,
  Network,
  Trash2,
  FilePlus,
} from 'lucide-react';
import { Button } from '../components/ui/button.js';
import { Card, CardContent } from '../components/ui/card.js';
import { ScrollArea } from '../components/ui/scroll-area.js';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select.js';
import { cn } from '../lib/utils.js';
import { loadSkills, filterSkillsByApp, type Skill } from '../lib/load-skills.js';
import { usePinnedSkills } from '../lib/pinned-skills.js';
import { fetchProjects, createProject, switchApp, getActiveAppState } from '../lib/api.js';

// Layout
import { NavRail } from '../components/layout/NavRail.js';
import { ConnectorStatus } from '@pipefx/connectors/ui';
import { TitleBar } from '../components/layout/TitleBar.js';
import { TerminalSpinner } from '../components/ui/TerminalSpinner.js';
import { PipeFxLogo } from '../components/brand/PipeFxLogo.js';

// Features
import { ChatPanel, parseMessageContent } from '@pipefx/chat/ui';
import { CommandPalette } from '@pipefx/command-palette/ui';
import type { CommandSource } from '@pipefx/command-palette/contracts';
import {
  createAuthoringSource,
  createSkillsSource,
  ScaffoldDialog,
  SkillEditor,
  useSkills,
} from '@pipefx/skills/ui';
import type { InstalledSkill } from '@pipefx/skills/contracts';
// Side-effect import: seeds the desktop's bundled-skill registry with
// the modules from `@pipefx/skills-builtin`. The runner host consumes
// the singleton from `./bundled-skill-registry.js` once 12.10 lands.
import './bundled-skill-registry.js';
import { NewProjectDialog } from '../features/projects/NewProjectDialog.js';
import { MediaPool } from '../features/projects/MediaPool.js';
import { VideoGenDashboard } from '../features/video-gen/VideoGenDashboard.js';
import { ImageGenDashboard } from '../features/image-gen/ImageGenDashboard.js';
import { NodeSystemDashboard } from '@pipefx/node-system/ui';
import { SkillsPage } from '@pipefx/skills/ui';
import { BundledSkillLauncher } from './BundledSkillLauncher.js';
import { SkillQuickFilter } from './SkillQuickFilter.js';
import { SkillPlannerPage } from '../features/skills/SkillPlannerPage.js';
import { TaskManagerWidget } from '../features/skills/TaskManagerWidget.js';
import { PlanApprovalModal } from '../components/PlanApprovalModal.js';
import { SettingsPage } from '../features/settings/SettingsPage.js';
import { applyPalette } from '../lib/palette-runtime.js';
import { applyCornerMode, loadCornerMode, type CornerMode } from '../lib/corners-runtime.js';
import { Toaster } from '../components/ui/sonner.js';
import { TooltipProvider } from '../components/ui/tooltip.js';

// Hooks
import { useTaskStream } from '../hooks/useTaskStream.js';
import { useChat, useChatHistory } from '@pipefx/chat/ui';
import { dispatchPipelineActions } from '@pipefx/node-system';

// Auth
import { getAccessToken, useAuth } from '@pipefx/auth/ui';
import { LoginPage } from '../features/auth/LoginPage.js';

// ── Static Data ──

const DEFAULT_SKILLS: Skill[] = [
  { id: 'default', name: 'Default Assistant', description: 'General-purpose AI assistant', icon: 'bot', category: 'general' },
];

const MACRO_CATEGORIES = [
  { id: 'edit', name: 'Editing', icon: Scissors },
  { id: 'color', name: 'Color Grading', icon: PaintBucket },
  { id: 'audio', name: 'Fairlight', icon: Volume2 },
  { id: 'fx', name: 'Fusion', icon: Wand2 },
];

const MACROS = [
  { id: 'cut', category: 'edit', name: 'Ripple Cut', icon: Scissors, hotkey: 'Ctrl+Shift+X' },
  { id: 'add_text', category: 'edit', name: 'Add Text+', icon: Type, hotkey: 'T' },
  { id: 'align', category: 'edit', name: 'Align Clips', icon: AlignLeft, hotkey: 'Alt+A' },
  { id: 'grade_1', category: 'color', name: 'Apply Rec.709 LUT', icon: PaintBucket, hotkey: 'Num 1' },
  { id: 'grade_2', category: 'color', name: 'Teal & Orange', icon: PaintBucket, hotkey: 'Num 2' },
  { id: 'node_add', category: 'color', name: 'Add Serial Node', icon: Wand2, hotkey: 'Alt+S' },
  { id: 'audio_sync', category: 'audio', name: 'Auto-Sync Audio', icon: Volume2, hotkey: 'Ctrl+Alt+S' },
  { id: 'render', category: 'fx', name: 'Render Cache', icon: Play, hotkey: 'Ctrl+R' },
];

// ═══════════════════════════════════════════════════════════════
// App — Thin shell composing the Command Center
// ═══════════════════════════════════════════════════════════════

export function App() {
  // ── Auth ──
  const { user, isLoading: isAuthLoading } = useAuth();

  // ── Core UI State ──
  const [activeView, setActiveView] = useState('chat');
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(true);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [paletteInitialQuery, setPaletteInitialQuery] = useState('');
  const [palettePinnedSourceId, setPalettePinnedSourceId] = useState<string | undefined>(undefined);

  // 12.10.5 — compact `/` skill picker anchored above the chat input.
  // Open state derives from chat-input content (see effect below): if
  // the user types `/foo` (no space), the popover opens with `foo` as
  // the filter; deleting the `/` closes it.
  const [isQuickFilterOpen, setIsQuickFilterOpen] = useState(false);

  // ── Left NavRail Expanded ── narrow icon rail (default) vs wide labeled rail
  const [isNavRailExpanded, setIsNavRailExpanded] = useState<boolean>(() => {
    return localStorage.getItem('pipefx-nav-expanded') === 'true';
  });

  useEffect(() => {
    localStorage.setItem('pipefx-nav-expanded', String(isNavRailExpanded));
  }, [isNavRailExpanded]);

  // ── Right Panel Mode ── 'project' (Project Brain) | 'chat' (sidebar chat)
  //    persisted in localStorage so it survives reloads.
  const [rightPanelMode, setRightPanelMode] = useState<'project' | 'chat'>(() => {
    const stored = localStorage.getItem('pipefx-right-panel-mode');
    return stored === 'chat' ? 'chat' : 'project';
  });

  useEffect(() => {
    localStorage.setItem('pipefx-right-panel-mode', rightPanelMode);
  }, [rightPanelMode]);

  // ── Right Panel Width ── user-controllable via drag handle.
  //    Stored per-mode so Project and Chat remember their own widths.
  const RIGHT_PANEL_MIN = 240;
  const RIGHT_PANEL_MAX = 640;
  const RIGHT_PANEL_DEFAULTS = { project: 300, chat: 400 } as const;

  const [rightPanelWidths, setRightPanelWidths] = useState<{ project: number; chat: number }>(() => {
    const stored = localStorage.getItem('pipefx-right-panel-widths');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        return {
          project: typeof parsed.project === 'number' ? parsed.project : RIGHT_PANEL_DEFAULTS.project,
          chat: typeof parsed.chat === 'number' ? parsed.chat : RIGHT_PANEL_DEFAULTS.chat,
        };
      } catch {
        // Fall through to defaults
      }
    }
    return { ...RIGHT_PANEL_DEFAULTS };
  });

  useEffect(() => {
    localStorage.setItem('pipefx-right-panel-widths', JSON.stringify(rightPanelWidths));
  }, [rightPanelWidths]);

  const rightPanelWidth = rightPanelWidths[rightPanelMode];

  // Drag-to-resize state — uses refs to avoid re-renders during drag.
  const [isResizing, setIsResizing] = useState(false);
  const resizeStateRef = useRef<{ startX: number; startWidth: number; mode: 'project' | 'chat' } | null>(null);

  const handleResizeStart = useCallback((e: ReactMouseEvent) => {
    e.preventDefault();
    resizeStateRef.current = {
      startX: e.clientX,
      startWidth: rightPanelWidth,
      mode: rightPanelMode,
    };
    setIsResizing(true);
  }, [rightPanelWidth, rightPanelMode]);

  useEffect(() => {
    if (!isResizing) return;

    const onMove = (e: MouseEvent) => {
      const state = resizeStateRef.current;
      if (!state) return;
      // Dragging leftward increases width (handle is on the LEFT edge of right panel)
      const delta = state.startX - e.clientX;
      const next = Math.max(RIGHT_PANEL_MIN, Math.min(RIGHT_PANEL_MAX, state.startWidth + delta));
      setRightPanelWidths((prev) => ({ ...prev, [state.mode]: next }));
    };

    const onUp = () => {
      resizeStateRef.current = null;
      setIsResizing(false);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    // Block text selection & show resize cursor globally during drag
    const prevUserSelect = document.body.style.userSelect;
    const prevCursor = document.body.style.cursor;
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';

    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.body.style.userSelect = prevUserSelect;
      document.body.style.cursor = prevCursor;
    };
  }, [isResizing]);

  const handleResizeDoubleClick = useCallback(() => {
    // Reset current mode's width to its default
    setRightPanelWidths((prev) => ({ ...prev, [rightPanelMode]: RIGHT_PANEL_DEFAULTS[rightPanelMode] }));
  }, [rightPanelMode]);

  // ── Palette State ── persisted in localStorage
  const [activePalette, setActivePalette] = useState<string>(() => {
    return localStorage.getItem('pipefx-palette') || 'cool-teal';
  });

  // Apply palette to <html> and persist
  useEffect(() => {
    applyPalette(activePalette, []);
    localStorage.setItem('pipefx-palette', activePalette);
  }, [activePalette]);

  // ── Corner Shape State ── persisted in localStorage
  const [cornerMode, setCornerMode] = useState<CornerMode>(() => loadCornerMode());

  // Apply corner mode to <html> and persist
  useEffect(() => {
    applyCornerMode(cornerMode);
  }, [cornerMode]);
  const [chatInput, setChatInput] = useState('');

  // ── App & Project State ──
  const [activeApp, setActiveApp] = useState('resolve');
  const [isConnected] = useState(true);
  const [projects, setProjects] = useState<any[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string>('');
  const [syncPrompt, setSyncPrompt] = useState<{
    resolveName: string;
    pipefxId: string;
    pipefxName: string;
  } | null>(null);

  // ── Skills State ──
  const [skills, setSkills] = useState<Skill[]>(DEFAULT_SKILLS);
  const [selectedSkillId, setSelectedSkillId] = useState('default');
  const [selectedLlmModel, setSelectedLlmModel] = useState('gemini-3.1-pro-preview');
  const [activePlanContent, setActivePlanContent] = useState<string | null>(null);
  const [isTaskWidgetMinimized, setIsTaskWidgetMinimized] = useState(false);

  const filteredSkills = useMemo(
    () => filterSkillsByApp(skills, activeApp),
    [skills, activeApp]
  );

  // ── Hooks ──
  const { taskMap, activeTasks } = useTaskStream(activeProjectId);

  const chatHistory = useChatHistory(activeProjectId);

  const chat = useChat({
    selectedLlmModel,
    activeApp,
    activeProjectId,
    onNavigate: setActiveView,
    onTurnComplete: (finalText) => {
      // Detect plan blocks in the completed assistant message and surface
      // them to the Skill Planner view.
      const parts = parseMessageContent(finalText);
      const planPart = parts.find(
        (p) => typeof p === 'object' && p.type === 'plan'
      );
      if (planPart) {
        setActivePlanContent((planPart as { content: string }).content);
        setActiveView('skill-planner');
      }
      // The freshly-created session is now visible server-side.
      void chatHistory.refreshSessions();
    },
    sessionId: chatHistory.activeSessionId,
    onSessionIdChange: chatHistory.setActiveSessionId,
    dispatchPipelineActions: (actions) =>
      dispatchPipelineActions(actions as Parameters<typeof dispatchPipelineActions>[0]),
  });

  // Resolve the currently-selected skill (if any) so we can pass it per
  // send to `chat.sendMessage`.
  const resolveActiveSkill = useCallback(
    (overrideSkill?: Skill): Skill | undefined => {
      if (overrideSkill) return overrideSkill;
      if (selectedSkillId === 'default') return undefined;
      return skills.find((s) => s.id === selectedSkillId);
    },
    [skills, selectedSkillId]
  );

  // ── Effects ──

  // Load skills on mount
  useEffect(() => {
    loadSkills().then(setSkills);
  }, []);

  // Fetch projects on mount
  useEffect(() => {
    fetchProjects().then(setProjects).catch(console.error);
  }, []);

  // Switch active NLE app
  useEffect(() => {
    switchApp(activeApp).catch(console.error);
  }, [activeApp]);

  // Poll for Resolve project sync
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const data = await getActiveAppState();
        const resolveProjName = data.activeProjectName;
        if (resolveProjName) {
          const match = projects.find((p) => p.externalProjectName === resolveProjName);
          if (match && activeProjectId !== match.id && syncPrompt?.pipefxId !== match.id) {
            setSyncPrompt({
              resolveName: resolveProjName,
              pipefxId: match.id,
              pipefxName: match.name,
            });
          }
        }
      } catch {
        // best-effort sync; ignore failures so the interval keeps running
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [projects, activeProjectId, syncPrompt]);

  // Global keyboard shortcuts
  useEffect(() => {
    const handler = (e: globalThis.KeyboardEvent) => {
      // Ctrl+K — palette unfiltered
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setPaletteInitialQuery('');
        setPalettePinnedSourceId(undefined);
        setIsCommandPaletteOpen((v) => !v);
        return;
      }
      // 12.10.5 followup: `/` is no longer intercepted globally — it
      // types into the chat input naturally, and `SkillQuickFilter` is
      // driven by `chatInput` content via the effect below. Deleting
      // the `/` automatically closes the popover.
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // 12.10.5 popover sync — open while chat input starts with `/` and
  // contains no space; close otherwise. The popover only shows when
  // the chat view is active (other views don't have a chat input).
  useEffect(() => {
    if (activeView !== 'chat') {
      setIsQuickFilterOpen(false);
      return;
    }
    const v = chatInput;
    setIsQuickFilterOpen(v.startsWith('/') && !v.includes(' '));
  }, [chatInput, activeView]);

  // ── Handlers ──

  const [isNewProjectOpen, setIsNewProjectOpen] = useState(false);

  const handleCreateProject = useCallback(() => {
    setIsNewProjectOpen(true);
  }, []);

  const handleProjectCreated = useCallback(
    async ({ name, folderPath }: { name: string; folderPath: string }) => {
      const p = await createProject({ name, externalAppName: activeApp, folderPath });
      setProjects((prev) => [...prev, p]);
      setActiveProjectId(p.id);
    },
    [activeApp]
  );

  const activeProject = useMemo(
    () => projects.find((p) => p.id === activeProjectId),
    [projects, activeProjectId]
  );
  const activeProjectFolder: string | undefined = activeProject?.folderPath;

  // Does the activeView match a macro category?
  const isMacroView = MACRO_CATEGORIES.some((c) => c.id === activeView);

  // Shared ChatPanel props — used by BOTH the main chat view and the
  // optional right-sidebar chat. Both mounts read the same `chat` and
  // `chatHistory` hooks, so messages + sessions are automatically in sync.
  const chatPanelProps = {
    messages: chat.messages,
    isTyping: chat.isAiTyping,
    currentTaskId: chat.currentChatTaskId,
    taskMap,
    activeTasks,
    selectedLlmModel,
    selectedSkillId,
    skills: filteredSkills,
    activeApp,
    chatInput,
    onChatInputChange: setChatInput,
    onSendMessage: (text: string, skill?: Skill) => {
      if (!chatHistory.activeSessionId) {
        chatHistory.newSession();
      }
      void chat.sendMessage(text, resolveActiveSkill(skill));
    },
    onStopGeneration: chat.stopGeneration,
    onClearChat: chat.clearChat,
    onSelectSkill: setSelectedSkillId,
    onSelectModel: setSelectedLlmModel,
    onNavigate: setActiveView,
    onSkillsReloaded: setSkills,
    onPlanNavigate: (content: string) => {
      setActivePlanContent(content);
      setActiveView('skill-planner');
    },
    // Phase 12.14: chat-authored skill landed via SkillBuilderCard.
    // Refresh the v2 library so the skill card shows up immediately,
    // and pop the editor for inline iteration.
    onSkillCreated: (record: InstalledSkill) => {
      refreshSkills();
      setEditingSkill(record);
    },
    chatSessions: chatHistory.sessions,
    activeSessionId: chatHistory.activeSessionId,
    onLoadSession: async (id: string) => {
      const msgs = await chatHistory.loadSession(id);
      chat.setMessages(msgs);
    },
    onDeleteSession: (id: string) => {
      void chatHistory.deleteSession(id);
    },
    onNewSession: () => {
      chatHistory.newSession();
      chat.clearChat();
    },
    // Agent-system surface
    todos: chat.todos,
    subAgents: chat.subAgents,
    // Brand mark for the empty-state hero (chat package is brand-agnostic)
    heroLogo: (
      <PipeFxLogo
        className="h-16 w-16 @[280px]:h-20 @[280px]:w-20 @[360px]:h-24 @[360px]:w-24 @[460px]:h-28 @[460px]:w-28 text-foreground"
      />
    ),
  };

  // ── Command palette sources ──
  // The palette is source-pluggable (`@pipefx/command-palette`). Desktop
  // contributes a built-in source (navigation, settings, chat actions);
  // skills come from `createSkillsSource` over the SKILL.md library;
  // authoring entry points come from `createAuthoringSource` (12.12).
  const { skills: installedSkills, refresh: refreshSkills } = useSkills({
    getToken: getAccessToken,
  });

  // 12.12 — authoring overlays. State lives at app level so the palette,
  // library card edits, and the editor all funnel through the same
  // open/close handlers.
  const [isScaffoldOpen, setIsScaffoldOpen] = useState(false);
  const [editingSkill, setEditingSkill] = useState<InstalledSkill | null>(null);
  const pinnedSkillsState = usePinnedSkills();
  const pinnedNavItems = useMemo(
    () =>
      pinnedSkillsState.pinned
        .map((id) => {
          const match = installedSkills.find(
            (s) => s.skill.loaded.frontmatter.id === id
          );
          if (!match) return null;
          const fm = match.skill.loaded.frontmatter;
          return { id: fm.id, name: fm.name, icon: fm.icon };
        })
        .filter((x): x is { id: string; name: string; icon: string | undefined } => x !== null),
    [pinnedSkillsState.pinned, installedSkills]
  );

  const handleRunSkill = useCallback(
    (skill: InstalledSkill) => {
      // For now the palette routes a skill activation to the Library
      // surface. Once 12.10 ships bundled skills, this will hand off to
      // the runner and let the host mount the matching component.
      void skill;
      setActiveView('skills');
    },
    []
  );

  const desktopSource = useMemo<CommandSource>(
    () => ({
      id: 'desktop',
      label: 'Workspace',
      list: () => [
        { id: 'nav-chat', label: 'AI Chat', icon: MessageSquare, group: 'Navigation', shortcut: 'Ctrl+1', run: () => setActiveView('chat') },
        { id: 'nav-skills', label: 'Skills', icon: Zap, group: 'Navigation', shortcut: 'Ctrl+2', run: () => setActiveView('skills') },
        { id: 'nav-video', label: 'Video Studio', icon: Video, group: 'Navigation', shortcut: 'Ctrl+3', run: () => setActiveView('video-gen') },
        { id: 'nav-image', label: 'Image Studio', icon: ImageIcon, group: 'Navigation', shortcut: 'Ctrl+4', run: () => setActiveView('image-gen') },
        { id: 'nav-node', label: 'Node Editor', icon: Network, group: 'Navigation', shortcut: 'Ctrl+5', run: () => setActiveView('node-system') },
        { id: 'nav-autopod', label: 'AutoPod Studio', icon: Scissors, group: 'Navigation', shortcut: 'Ctrl+6', run: () => setActiveView('autopod') },
        { id: 'act-clear', label: 'Clear Chat History', icon: Trash2, group: 'Actions', run: () => chat.clearChat() },
        { id: 'act-brain', label: 'Project Brain', icon: Brain, group: 'Actions', run: () => setActiveView('chat') },
        { id: 'set-pref', label: 'API Keys & Preferences', icon: Settings, group: 'Settings', shortcut: 'Ctrl+,', run: () => setActiveView('settings') },
      ],
    }),
    [chat]
  );

  const skillsSource = useMemo<CommandSource>(
    () =>
      createSkillsSource({
        getSkills: () => installedSkills,
        onRun: handleRunSkill,
      }),
    [installedSkills, handleRunSkill]
  );

  const authoringSource = useMemo<CommandSource>(
    () =>
      createAuthoringSource({
        createSkillIcon: FilePlus,
        onCreateSkill: () => setIsScaffoldOpen(true),
      }),
    []
  );

  const paletteSources = useMemo(
    () => [desktopSource, skillsSource, authoringSource],
    [desktopSource, skillsSource, authoringSource]
  );

  // ── Auth Gate ──
  // All hooks above run on every render — gate rendering only, not hook order.
  if (isAuthLoading) return null;
  if (!user) return <LoginPage />;

  return (
    <TooltipProvider delay={300}>
      <div className="flex flex-col h-screen bg-background text-foreground font-sans overflow-hidden select-none relative">
        {/* Toast provider */}
        <Toaster position="top-right" />

        {/* Skip to content — accessibility */}
        <a href="#chat-input" className="sr-only focus:not-sr-only focus:absolute focus:z-[100] focus:top-2 focus:left-2 focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-lg focus:text-sm focus:font-medium">
          Skip to chat input
        </a>

        {/* ── Task Manager Widget (floating) ── */}
        <TaskManagerWidget
          tasks={activeTasks.filter((t) => !t.id.startsWith('chat-'))}
          isMinimized={isTaskWidgetMinimized}
          onMinimize={() => setIsTaskWidgetMinimized(true)}
        />

        {/* ── Plan Approval Modal (blocking; on plan_proposed SSE) ── */}
        <PlanApprovalModal
          pendingPlan={chat.pendingPlan}
          onResolved={chat.resolvePendingPlan}
        />

        {/* ── Command Palette ── */}
        <CommandPalette
          isOpen={isCommandPaletteOpen}
          onClose={() => setIsCommandPaletteOpen(false)}
          sources={paletteSources}
          initialQuery={paletteInitialQuery}
          pinnedSourceId={palettePinnedSourceId}
        />

        {/* ── New Project dialog ── */}
        <NewProjectDialog
          isOpen={isNewProjectOpen}
          onClose={() => setIsNewProjectOpen(false)}
          onCreated={handleProjectCreated}
        />

        {/* ── Skill authoring overlays (Phase 12.12) ── */}
        <ScaffoldDialog
          isOpen={isScaffoldOpen}
          onClose={() => setIsScaffoldOpen(false)}
          getToken={getAccessToken}
          onCreated={(record) => {
            refreshSkills();
            setEditingSkill(record);
          }}
        />
        <SkillEditor
          isOpen={editingSkill !== null}
          onClose={() => setEditingSkill(null)}
          skill={editingSkill}
          getToken={getAccessToken}
          onSaved={() => refreshSkills()}
        />

        {/* ── Compact `/` skill quick-filter (12.10.5) ── */}
        <SkillQuickFilter
          isOpen={isQuickFilterOpen}
          query={chatInput}
          skills={installedSkills}
          getAnchor={() => document.getElementById('chat-input')}
          onClose={() => {
            // Esc clears the chat-input `/` so the open-condition
            // effect doesn't immediately re-open the popover.
            setChatInput('');
            setIsQuickFilterOpen(false);
          }}
          onSelectBundled={(_id, name) => {
            // Trailing space ensures the popover's open-condition
            // (no-space) fails and stays closed. The launcher mounts
            // when activeView changes; the chat input keeps `/Name `
            // as a visual cue.
            setChatInput(`/${name} `);
            setActiveView(`skill:${_id}`);
          }}
          onSelectInline={(id, name, trigger) => {
            // Inline skills (prompt/script) — drop the `/Name ` hint
            // (or the explicit slash trigger if defined) into chat so
            // the user can append the actual prompt.
            const prefix = trigger ?? `/${name}`;
            setChatInput(`${prefix} `);
            void id;
          }}
        />



        {/* ── Sync Prompt Toast ── */}
        {syncPrompt && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 bg-primary/95 text-primary-foreground px-5 py-3 rounded-xl shadow-xl border border-primary-foreground/20 flex items-center gap-4 animate-in fade-in slide-in-from-top-4">
            <div>
              <p className="text-sm font-semibold">DaVinci Project Detected</p>
              <p className="text-xs opacity-90 mt-0.5">Switch to &lsquo;{syncPrompt.pipefxName}&rsquo;?</p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="secondary"
                className="h-7 text-xs bg-white text-primary hover:bg-white/90"
                onClick={() => {
                  setActiveProjectId(syncPrompt.pipefxId);
                  setSyncPrompt(null);
                }}
              >
                Sync Now
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs hover:bg-white/20"
                onClick={() => setSyncPrompt(null)}
              >
                Ignore
              </Button>
            </div>
          </div>
        )}

        {/* Toolbar (inside TitleBar for custom chrome) */}
        <TitleBar
          onNavigate={setActiveView}
          onClearChat={chat.clearChat}
          onToggleRightPanel={() => setIsRightPanelOpen(!isRightPanelOpen)}
        >
          {/* Project selector — stopPropagation prevents drag from stealing click */}
          <div onMouseDown={(e) => e.stopPropagation()}>
          <Select
            value={activeProjectId || 'none'}
            onValueChange={(val) => setActiveProjectId(val === 'none' ? '' : val ?? '')}
          >
            <SelectTrigger className="w-[140px] h-7 bg-muted/40 border-transparent hover:bg-muted text-xs font-semibold shrink-0">
              <SelectValue placeholder="No Project" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectLabel>My Linked Projects</SelectLabel>
                <SelectItem value="none">
                  (No Project)
                </SelectItem>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectGroup>
              <div className="p-2 border-t mt-1 space-y-1">
                <Button size="sm" variant="ghost" className="w-full text-xs justify-start" onClick={handleCreateProject}>
                  + New / Open project
                </Button>
              </div>
            </SelectContent>
          </Select>
          </div>

          {/* Flexible spacer */}
          <div className="flex-1 min-w-0" />

          {/* Command palette trigger */}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-muted-foreground hover:text-foreground gap-2 shrink-0"
            onClick={() => setIsCommandPaletteOpen(true)}
            onMouseDown={(e) => e.stopPropagation()}
          >
            Search...
            <kbd className="px-1.5 py-0.5 rounded bg-muted border text-[10px] font-mono">
              Ctrl+K
            </kbd>
          </Button>

          <div className="h-4 w-px bg-border mx-0.5 shrink-0" />

          {/* Active tasks indicator */}
          {activeTasks.filter((t) => !t.id.startsWith('chat-')).length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsTaskWidgetMinimized(false)}
              onMouseDown={(e) => e.stopPropagation()}
              className="h-7 gap-1.5 text-xs border-primary/50 text-primary bg-primary/10 hover:bg-primary/20 shrink-0 font-mono"
            >
              <TerminalSpinner bare className="text-[12px] text-primary" />
              {activeTasks.filter((t) => !t.id.startsWith('chat-')).length}
            </Button>
          )}

          {/* Left NavRail expand/collapse */}
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              'h-7 w-7 shrink-0',
              isNavRailExpanded ? 'text-primary bg-primary/10' : 'text-muted-foreground hover:text-foreground'
            )}
            onClick={() => setIsNavRailExpanded((v) => !v)}
            onMouseDown={(e) => e.stopPropagation()}
            title={isNavRailExpanded ? 'Collapse left sidebar' : 'Expand left sidebar'}
          >
            {isNavRailExpanded ? (
              <PanelLeftClose className="h-3.5 w-3.5" />
            ) : (
              <PanelLeftOpen className="h-3.5 w-3.5" />
            )}
          </Button>

          {/* Right panel toggle */}
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              'h-7 w-7 shrink-0',
              isRightPanelOpen ? 'text-primary bg-primary/10' : 'text-muted-foreground hover:text-foreground'
            )}
            onClick={() => setIsRightPanelOpen(!isRightPanelOpen)}
            onMouseDown={(e) => e.stopPropagation()}
            title="Toggle right panel"
          >
            <PanelRightClose className="h-3.5 w-3.5" />
          </Button>
        </TitleBar>

        {/* ═══ MAIN CONTENT — Bento Command Center ═══ */}
        <main className="flex flex-1 min-h-0">
          {/* NavRail */}
          <NavRail
            activeView={activeView}
            onNavigate={setActiveView}
            skills={filteredSkills}
            pinnedSkills={pinnedNavItems}
            isExpanded={isNavRailExpanded}
          />

          {/* Center content area */}
          <div className="flex-1 min-w-0 min-h-0 flex gap-3 p-2.5 overflow-hidden">
            {/* ── Primary Panel ── */}
            <div className="flex-1 min-h-0 flex flex-col">
              {/* Chat View — Hero Panel */}
              {activeView === 'chat' && <ChatPanel {...chatPanelProps} />}

              {/* Settings Page */}
              {activeView === 'settings' && (
                <div className="flex-1 min-h-0">
                  <SettingsPage
                    onClose={() => setActiveView('chat')}
                    activePalette={activePalette}
                    onPaletteChange={setActivePalette}
                    cornerMode={cornerMode}
                    onCornerModeChange={setCornerMode}
                  />
                </div>
              )}

              {/* Skill Library — Phase 12.7 rebuild, split in 12.10.5.
                  Two nav-rail entries:
                    - "Skills" (Zap icon) → installed Library tab only.
                    - "Skill Store" (Library icon) → Coming-Soon tab only.
                  Both call into the same `SkillsPage` with `hideTabs`
                  set; the host owns the surface boundary. */}
              {activeView === 'skills' && (
                <div className="flex-1 min-h-0 bg-card rounded-xl border overflow-hidden flex flex-col">
                  <SkillsPage
                    getToken={getAccessToken}
                    defaultTab="library"
                    hideTabs
                    pinnedSkillIds={pinnedSkillsState.pinned}
                    onTogglePin={pinnedSkillsState.toggle}
                  />
                </div>
              )}
              {activeView === 'skill-library' && (
                <div className="flex-1 min-h-0 bg-card rounded-xl border overflow-hidden flex flex-col">
                  <SkillsPage
                    getToken={getAccessToken}
                    defaultTab="store"
                    hideTabs
                  />
                </div>
              )}
              {/* Pinned v2 skills — `skill:<id>` activeView is the rail's
                  output for any pinned bundled skill. The launcher fires
                  the run, mounts the registered React module. */}
              {activeView.startsWith('skill:') && (
                <div className="flex-1 min-h-0 bg-card rounded-xl border overflow-hidden flex flex-col">
                  <BundledSkillLauncher skillId={activeView.slice('skill:'.length)} />
                </div>
              )}

              {/* Core feature panels */}
              {activeView === 'node-system' && (
                <div className="flex-1 min-h-0 bg-card rounded-xl border overflow-hidden flex flex-col">
                  <NodeSystemDashboard />
                </div>
              )}
              {activeView === 'video-gen' && (
                <div className="flex-1 min-h-0 bg-card rounded-xl border overflow-hidden flex flex-col">
                  <VideoGenDashboard projectFolder={activeProjectFolder} />
                </div>
              )}
              {/* ImageGenDashboard is always mounted (just hidden when
                  another tab is active) so prompt + generated images +
                  in-flight requests survive tab switches. */}
              <div
                className={`flex-1 min-h-0 bg-card rounded-xl border overflow-hidden flex flex-col ${
                  activeView === 'image-gen' ? '' : 'hidden'
                }`}
              >
                <ImageGenDashboard active={activeView === 'image-gen'} projectFolder={activeProjectFolder} />
              </div>

              {/* Post-Production dashboards — all three migrated to
                  bundled skills (Phase 12.10 = Subtitles, 12.11 =
                  Audio Sync + Autopod). The nav-rail entries now launch
                  `SkillRunner.run({ skillId })` and mount the React
                  module from `@pipefx/skills-builtin` via
                  `BundledSkillHost`. The legacy
                  `apps/desktop/src/features/{subtitles,audio-sync,autopod}/`
                  directories were deleted in their respective phases. */}
              {activeView === 'subtitles' && (
                <div className="flex-1 min-h-0 bg-card rounded-xl border overflow-hidden flex flex-col">
                  <BundledSkillLauncher skillId="subtitles" />
                </div>
              )}
              {activeView === 'audio-sync' && (
                <div className="flex-1 min-h-0 bg-card rounded-xl border overflow-hidden flex flex-col">
                  <BundledSkillLauncher skillId="audio-sync" />
                </div>
              )}
              {activeView === 'autopod' && (
                <div className="flex-1 min-h-0 bg-card rounded-xl border overflow-hidden flex flex-col">
                  <BundledSkillLauncher skillId="autopod" />
                </div>
              )}

              {/* Skill Planner */}
              {activeView === 'skill-planner' && (
                <div className="flex-1 min-h-0 bg-card rounded-xl border overflow-hidden flex flex-col">
                  <SkillPlannerPage
                    content={activePlanContent}
                    onClose={() => setActiveView('skills')}
                    onSkillSaved={() => {
                      loadSkills().then(setSkills);
                      setTimeout(() => setActiveView('skills'), 3500);
                    }}
                  />
                </div>
              )}

              {/* Phase 12 rewrites the skill UI surface. The v1
                  SkillRunner (form-based, manifest-driven) was deleted in
                  12.2; the new three-mode runner — `prompt` (LLM body),
                  `script` (subprocess), `component` (bundled React UI) —
                  lands in 12.5–12.7. Bundled-UI skills resolve via a
                  static React module registry populated by
                  `@pipefx/skills-builtin`. */}

              {/* Macro pages */}
              {isMacroView && (
                <div className="flex-1 min-h-0 bg-card rounded-xl border overflow-hidden flex flex-col">
                  <ScrollArea className="flex-1 min-h-0 p-6 relative">
                    <div className="max-w-4xl mx-auto pb-10">
                      <div className="flex items-center justify-between mb-6">
                        <h2 className="text-xl font-bold tracking-tight">
                          {MACRO_CATEGORIES.find((c) => c.id === activeView)?.name} Macros
                        </h2>
                        <Button size="sm" variant="outline" className="gap-2">
                          <Settings className="h-4 w-4" />
                          Edit Profile
                        </Button>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
                        {MACROS.filter((m) => m.category === activeView).map((macro) => {
                          const Icon = macro.icon;
                          return (
                            <Card
                              key={macro.id}
                              className="group relative cursor-pointer active:scale-[0.97] transition-all duration-200 border-border/60 hover:border-primary/50 hover:shadow-md bg-card/80 overflow-hidden hover-lift"
                            >
                              <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                              <CardContent className="p-5 flex flex-col items-center justify-center text-center h-32 gap-3 relative z-10">
                                <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                                  <Icon className="h-5 w-5" />
                                </div>
                                <div>
                                  <div className="font-semibold text-sm group-hover:text-primary transition-colors">
                                    {macro.name}
                                  </div>
                                  <div className="text-[10px] uppercase font-mono tracking-wider text-muted-foreground mt-1 bg-muted px-1.5 py-0.5 rounded inline-block">
                                    {macro.hotkey}
                                  </div>
                                </div>
                              </CardContent>
                            </Card>
                          );
                        })}
                        <Card className="cursor-pointer border-dashed border-2 hover:border-primary/50 hover:bg-primary/5 transition-colors bg-transparent">
                          <CardContent className="p-5 flex flex-col items-center justify-center text-center h-32 text-muted-foreground hover:text-primary">
                            <div className="h-10 w-10 rounded-full border-2 border-current border-dashed flex items-center justify-center mb-2">
                              <span className="text-xl leading-none">+</span>
                            </div>
                            <div className="font-medium text-sm">Add Macro</div>
                          </CardContent>
                        </Card>
                      </div>
                    </div>
                  </ScrollArea>
                </div>
              )}
            </div>

            {/* ── Right Panel: Project Brain OR Sidebar Chat ── */}
            {isRightPanelOpen && (
              <div
                style={{ width: rightPanelWidth }}
                className="relative flex flex-col gap-3 shrink-0 animate-panel-enter"
              >
                {/* Drag handle — invisible hit-zone on the card's left edge.
                    No visual indicator, just a col-resize cursor. */}
                <div
                  role="separator"
                  aria-orientation="vertical"
                  aria-label="Resize right panel"
                  onMouseDown={handleResizeStart}
                  onDoubleClick={handleResizeDoubleClick}
                  className="absolute top-0 bottom-0 -left-1 w-2 cursor-col-resize select-none z-10"
                  title="Drag to resize · Double-click to reset"
                />
                {/* Mode toggle — segmented control */}
                <div className="flex items-center gap-1 bg-muted/40 rounded-lg p-1 border shrink-0">
                  <button
                    type="button"
                    onClick={() => setRightPanelMode('project')}
                    className={cn(
                      'flex-1 flex items-center justify-center gap-1.5 h-7 rounded-md text-xs font-medium transition-colors',
                      rightPanelMode === 'project'
                        ? 'bg-card text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                    title="Project Brain"
                  >
                    <Brain className="w-3.5 h-3.5" />
                    Project
                  </button>
                  <button
                    type="button"
                    onClick={() => setRightPanelMode('chat')}
                    className={cn(
                      'flex-1 flex items-center justify-center gap-1.5 h-7 rounded-md text-xs font-medium transition-colors',
                      rightPanelMode === 'chat'
                        ? 'bg-card text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                    title="Sidebar Chat"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    Chat
                  </button>
                </div>

                {rightPanelMode === 'chat' ? (
                  /* ── Sidebar Chat ── shares state with main chat */
                  <div className="flex-1 min-h-0 bg-card rounded-xl border overflow-hidden flex flex-col">
                    <ChatPanel {...chatPanelProps} />
                  </div>
                ) : (
                  <>
                    {/* Media Pool only — Brain sub-tab removed per user request */}
                    {activeProjectId ? (
                      <div className="flex-1 min-h-0 bg-card rounded-xl border overflow-hidden flex flex-col">
                        <MediaPool
                          projectId={activeProjectId}
                          folderPath={activeProjectFolder}
                          onFolderLinked={() => {
                            void fetchProjects().then(setProjects);
                          }}
                        />
                      </div>
                    ) : (
                      <div className="flex-1 min-h-0 bg-card rounded-xl border overflow-hidden flex items-center justify-center p-6">
                        <div className="text-center animate-panel-enter">
                          <div className="w-10 h-10 rounded-xl bg-muted/50 flex items-center justify-center mx-auto mb-3">
                            <Brain className="h-5 w-5 text-muted-foreground" />
                          </div>
                          <div className="text-sm font-medium text-foreground mb-1">No Project Selected</div>
                          <div className="text-xs text-muted-foreground mb-3">Select a project from the toolbar to see its knowledge base</div>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-xs"
                            onClick={handleCreateProject}
                          >
                            + Create Project
                          </Button>
                        </div>
                      </div>
                    )}

                    {/* Connector Status */}
                    <ConnectorStatus
                      activeApp={activeApp}
                      isConnected={isConnected}
                      onChangeApp={setActiveApp}
                    />
                  </>
                )}
              </div>
            )}
          </div>
        </main>

        {/* ── Contextual Status Bar ── terminal-style status line */}
        {activeTasks.filter((t) => !t.id.startsWith('chat-')).length > 0 ? (
          <footer className="h-7 bg-card border-t flex items-center px-4 text-[11px] text-muted-foreground justify-between shrink-0 font-mono">
            <div className="flex items-center gap-2">
              <TerminalSpinner className="text-[12px] text-primary" />
              <span>
                {activeTasks.filter((t) => !t.id.startsWith('chat-')).length} task{activeTasks.filter((t) => !t.id.startsWith('chat-')).length !== 1 ? 's' : ''} running
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span>profile: default</span>
            </div>
          </footer>
        ) : null}
      </div>
    </TooltipProvider>
  );
}
