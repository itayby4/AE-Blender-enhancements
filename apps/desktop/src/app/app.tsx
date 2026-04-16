import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  PanelRightClose,
  Loader2,
  Scissors,
  PaintBucket,
  Volume2,
  Wand2,
  Play,
  Type,
  AlignLeft,
  Settings,
  Brain,
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
import { fetchProjects, createProject, switchApp, getActiveAppState } from '../lib/api.js';

// Layout
import { NavRail } from '../components/layout/NavRail.js';
import { ConnectorStatus } from '../components/layout/ConnectorStatus.js';
import { TitleBar } from '../components/layout/TitleBar.js';

// Features
import { ChatPanel } from '../features/chat/ChatPanel.js';
import { CommandPalette } from '../features/command-palette/CommandPalette.js';
import { ProjectBrain } from '../features/project-brain/ProjectBrain.js';
import { VideoGenDashboard } from '../features/video-gen/VideoGenDashboard.js';
import { ImageGenDashboard } from '../features/image-gen/ImageGenDashboard.js';
import { NodeSystemDashboard } from '../features/node-system/NodeSystemDashboard.js';
import { SkillsPage } from '../features/skills/SkillsPage.js';
import { SkillPlannerPage } from '../features/skills/SkillPlannerPage.js';
import { SkillIframeRenderer } from '../features/skills/SkillIframeRenderer.js';
import { SKILL_UI_REGISTRY } from '../features/skills/skill-registry.js';
import { TaskManagerWidget } from '../features/skills/TaskManagerWidget.js';
import { SettingsPage } from '../features/settings/SettingsPage.js';
import { applyPalette } from '../lib/palette-runtime.js';
import { Toaster } from '../components/ui/sonner.js';
import { TooltipProvider } from '../components/ui/tooltip.js';

// Hooks
import { useTaskStream } from '../hooks/useTaskStream.js';
import { useChat } from '../hooks/useChat.js';
import { useChatHistory } from '../hooks/useChatHistory.js';

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
  // ── Core UI State ──
  const [activeView, setActiveView] = useState('chat');
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(true);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);

  // ── Palette State ── persisted in localStorage
  const [activePalette, setActivePalette] = useState<string>(() => {
    return localStorage.getItem('pipefx-palette') || 'cool-teal';
  });

  // Apply palette to <html> and persist
  useEffect(() => {
    applyPalette(activePalette, []);
    localStorage.setItem('pipefx-palette', activePalette);
  }, [activePalette]);
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
    skills,
    selectedSkillId,
    selectedLlmModel,
    activeApp,
    activeProjectId,
    onNavigate: setActiveView,
    onPlanDetected: (content) => {
      setActivePlanContent(content);
      setActiveView('skill-planner');
    },
    sessionId: chatHistory.activeSessionId,
    onSaveSession: chatHistory.saveSession,
  });

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
      } catch { }
    }, 5000);
    return () => clearInterval(interval);
  }, [projects, activeProjectId, syncPrompt]);

  // Global keyboard shortcuts
  useEffect(() => {
    const handler = (e: globalThis.KeyboardEvent) => {
      // Ctrl+K — Command Palette
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // ── Handlers ──

  const handleCreateProject = useCallback(async () => {
    const name = window.prompt('Enter new PipeFX Project Name:');
    if (!name) return;
    try {
      const p = await createProject({ name, externalAppName: activeApp });
      setProjects((prev) => [...prev, p]);
      setActiveProjectId(p.id);
    } catch (e) {
      console.error(e);
    }
  }, [activeApp]);

  // Does the activeView match a macro category?
  const isMacroView = MACRO_CATEGORIES.some((c) => c.id === activeView);

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

        {/* ── Command Palette ── */}
        <CommandPalette
          isOpen={isCommandPaletteOpen}
          onClose={() => setIsCommandPaletteOpen(false)}
          onNavigate={(view) => setActiveView(view)}
          onClearChat={chat.clearChat}
          onOpenPreferences={() => setActiveView('settings')}
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
            onValueChange={(val) => setActiveProjectId(val === 'none' ? '' : val)}
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
              <div className="p-2 border-t mt-1">
                <Button size="sm" variant="ghost" className="w-full text-xs justify-start" onClick={handleCreateProject}>
                  + New Project Group
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
              className="h-7 gap-1.5 text-xs border-primary/50 text-primary bg-primary/10 hover:bg-primary/20 shrink-0"
            >
              <Loader2 className="w-3 h-3 animate-spin" />
              {activeTasks.filter((t) => !t.id.startsWith('chat-')).length}
            </Button>
          )}

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
            title="Toggle Sidebar"
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
          />

          {/* Center content area */}
          <div className="flex-1 min-w-0 min-h-0 flex gap-3 p-2.5 overflow-hidden">
            {/* ── Primary Panel ── */}
            <div className="flex-1 min-h-0 flex flex-col">
              {/* Chat View — Hero Panel */}
              {activeView === 'chat' && (
                <ChatPanel
                  messages={chat.chatMessages}
                  isTyping={chat.isAiTyping}
                  currentTaskId={chat.currentChatTaskId}
                  taskMap={taskMap}
                  activeTasks={activeTasks}
                  selectedLlmModel={selectedLlmModel}
                  selectedSkillId={selectedSkillId}
                  skills={filteredSkills}
                  activeApp={activeApp}
                  chatInput={chatInput}
                  onChatInputChange={setChatInput}
                  onSendMessage={(text, skill) => {
                    // Start a new session on first message if none active
                    if (!chatHistory.activeSessionId) {
                      chatHistory.newSession();
                    }
                    chat.sendMessageToAi(text, skill);
                  }}
                  onStopGeneration={chat.stopGeneration}
                  onClearChat={chat.clearChat}
                  onSelectSkill={setSelectedSkillId}
                  onSelectModel={setSelectedLlmModel}
                  onNavigate={setActiveView}
                  onSkillsReloaded={setSkills}
                  onPlanNavigate={(content) => {
                    setActivePlanContent(content);
                    setActiveView('skill-planner');
                  }}
                  chatSessions={chatHistory.sessions}
                  activeSessionId={chatHistory.activeSessionId}
                  onLoadSession={(id) => {
                    const msgs = chatHistory.loadSession(id);
                    chat.setChatMessages(msgs);
                  }}
                  onDeleteSession={chatHistory.deleteSession}
                  onNewSession={() => {
                    chatHistory.newSession();
                    chat.clearChat();
                  }}
                />
              )}

              {/* Settings Page */}
              {activeView === 'settings' && (
                <div className="flex-1 min-h-0">
                  <SettingsPage
                    onClose={() => setActiveView('chat')}
                    activePalette={activePalette}
                    onPaletteChange={setActivePalette}
                  />
                </div>
              )}

              {/* Skills Page */}
              {activeView === 'skills' && (
                <div className="flex-1 min-h-0 flex flex-col bg-card rounded-xl border overflow-hidden">
                  <SkillsPage
                    skills={filteredSkills}
                    selectedSkillId={selectedSkillId}
                    activeApp={activeApp}
                    onSelectSkill={(skill) => {
                      setSelectedSkillId(skill.id);
                      setActiveView('chat');
                    }}
                    onNavigateToSkill={(skill) => setActiveView(skill.id)}
                    onImportSkill={(skill) => setSkills((prev) => [...prev, skill])}
                    onDeleteSkill={async (skill) => {
                      const filename = skill.filename || `${skill.id}.md`;
                      try {
                        const { deleteSkill } = await import('../lib/api.js');
                        await deleteSkill(filename);
                        const newSkills = await loadSkills();
                        setSkills(newSkills);
                        if (selectedSkillId === skill.id) setSelectedSkillId('default');
                      } catch (e) {
                        console.error('Error deleting skill:', e);
                      }
                    }}
                  />
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
                  <VideoGenDashboard />
                </div>
              )}
              {activeView === 'image-gen' && (
                <div className="flex-1 min-h-0 bg-card rounded-xl border overflow-hidden flex flex-col">
                  <ImageGenDashboard />
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

              {/* Dynamic skill UI panels */}
              {Object.entries(SKILL_UI_REGISTRY).map(([skillId, SkillComponent]) =>
                activeView === skillId ? (
                  <div key={skillId} className="flex-1 min-h-0 bg-card rounded-xl border overflow-hidden flex flex-col">
                    <SkillComponent />
                  </div>
                ) : null
              )}

              {/* Iframe skills */}
              {filteredSkills
                .filter((s) => s.uiHtml && !SKILL_UI_REGISTRY[s.id])
                .map((skill) =>
                  activeView === skill.id ? (
                    <div key={`iframe-${skill.id}`} className="flex-1 min-h-0 bg-card rounded-xl border overflow-hidden flex flex-col">
                      <SkillIframeRenderer
                        html={skill.uiHtml!}
                        skillId={skill.id}
                        onExecute={(params) => {
                          const paramStr = JSON.stringify(params, null, 2);
                          chat.sendMessageToAi(
                            `Execute the UI action with parameters:\n\`\`\`json\n${paramStr}\n\`\`\``,
                            skill
                          );
                          setActiveView('chat');
                        }}
                      />
                    </div>
                  ) : null
                )}

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

            {/* ── Right Panel: Project Brain + Connector Status ── */}
            {isRightPanelOpen && (
              <div className="w-[clamp(240px,22vw,320px)] flex flex-col gap-3 shrink-0 animate-panel-enter">
                {/* Project Brain */}
                {activeProjectId ? (
                  <div className="flex-1 min-h-0 bg-card rounded-xl border overflow-hidden">
                    <ProjectBrain
                      projectId={activeProjectId}
                      onAnalyzeRequest={() => {
                        setChatInput('Analyze the current project in depth');
                        setActiveView('chat');
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
              </div>
            )}
          </div>
        </main>

        {/* ── Contextual Status Bar ── only visible when there's active info */}
        {activeTasks.filter((t) => !t.id.startsWith('chat-')).length > 0 ? (
          <footer className="h-7 bg-card border-t flex items-center px-4 text-[11px] text-muted-foreground justify-between shrink-0 animate-panel-enter">
            <div className="flex items-center gap-2">
              <Loader2 className="h-3 w-3 animate-spin text-primary" />
              <span>
                {activeTasks.filter((t) => !t.id.startsWith('chat-')).length} task{activeTasks.filter((t) => !t.id.startsWith('chat-')).length !== 1 ? 's' : ''} running
              </span>
            </div>
            <div className="flex items-center gap-3 font-mono">
              <span>Profile: Default</span>
            </div>
          </footer>
        ) : null}
      </div>
    </TooltipProvider>
  );
}
