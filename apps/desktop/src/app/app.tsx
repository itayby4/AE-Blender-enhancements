import {
  useState,
  useEffect,
  useRef,
  useMemo,
  type ChangeEvent,
  type KeyboardEvent,
} from 'react';
import {
  MonitorPlay,
  Scissors,
  PaintBucket,
  Wand2,
  Play,
  Undo2,
  Redo2,
  Save,
  Settings,
  FolderOpen,
  MousePointer2,
  Type,
  AlignLeft,
  Volume2,
  Send,
  User,
  Bot,
  Sparkles,
  Terminal,
  Trash2,
  Video,
  ImageIcon,
  Network,
  Zap,
  Subtitles,
  Smartphone,
  PanelLeftClose,
  PanelRightClose,
  Loader2,
  Square,
  CheckCircle2,
  XCircle,
  Circle,
  Brain,
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { ScrollArea } from '../components/ui/scroll-area';
import { Textarea } from '../components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import { loadSkills, filterSkillsByApp, type Skill } from '../lib/load-skills';
import { VideoGenDashboard } from '../features/video-gen/VideoGenDashboard';
import { ImageGenDashboard } from '../features/image-gen/ImageGenDashboard';
import { NodeSystemDashboard } from '../features/node-system/NodeSystemDashboard';
import { SKILL_UI_REGISTRY } from '../features/skills/skill-registry';
import { SkillsPage } from '../features/skills/SkillsPage';
import { SkillAutocomplete } from '../features/skills/SkillAutocomplete';
import { SkillIframeRenderer } from '../features/skills/SkillIframeRenderer';
import { ChatCard, parseMessageContent } from '../features/skills/ChatCard';
import { TaskManagerWidget } from '../features/skills/TaskManagerWidget';
import type { TaskDTO, TaskEvent } from '@pipefx/tasks';
import { tasksReducer, taskMapToSortedArray } from '@pipefx/tasks';
import { SkillBuilderCard } from '../features/skills/SkillBuilderCard';
import { SkillPlannerPage } from '../features/skills/SkillPlannerPage';
import { dispatchPipelineActions } from '../lib/pipeline-actions';
import { cn } from '../lib/utils';
import { ProjectBrain } from '../features/project-brain/ProjectBrain';
import type { ComponentType } from 'react';

/** Map icon names from skill frontmatter to lucide components for sidebar */
const SIDEBAR_ICON_MAP: Record<
  string,
  ComponentType<{ className?: string }>
> = {
  bot: Bot,
  subtitles: Subtitles,
  scissors: Scissors,
  smartphone: Smartphone,
  network: Network,
  wand2: Wand2,
  zap: Zap,
};

interface ChatMessage {
  id: number;
  sender: string;
  text: string;
  taskId?: string;
  thoughts?: string[];
}

interface LogEntry {
  id: number;
  time: string;
  level: string;
  message: string;
}

// Mock data for DaVinci Resolve macros
const MACRO_CATEGORIES = [
  { id: 'edit', name: 'Editing', icon: Scissors },
  { id: 'color', name: 'Color Grading', icon: PaintBucket },
  { id: 'audio', name: 'Fairlight', icon: Volume2 },
  { id: 'fx', name: 'Fusion', icon: Wand2 },
];

const MACROS = [
  {
    id: 'cut',
    category: 'edit',
    name: 'Ripple Cut',
    icon: Scissors,
    hotkey: 'Ctrl+Shift+X',
  },
  {
    id: 'add_text',
    category: 'edit',
    name: 'Add Text+',
    icon: Type,
    hotkey: 'T',
  },
  {
    id: 'align',
    category: 'edit',
    name: 'Align Clips',
    icon: AlignLeft,
    hotkey: 'Alt+A',
  },
  {
    id: 'grade_1',
    category: 'color',
    name: 'Apply Rec.709 LUT',
    icon: PaintBucket,
    hotkey: 'Num 1',
  },
  {
    id: 'grade_2',
    category: 'color',
    name: 'Teal & Orange',
    icon: PaintBucket,
    hotkey: 'Num 2',
  },
  {
    id: 'node_add',
    category: 'color',
    name: 'Add Serial Node',
    icon: Wand2,
    hotkey: 'Alt+S',
  },
  {
    id: 'audio_sync',
    category: 'audio',
    name: 'Auto-Sync Audio',
    icon: Volume2,
    hotkey: 'Ctrl+Alt+S',
  },
  {
    id: 'render',
    category: 'fx',
    name: 'Render Cache',
    icon: Play,
    hotkey: 'Ctrl+R',
  },
];

const INITIAL_CHAT: ChatMessage[] = [
  {
    id: 1,
    sender: 'ai',
    text: 'Hello! I am connected to DaVinci Resolve. How can I help you edit today?',
  },
];

const INITIAL_LOGS: LogEntry[] = [
  { id: 1, time: '10:00:00', level: 'info', message: 'Application started' },
  {
    id: 2,
    time: '10:00:02',
    level: 'info',
    message: 'Initializing UI components...',
  },
  {
    id: 3,
    time: '10:00:05',
    level: 'success',
    message: 'Connected to DaVinci Resolve Studio 18.6',
  },
  {
    id: 4,
    time: '10:00:06',
    level: 'info',
    message: 'Loaded 4 macro categories',
  },
];

const DEFAULT_SKILLS: Skill[] = [
  {
    id: 'default',
    name: 'Default Assistant',
    description: 'General-purpose AI assistant',
    icon: 'bot',
    category: 'general',
  },
];

export function App() {
  const [isLeftSidebarOpen, setIsLeftSidebarOpen] = useState(true);
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(true);
  const [activeCategory, setActiveCategory] = useState('skills');
  const [activeRightTab, setActiveRightTab] = useState<'chat' | 'logs'>('chat');
  const [isConnected] = useState(true);
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState(INITIAL_CHAT);
  const [logs, setLogs] = useState<LogEntry[]>(INITIAL_LOGS);
  const [selectedSkillId, setSelectedSkillId] = useState('default');
  const [skills, setSkills] = useState<Skill[]>(DEFAULT_SKILLS);
  const [selectedLlmModel, setSelectedLlmModel] = useState(
    'gemini-3.1-pro-preview'
  );
  const [activeApp, setActiveApp] = useState('resolve');

  const [projects, setProjects] = useState<any[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string>('');
  const [syncPrompt, setSyncPrompt] = useState<{
    resolveName: string;
    pipefxId: string;
    pipefxName: string;
  } | null>(null);

  const [isTaskWidgetMinimized, setIsTaskWidgetMinimized] = useState(false);
  const [taskMap, setTaskMap] = useState<Map<string, TaskDTO>>(new Map());
  const [currentChatTaskId, setCurrentChatTaskId] = useState<string | null>(null);

  // Derive sorted array from Map for rendering
  const activeTasks = taskMapToSortedArray(taskMap);

  useEffect(() => {
    const url = activeProjectId 
      ? `http://localhost:3001/api/tasks/stream?projectId=${activeProjectId}`
      : 'http://localhost:3001/api/tasks/stream';

    const eventSource = new EventSource(url);
    eventSource.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === 'init') {
          // Hydrate from server snapshot
          const map = new Map<string, TaskDTO>();
          for (const task of data.tasks as TaskDTO[]) {
            map.set(task.id, task);
          }
          setTaskMap(map);
        } else if (data.type === 'event') {
          // Apply event through shared reducer
          const event = data.event as TaskEvent;
          setTaskMap((prev) => {
            const next = tasksReducer(prev, event);
            // Auto-show widget for new non-chat tasks
            if (event.type === 'task_created' && !event.taskId.startsWith('chat-')) {
              setIsTaskWidgetMinimized(false);
            }
            return next;
          });
        }
      } catch (err) {}
    };
    return () => eventSource.close();
  }, [activeProjectId]);

  useEffect(() => {
    fetch('http://localhost:3001/api/projects')
      .then((res) => res.json())
      .then((data) => setProjects(data))
      .catch((e) => console.error(e));
  }, []);

  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch('http://localhost:3001/api/active-app-state');
        if (res.ok) {
          const data = await res.json();
          const resolveProjName = data.activeProjectName;
          if (resolveProjName) {
            const matchingProj = projects.find(
              (p) => p.externalProjectName === resolveProjName
            );
            if (
              matchingProj &&
              activeProjectId !== matchingProj.id &&
              syncPrompt?.pipefxId !== matchingProj.id
            ) {
              setSyncPrompt({
                resolveName: resolveProjName,
                pipefxId: matchingProj.id,
                pipefxName: matchingProj.name,
              });
            }
          }
        }
      } catch (e) {}
    }, 5000);
    return () => clearInterval(interval);
  }, [projects, activeProjectId, syncPrompt]);

  const handleCreateProject = async () => {
    const name = window.prompt('Enter new PipeFX Project Name:');
    if (!name) return;
    const res = await fetch('http://localhost:3001/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        externalAppName: activeApp,
        externalProjectName: undefined,
      }),
    });
    if (res.ok) {
      const p = await res.json();
      setProjects((prev) => [...prev, p]);
      setActiveProjectId(p.id);
    }
  };

  const [isAiTyping, setIsAiTyping] = useState(false);

  // Autocomplete state for \ trigger
  const [isAutocompleteOpen, setIsAutocompleteOpen] = useState(false);
  const [autocompleteQuery, setAutocompleteQuery] = useState('');

  // Skill Planner active content
  const [activePlanContent, setActivePlanContent] = useState<string | null>(
    null
  );

  // Filter skills by active app
  const filteredSkills = useMemo(
    () => filterSkillsByApp(skills, activeApp),
    [skills, activeApp]
  );

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, isAiTyping]);

  useEffect(() => {
    if (chatMessages.length === 0 || isAiTyping) return;
    const lastMsg = chatMessages[chatMessages.length - 1];
    if (lastMsg.sender === 'ai') {
      const parts = parseMessageContent(lastMsg.text);
      const planPart = parts.find(
        (p) => typeof p === 'object' && p.type === 'plan'
      );
      if (planPart) {
        setActivePlanContent((planPart as any).content);
        setActiveCategory('skill-planner');
      }
    }
  }, [chatMessages, isAiTyping]);

  useEffect(() => {
    loadSkills().then(setSkills);
  }, []);

  useEffect(() => {
    fetch('http://localhost:3001/api/switch-app', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activeApp }),
    }).catch((err) => console.error('Failed to switch app:', err));
  }, [activeApp]);

  const abortControllerRef = useRef<AbortController | null>(null);

  const sendMessageToAi = async (text: string, overrideSkill?: Skill) => {
    if (!text.trim() || isAiTyping) return;

    abortControllerRef.current = new AbortController();

    const newChatMsg: ChatMessage = {
      id: Date.now(),
      sender: 'user',
      text,
    };
    setChatMessages((prev) => [...prev, newChatMsg]);
    setIsAiTyping(true);

    const activeSkillContext =
      overrideSkill ||
      (skills.find((s) => s.id === selectedSkillId) &&
      selectedSkillId !== 'default'
        ? skills.find((s) => s.id === selectedSkillId)
        : undefined);

    const historyPayload = chatMessages
      .filter((m) => m.id > 3)
      .map((m) => ({
        role: m.sender === 'user' ? 'user' : 'model',
        parts: [{ text: m.text }],
      }));

    const currentTaskId = `chat-${Date.now()}`;
    setCurrentChatTaskId(currentTaskId);

    try {
      const response = await fetch('http://localhost:3001/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          skill: activeSkillContext,
          history: historyPayload,
          llmModel: selectedLlmModel,
          activeApp,
          projectId: activeProjectId || undefined,
          taskId: currentTaskId,
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        if (response.status === 499) {
          setIsAiTyping(false);
          setChatMessages((prev) => [
            ...prev,
            { id: Date.now(), sender: 'ai', text: 'Agent stopped by user.' },
          ]);
          return;
        }
        const errData = await response.json().catch(() => null);
        throw new Error(errData?.error || 'Failed to connect to AI Engine');
      }

      const data = await response.json();

      const responseText = data.text?.trim()
        ? data.text
        : data.actions?.length
        ? `Generated ${data.actions.length} pipeline actions in the Node Editor.`
        : 'Done.';

      setChatMessages((prev) => [
        ...prev,
        { id: Date.now(), sender: 'ai', text: responseText, taskId: currentTaskId },
      ]);

      // If the AI returned pipeline actions, dispatch them to the node editor
      if (
        data.actions &&
        Array.isArray(data.actions) &&
        data.actions.length > 0
      ) {
        // Switch to node editor tab
        setActiveCategory('node-system');
        // Dispatch immediately - our new queue system guarantees it won't be lost even if the tab is still loading
        dispatchPipelineActions(data.actions);
      }

      // Also add a log entry for completion
      const newLog: LogEntry = {
        id: Date.now(),
        time: new Date().toLocaleTimeString('en-US', { hour12: false }),
        level: 'success',
        message: data.actions?.length
          ? `AI executed ${data.actions.length} pipeline action(s)`
          : 'Successfully generated AI macro response',
      };
      setLogs((prev) => [...prev, newLog]);
      setIsAiTyping(false);
    } catch (error: any) {
      if (error.name === 'AbortError') {
        setIsAiTyping(false);
        setChatMessages((prev) => [
          ...prev,
          { id: Date.now(), sender: 'ai', text: 'Agent stopped by user.' },
        ]);
        return;
      }
      console.error('Failed to chat:', error);
      setIsAiTyping(false);
      setChatMessages((prev) => [
        ...prev,
        {
          id: Date.now(),
          sender: 'ai',
          text: 'Error connecting to the backend. Is it running?',
        },
      ]);
      setLogs((prev) => [
        ...prev,
        {
          id: Date.now(),
          time: new Date().toLocaleTimeString('en-US', { hour12: false }),
          level: 'error',
          message: String(error),
        },
      ]);
    }
  };

  const handleSendMessage = async () => {
    if (!chatInput.trim() || isAiTyping) return;

    // Strip the /skillname prefix if present
    let userText = chatInput;
    const skillPrefixMatch = userText.match(/^\/([^\s]+)\s*/);
    if (skillPrefixMatch) {
      userText = userText.substring(skillPrefixMatch[0].length).trim();
      if (!userText) return;
    }

    setChatInput('');
    await sendMessageToAi(userText);
  };

  return (
    <div className="flex flex-col h-screen bg-background text-foreground font-sans overflow-hidden select-none relative">
      <TaskManagerWidget
        tasks={activeTasks}
        isMinimized={isTaskWidgetMinimized}
        onMinimize={() => setIsTaskWidgetMinimized(true)}
      />
      {/* Top Menu Bar (Native OS Feel) */}
      <div className="flex items-center h-8 bg-muted/80 border-b px-2 text-[13px] text-muted-foreground w-full">
        <div className="flex space-x-1">
          <button className="px-3 hover:bg-muted hover:text-foreground rounded-sm transition-colors py-0.5">
            File
          </button>
          <button className="px-3 hover:bg-muted hover:text-foreground rounded-sm transition-colors py-0.5">
            Edit
          </button>
          <button className="px-3 hover:bg-muted hover:text-foreground rounded-sm transition-colors py-0.5">
            View
          </button>
          <button className="px-3 hover:bg-muted hover:text-foreground rounded-sm transition-colors py-0.5 font-medium text-foreground">
            Preferences
          </button>
          <button className="px-3 hover:bg-muted hover:text-foreground rounded-sm transition-colors py-0.5">
            Help
          </button>
        </div>
      </div>

      {/* Toolbar */}
      <header className="flex h-14 items-center justify-between border-b px-4 bg-card shrink-0">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground shadow-sm">
              <MonitorPlay className="h-4 w-4" />
            </div>
            <div>
              <h1 className="text-sm font-bold tracking-tight leading-none">
                PipeFX
              </h1>
              <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
                Command Center
              </span>
            </div>

            <Select value={activeProjectId} onValueChange={setActiveProjectId}>
              <SelectTrigger className="w-[160px] h-8 bg-muted/40 border-transparent hover:bg-muted text-xs font-semibold ml-4">
                <SelectValue placeholder="No Project Selected" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>My Linked Projects</SelectLabel>
                  <SelectItem
                    value="none"
                    onClick={() => setActiveProjectId('')}
                  >
                    (No Project)
                  </SelectItem>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
                <div className="p-2 border-t mt-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="w-full text-xs justify-start"
                    onClick={handleCreateProject}
                  >
                    + New Project Group
                  </Button>
                </div>
              </SelectContent>
            </Select>
          </div>

          <div className="h-6 w-px bg-border mx-2"></div>

          {/* Quick Actions */}
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className={
                isLeftSidebarOpen
                  ? 'h-8 w-8 text-primary bg-primary/10'
                  : 'h-8 w-8 text-muted-foreground hover:text-foreground'
              }
              onClick={() => setIsLeftSidebarOpen(!isLeftSidebarOpen)}
              title="Toggle Left Sidebar"
            >
              <PanelLeftClose className="h-4 w-4" />
            </Button>
            <div className="h-4 w-px bg-border mx-1"></div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground"
            >
              <FolderOpen className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground"
            >
              <Save className="h-4 w-4" />
            </Button>
            <div className="h-4 w-px bg-border mx-1"></div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground"
            >
              <Undo2 className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground"
            >
              <Redo2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Status Indicator */}
        <div className="flex items-center gap-3">
          {activeTasks.filter(t => !t.id.startsWith('chat-')).length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsTaskWidgetMinimized(false)}
              className="h-9 gap-2 border-primary/50 text-primary bg-primary/10 hover:bg-primary/20 transition-colors"
            >
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              {activeTasks.filter(t => !t.id.startsWith('chat-')).length} Task{activeTasks.filter(t => !t.id.startsWith('chat-')).length !== 1 ? 's' : ''}
            </Button>
          )}
          <Select
            value={activeApp}
            onValueChange={(val) => {
              if (val) setActiveApp(val);
            }}
          >
            <SelectTrigger className="w-[180px] h-9 bg-muted/50 border border-border/50 rounded-full font-semibold px-4 text-xs">
              <SelectValue placeholder="Select Application" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectLabel>Connected Apps</SelectLabel>
                <SelectItem value="resolve">DaVinci Resolve</SelectItem>
                <SelectItem value="premiere">Adobe Premiere Pro</SelectItem>
                <SelectItem value="aftereffects">
                  Adobe After Effects
                </SelectItem>
                <SelectItem value="blender">Blender</SelectItem>
                <SelectItem value="ableton">Ableton Live</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
          <div
            className="flex h-6 w-6 items-center justify-center rounded-full bg-background border shadow-sm"
            title="MCP Connection Status"
          >
            <div
              className={`h-2 w-2 rounded-full ${
                isConnected
                  ? 'bg-foreground shadow-[0_0_8px_rgba(255,255,255,0.4)]'
                  : 'bg-muted-foreground'
              }`}
            ></div>
          </div>
          <div className="h-4 w-px bg-border mx-1"></div>
          <Button
            variant="ghost"
            size="icon"
            className={
              isRightSidebarOpen
                ? 'h-8 w-8 text-primary bg-primary/10'
                : 'h-8 w-8 text-muted-foreground hover:text-foreground'
            }
            onClick={() => setIsRightSidebarOpen(!isRightSidebarOpen)}
            title="Toggle Right Sidebar"
          >
            <PanelRightClose className="h-4 w-4" />
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex flex-1 min-h-0 bg-muted/10 relative">
        {/* Left Sidebar - Categories */}
        <aside
          className={`w-56 border-r bg-card/50 flex flex-col items-stretch space-y-1 p-3 shrink-0 min-h-0 overflow-y-auto ${
            isLeftSidebarOpen ? '' : 'hidden'
          }`}
        >
          {/* Section: Core Features (hardcoded) */}
          <div className="px-2 pb-2 mb-2 border-b shrink-0">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Core Features
            </h2>
          </div>

          <button
            onClick={() => setActiveCategory('video-gen')}
            className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-all text-left ${
              activeCategory === 'video-gen'
                ? 'bg-primary text-primary-foreground font-medium shadow-sm'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            <Video className="h-4 w-4" />
            Video Studio
          </button>

          {/* Sync Prompt Toast */}
          {syncPrompt && (
            <div className="absolute top-16 left-1/2 -translate-x-1/2 z-50 bg-primary/95 text-primary-foreground px-4 py-3 rounded-lg shadow-xl border border-primary-foreground/20 flex items-center gap-4 animate-in fade-in slide-in-from-top-4">
              <div>
                <p className="text-sm font-semibold">
                  DaVinci Project Detected
                </p>
                <p className="text-xs opacity-90 mt-0.5">
                  Switch to '{syncPrompt.pipefxName}'?
                </p>
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

          <button
            onClick={() => setActiveCategory('image-gen')}
            className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-all text-left mt-1 ${
              activeCategory === 'image-gen'
                ? 'bg-primary text-primary-foreground font-medium shadow-sm'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            <ImageIcon className="h-4 w-4" />
            Image Studio
          </button>

          <button
            onClick={() => setActiveCategory('node-system')}
            className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-all text-left mt-1 ${
              activeCategory === 'node-system'
                ? 'bg-primary text-primary-foreground font-medium shadow-sm'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            <Network className="h-4 w-4" />
            Node Editor
          </button>

          {/* Section: Skills (dynamic) */}
          <div className="px-2 pb-2 mt-4 mb-2 border-b shrink-0">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Skills
            </h2>
          </div>

          <button
            onClick={() => setActiveCategory('skills')}
            className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-all text-left ${
              activeCategory === 'skills'
                ? 'bg-primary text-primary-foreground font-medium shadow-sm'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            <Zap className="h-4 w-4" />
            All Skills
          </button>

          {/* Dynamic buttons for skills with UI */}
          {filteredSkills
            .filter((s) => s.hasUI && s.id !== 'default')
            .map((skill) => {
              const Icon = SIDEBAR_ICON_MAP[skill.icon || 'bot'] || Bot;
              const isActive = activeCategory === skill.id;
              return (
                <button
                  key={skill.id}
                  onClick={() => setActiveCategory(skill.id)}
                  className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-all text-left mt-1 ${
                    isActive
                      ? 'bg-primary text-primary-foreground font-medium shadow-sm'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {skill.name}
                </button>
              );
            })}

          {/* Section: Macro Pages (hardcoded) */}
          <div className="px-2 pb-2 mt-4 mb-2 border-b shrink-0">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Macro Pages
            </h2>
          </div>

          {MACRO_CATEGORIES.map((category) => {
            const Icon = category.icon;
            const isActive = activeCategory === category.id;
            return (
              <button
                key={category.id}
                onClick={() => setActiveCategory(category.id)}
                className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-all text-left ${
                  isActive
                    ? 'bg-primary text-primary-foreground font-medium shadow-sm'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                <Icon className="h-4 w-4" />
                {category.name}
              </button>
            );
          })}
        </aside>

        {/* Center - Content Area */}
        {/* Hardcoded core feature panels */}
        <div
          className={`flex-1 min-h-0 flex-col relative w-full h-full ${
            activeCategory === 'node-system' ? 'flex' : 'hidden'
          }`}
        >
          <NodeSystemDashboard />
        </div>
        <div
          className={`flex-1 min-h-0 flex-col relative w-full h-full ${
            activeCategory === 'video-gen' ? 'flex' : 'hidden'
          }`}
        >
          <VideoGenDashboard />
        </div>
        <div
          className={`flex-1 min-h-0 flex-col relative w-full h-full ${
            activeCategory === 'image-gen' ? 'flex' : 'hidden'
          }`}
        >
          <ImageGenDashboard />
        </div>

        {/* Dynamic skill UI panels (from SKILL_UI_REGISTRY) */}
        {Object.entries(SKILL_UI_REGISTRY).map(([skillId, SkillComponent]) => (
          <div
            key={skillId}
            className={`flex-1 min-h-0 flex-col relative w-full h-full ${
              activeCategory === skillId ? 'flex' : 'hidden'
            }`}
          >
            <SkillComponent />
          </div>
        ))}

        {/* Tier 2: HTML-in-MD skills rendered in sandboxed iframe */}
        {filteredSkills
          .filter((s) => s.uiHtml && !SKILL_UI_REGISTRY[s.id])
          .map((skill) => (
            <div
              key={`iframe-${skill.id}`}
              className={`flex-1 min-h-0 flex-col relative w-full h-full ${
                activeCategory === skill.id ? 'flex' : 'hidden'
              }`}
            >
              <SkillIframeRenderer
                html={skill.uiHtml!}
                skillId={skill.id}
                onExecute={(params) => {
                  const paramStr = JSON.stringify(params, null, 2);
                  sendMessageToAi(
                    `Execute the UI action with parameters:\n\`\`\`json\n${paramStr}\n\`\`\``,
                    skill
                  );
                  setActiveRightTab('chat');
                  if (!isRightSidebarOpen) setIsRightSidebarOpen(true);
                }}
              />
            </div>
          ))}

        {/* Skills page */}
        <div
          className={`flex-1 min-h-0 flex-col relative w-full h-full ${
            activeCategory === 'skills' ? 'flex' : 'hidden'
          }`}
        >
          <SkillsPage
            skills={filteredSkills}
            selectedSkillId={selectedSkillId}
            activeApp={activeApp}
            onSelectSkill={(skill) => {
              setSelectedSkillId(skill.id);
              setActiveRightTab('chat');
            }}
            onNavigateToSkill={(skill) => {
              setActiveCategory(skill.id);
            }}
            onImportSkill={(skill) => {
              setSkills((prev) => [...prev, skill]);
            }}
            onDeleteSkill={async (skill) => {
              const targetFilename = skill.filename || `${skill.id}.md`;
              if (!targetFilename) {
                console.error('Cannot delete skill: missing filename');
                return;
              }
              try {
                const res = await fetch(
                  'http://localhost:3001/api/skills/delete',
                  {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ filename: targetFilename }),
                  }
                );
                if (res.ok) {
                  // After successful deletion, reload the skills from the server
                  const newSkills = await loadSkills();
                  setSkills(newSkills);
                  if (selectedSkillId === skill.id) {
                    setSelectedSkillId('default');
                  }
                } else {
                  console.error('Failed to delete skill');
                }
              } catch (e) {
                console.error('Error deleting skill:', e);
              }
            }}
          />
        </div>

        {/* Skill Planner Page */}
        <div
          className={`flex-1 min-h-0 flex-col relative w-full h-full ${
            activeCategory === 'skill-planner' ? 'flex' : 'hidden'
          }`}
        >
          <SkillPlannerPage
            content={activePlanContent}
            onClose={() => setActiveCategory('skills')}
            onSkillSaved={() => {
              loadSkills().then(setSkills);
              setTimeout(() => setActiveCategory('skills'), 3500);
            }}
          />
        </div>
        {/* Macro pages (fallback for categories not handled above) */}
        <div
          className={`flex-1 min-h-0 flex-col relative w-full h-full ${
            !['node-system', 'video-gen', 'image-gen', 'skills'].includes(
              activeCategory
            ) &&
            !SKILL_UI_REGISTRY[activeCategory] &&
            MACRO_CATEGORIES.some((c) => c.id === activeCategory)
              ? 'flex'
              : 'hidden'
          }`}
        >
          <ScrollArea className="flex-1 min-h-0 p-6 relative">
            <div className="max-w-4xl mx-auto pb-10">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold tracking-tight">
                  {MACRO_CATEGORIES.find((c) => c.id === activeCategory)?.name}{' '}
                  Macros
                </h2>
                <Button size="sm" variant="outline" className="gap-2">
                  <Settings className="h-4 w-4" />
                  Edit Profile
                </Button>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
                {MACROS.filter((m) => m.category === activeCategory).map(
                  (macro) => {
                    const Icon = macro.icon;
                    return (
                      <Card
                        key={macro.id}
                        className="group relative cursor-pointer active:scale-95 transition-all duration-200 border-border/60 hover:border-primary/50 hover:shadow-md bg-card/80 backdrop-blur-sm overflow-hidden"
                      >
                        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                        <CardContent className="p-5 flex flex-col items-center justify-center text-center h-32 gap-3 relative z-10">
                          <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center group-hover:bg-primary group-hover:text-primary-foreground transition-colors shadow-sm">
                            <Icon className="h-5 w-5" />
                          </div>
                          <div>
                            <div className="font-semibold text-sm leading-tight group-hover:text-primary transition-colors">
                              {macro.name}
                            </div>
                            <div className="text-[10px] uppercase font-mono tracking-wider text-muted-foreground mt-1 bg-muted px-1.5 py-0.5 rounded inline-block">
                              {macro.hotkey}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  }
                )}

                {/* Add New Macro Button */}
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

        {/* Right Sidebar - AI Chat & Logs */}
        <aside
          className={`w-80 border-l bg-card flex flex-col shrink-0 min-h-0 shadow-[-10px_0_20px_rgba(0,0,0,0.02)] z-10 ${
            isRightSidebarOpen ? '' : 'hidden'
          }`}
        >
          <div className="flex shadow-sm bg-muted/30 p-1 m-2 rounded-lg border shrink-0">
            <button
              onClick={() => setActiveRightTab('chat')}
              className={`flex-1 flex items-center justify-center gap-2 py-1.5 px-3 rounded-md text-xs font-medium transition-all ${
                activeRightTab === 'chat'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              }`}
            >
              <Sparkles className="h-3.5 w-3.5" />
              AI Assistant
            </button>
            <button
              onClick={() => setActiveRightTab('logs')}
              className={`flex-1 flex items-center justify-center gap-2 py-1.5 px-3 rounded-md text-xs font-medium transition-all ${
                activeRightTab === 'logs'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              }`}
            >
              <Terminal className="h-3.5 w-3.5" />
              App Logs
            </button>
          </div>

          {activeRightTab === 'chat' ? (
            <>
              {/* Project Brain — knowledge panel */}
              {activeProjectId && (
                <ProjectBrain
                  projectId={activeProjectId}
                  onAnalyzeRequest={() => {
                    setChatInput('Analyze the current project in depth');
                    // Focus the text input
                    setTimeout(() => {
                      const textarea = document.querySelector('textarea');
                      textarea?.focus();
                    }, 100);
                  }}
                />
              )}
              <ScrollArea className="flex-1 min-h-0 p-4">
                <div className="flex flex-col gap-4 pb-4">
                  {chatMessages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex gap-3 text-sm ${
                        msg.sender === 'user' ? 'flex-row-reverse' : ''
                      }`}
                    >
                      <div
                        className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 shadow-sm ${
                          msg.sender === 'user'
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted border border-border/50'
                        }`}
                      >
                        {msg.sender === 'user' ? (
                          <User className="h-4 w-4" />
                        ) : (
                          <Bot className="h-4 w-4" />
                        )}
                      </div>
                      <div
                        className={`py-2 px-3 rounded-xl max-w-[85%] leading-relaxed select-text cursor-text ${
                          msg.sender === 'user'
                            ? 'bg-primary text-primary-foreground rounded-tr-sm shadow-sm'
                            : 'bg-muted rounded-tl-sm border border-border/50 text-foreground shadow-sm'
                        }`}
                      >
                        {msg.sender === 'user' ? (
                          msg.text
                        ) : (
                          // Parse and render interactive cards for AI messages
                          <div className="space-y-2">
                            {msg.taskId && activeTasks.find((t) => t.id === msg.taskId) && (
                              <div className="bg-background/40 rounded-lg p-2.5 border text-xs mb-2">
                                <div className="text-muted-foreground font-semibold uppercase tracking-wider mb-0.5 text-[10px]">Thought Process</div>
                                {activeTasks
                                  .find((t) => t.id === msg.taskId)
                                  ?.steps.map((step, idx) => (
                                    <div
                                      key={idx}
                                      className="flex items-start gap-2"
                                    >
                                      <div className="w-3.5 h-3.5 rounded-full flex items-center justify-center shrink-0 mt-0.5">
                                        {step.status === 'done' ? (
                                          <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                                        ) : step.status === 'in-progress' ? (
                                          <Loader2 className="w-3.5 h-3.5 text-primary animate-spin" />
                                        ) : step.status === 'error' ? (
                                          <XCircle className="w-3.5 h-3.5 text-destructive" />
                                        ) : (
                                          <Circle className="w-3.5 h-3.5 text-muted-foreground" />
                                        )}
                                      </div>
                                      <span
                                        className={cn(
                                          'leading-relaxed transition-colors',
                                          step.status === 'done'
                                            ? 'text-muted-foreground'
                                            : step.status === 'in-progress'
                                            ? 'text-foreground font-medium'
                                            : 'text-muted-foreground'
                                        )}
                                      >
                                        {step.description}
                                      </span>
                                    </div>
                                  ))}
                              </div>
                            )}
                            {parseMessageContent(msg.text).map((part, i) => {
                              if (typeof part === 'string') {
                                return (
                                  <div
                                    key={i}
                                    style={{ whiteSpace: 'pre-wrap' }}
                                  >
                                    {part}
                                  </div>
                                );
                              }

                              if (part.type === 'card') {
                                return (
                                  <ChatCard
                                    key={i}
                                    card={part}
                                    onAction={(actionName, params) => {
                                      console.log(
                                        'Card action:',
                                        actionName,
                                        params
                                      );
                                      const actionText = `[Action executed: ${actionName} with params ${JSON.stringify(
                                        params
                                      )}]\\n\\nPlease process this action and return the result.`;

                                      setChatInput(actionText);
                                    }}
                                  />
                                );
                              }

                              if (part.type === 'skill') {
                                return (
                                  <SkillBuilderCard
                                    key={i}
                                    content={part.content}
                                    onSkillSaved={() => {
                                      console.log(
                                        'Skill saved! Reloading skill list...'
                                      );
                                      loadSkills().then((newSkills) =>
                                        setSkills(newSkills)
                                      );
                                    }}
                                  />
                                );
                              }

                              if (part.type === 'plan') {
                                return (
                                  <div key={i} className="mt-2 text-left">
                                    <Button
                                      variant="secondary"
                                      size="sm"
                                      onClick={() => {
                                        setActivePlanContent(
                                          (part as any).content
                                        );
                                        setActiveCategory('skill-planner');
                                      }}
                                      className="w-full justify-start gap-2 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 transition-colors shadow-sm font-medium"
                                    >
                                      👁️ View Implementation Plan
                                    </Button>
                                  </div>
                                );
                              }

                              return null;
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  {isAiTyping && (
                    <div className="flex flex-col gap-2">
                      <div className="flex gap-3 text-sm">
                        <div className="h-8 w-8 rounded-full flex items-center justify-center shrink-0 shadow-sm bg-muted border border-border/50">
                          <Bot className="h-4 w-4" />
                        </div>
                        <div className="py-2 px-3 rounded-xl max-w-[85%] bg-muted rounded-tl-sm border border-border/50 text-muted-foreground flex items-center gap-1 shadow-sm">
                          <span
                            className="w-1.5 h-1.5 rounded-full bg-current animate-bounce shrink-0"
                            style={{ animationDelay: '0ms' }}
                          />
                          <span
                            className="w-1.5 h-1.5 rounded-full bg-current animate-bounce shrink-0"
                            style={{ animationDelay: '150ms' }}
                          />
                          <span
                            className="w-1.5 h-1.5 rounded-full bg-current animate-bounce shrink-0"
                            style={{ animationDelay: '300ms' }}
                          />
                        </div>
                      </div>
                      
                      {/* Inline thought process / task steps */}
                      {currentChatTaskId && taskMap.get(currentChatTaskId) && (() => {
                        const chatTask = taskMap.get(currentChatTaskId)!;
                        return (
                          <div className="ml-11 flex flex-col gap-1.5 bg-muted/30 rounded-lg p-2.5 border text-xs">
                            <div className="text-muted-foreground font-semibold uppercase tracking-wider mb-0.5 text-[10px]">Processing Details</div>
                            {chatTask.steps.map((step, idx) => (
                              <div
                                key={idx}
                                className="flex items-start gap-2"
                              >
                                <div className="w-3.5 h-3.5 rounded-full flex items-center justify-center shrink-0 mt-0.5">
                                  {step.status === 'done' ? (
                                    <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                                  ) : step.status === 'in-progress' ? (
                                    <Loader2 className="w-3.5 h-3.5 text-primary animate-spin" />
                                  ) : step.status === 'error' || step.status === 'cancelled' ? (
                                    <XCircle className="w-3.5 h-3.5 text-destructive" />
                                  ) : (
                                    <Circle className="w-3.5 h-3.5 text-muted-foreground" />
                                  )}
                                </div>
                                <span
                                  className={cn(
                                    'leading-relaxed transition-colors',
                                    step.status === 'done'
                                      ? 'text-muted-foreground'
                                      : step.status === 'in-progress'
                                      ? 'text-foreground font-medium'
                                      : 'text-muted-foreground'
                                  )}
                                >
                                  {step.description}
                                </span>
                              </div>
                            ))}
                            {/* Chain of Thought */}
                            {chatTask.thoughts.length > 0 && (
                              <div className="mt-1.5 pt-1.5 border-t border-border/30">
                                <div className="flex items-center gap-1 mb-1">
                                  <Brain className="w-2.5 h-2.5 text-primary" />
                                  <span className="text-[9px] font-semibold uppercase tracking-wider text-primary">Reasoning</span>
                                </div>
                                {chatTask.thoughts.map((thought, idx) => (
                                  <p key={idx} className="text-[11px] text-muted-foreground leading-relaxed pl-3.5 border-l-2 border-primary/20 mb-1">
                                    {thought}
                                  </p>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>
              </ScrollArea>

              <div className="p-4 border-t bg-muted/30 shrink-0 flex flex-col gap-2">
                <div className="flex gap-2 items-center">
                  <select
                    className="flex-1 bg-background text-xs border border-border/50 rounded-md p-1.5 focus:ring-1 focus:ring-primary/50 outline-none text-muted-foreground"
                    value={selectedLlmModel}
                    onChange={(e) => setSelectedLlmModel(e.target.value)}
                  >
                    <option value="gemini-3.1-pro-preview">
                      Gemini 3.1 Pro Preview
                    </option>
                    <option value="gpt-5.4">OpenAI GPT-5.4</option>
                    <option value="claude-sonnet-4.6">Claude Sonnet 4.6</option>
                  </select>
                  <Button
                    onClick={() => setChatMessages(INITIAL_CHAT)}
                    variant="outline"
                    size="icon"
                    className="h-[30px] w-[30px] shrink-0 text-muted-foreground hover:text-destructive"
                    title="Clear Conversation"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <div className="relative">
                  {/* Skill Autocomplete Popup */}
                  {isAutocompleteOpen && (
                    <SkillAutocomplete
                      skills={filteredSkills}
                      query={autocompleteQuery}
                      onSelect={(skill) => {
                        setIsAutocompleteOpen(false);
                        setSelectedSkillId(skill.id);
                        if (skill.hasUI) {
                          setChatInput('');
                          setActiveCategory(skill.id);
                        } else {
                          setChatInput(`/${skill.triggerCommand || skill.id} `);
                          setActiveRightTab('chat');
                        }
                      }}
                      onDismiss={() => {
                        setIsAutocompleteOpen(false);
                        setChatInput('');
                      }}
                    />
                  )}
                  <div className="relative flex items-end">
                    <Textarea
                      value={chatInput}
                      onChange={(e: ChangeEvent<HTMLTextAreaElement>) => {
                        const val = e.target.value;
                        setChatInput(val);

                        // Detect / trigger for autocomplete
                        if (val.startsWith('/') && val.indexOf(' ') === -1) {
                          setIsAutocompleteOpen(true);
                          setAutocompleteQuery(val.substring(1));
                        } else {
                          setIsAutocompleteOpen(false);
                        }

                        // If user had a skill selected and erased the /prefix, deselect
                        if (
                          selectedSkillId !== 'default' &&
                          !val.startsWith('/')
                        ) {
                          setSelectedSkillId('default');
                        }
                      }}
                      onKeyDown={(e: KeyboardEvent<HTMLTextAreaElement>) => {
                        // When autocomplete is open, let it handle arrow/enter/escape
                        if (isAutocompleteOpen) {
                          if (
                            [
                              'ArrowUp',
                              'ArrowDown',
                              'Enter',
                              'Escape',
                            ].includes(e.key)
                          ) {
                            e.preventDefault();
                            return;
                          }
                        }
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleSendMessage();
                        }
                      }}
                      placeholder="Ask AI or type / to search skills..."
                      className={`pr-10 shadow-inner min-h-[40px] max-h-[150px] resize-none overflow-y-auto py-2 flex-1 transition-colors ${
                        selectedSkillId !== 'default'
                          ? 'border-primary/50 bg-primary/5 text-primary focus-visible:ring-primary/30'
                          : 'bg-background border-muted-foreground/20 focus-visible:ring-primary/50'
                      }`}
                      disabled={isAiTyping}
                    />
                    {isAiTyping ? (
                      <Button
                        onClick={() => {
                          if (abortControllerRef.current) {
                            abortControllerRef.current.abort();
                          }
                        }}
                        size="icon"
                        variant="destructive"
                        className="absolute right-1 bottom-1 h-7 w-7 transition-colors z-10 hover:bg-destructive/90"
                        title="Stop Generation"
                      >
                        <Square className="h-3 w-3 fill-current" />
                      </Button>
                    ) : (
                      <Button
                        onClick={handleSendMessage}
                        size="icon"
                        variant="ghost"
                        className="absolute right-1 bottom-1 h-7 w-7 text-primary hover:bg-primary/10 transition-colors z-10"
                        title="Send message"
                        disabled={isAiTyping}
                      >
                        <Send className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
                <div className="text-center mt-2 text-[10px] text-muted-foreground leading-tight">
                  Type{' '}
                  <kbd className="px-1 py-0.5 rounded bg-muted border text-[9px] font-mono font-bold">
                    /
                  </kbd>{' '}
                  to search skills · Enter to send
                </div>
              </div>
            </>
          ) : (
            <ScrollArea className="flex-1 min-h-0">
              <div className="flex flex-col p-2 space-y-1">
                {logs.map((log) => (
                  <div
                    key={log.id}
                    className="flex gap-2 text-[11px] p-2 rounded hover:bg-muted/50 font-mono"
                  >
                    <span className="text-muted-foreground shrink-0">
                      [{log.time}]
                    </span>
                    <span
                      className={`shrink-0 w-16 ${
                        log.level === 'info'
                          ? 'text-foreground'
                          : log.level === 'success'
                          ? 'text-foreground font-bold'
                          : 'text-muted-foreground line-through'
                      }`}
                    >
                      {log.level.toUpperCase()}
                    </span>
                    <span className="text-foreground break-all select-text cursor-text">
                      {log.message}
                    </span>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </aside>
      </main>

      {/* Footer / Status Bar */}
      <footer className="h-7 bg-card border-t flex items-center px-4 text-[11px] text-muted-foreground justify-between shrink-0">
        <div className="flex items-center gap-2">
          <MousePointer2 className="h-3 w-3" />
          <span>Ready. Select a macro to execute or chat with AI.</span>
        </div>
        <div className="font-mono">Profile: Default</div>
      </footer>
    </div>
  );
}
