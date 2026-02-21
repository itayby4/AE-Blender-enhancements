import { useState, type ChangeEvent, type KeyboardEvent } from 'react';
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
  Terminal
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { ScrollArea } from '../components/ui/scroll-area';
import { Input } from '../components/ui/input';

interface ChatMessage {
  id: number;
  sender: string;
  text: string;
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
  { id: 'cut', category: 'edit', name: 'Ripple Cut', icon: Scissors, hotkey: 'Ctrl+Shift+X' },
  { id: 'add_text', category: 'edit', name: 'Add Text+', icon: Type, hotkey: 'T' },
  { id: 'align', category: 'edit', name: 'Align Clips', icon: AlignLeft, hotkey: 'Alt+A' },
  { id: 'grade_1', category: 'color', name: 'Apply Rec.709 LUT', icon: PaintBucket, hotkey: 'Num 1' },
  { id: 'grade_2', category: 'color', name: 'Teal & Orange', icon: PaintBucket, hotkey: 'Num 2' },
  { id: 'node_add', category: 'color', name: 'Add Serial Node', icon: Wand2, hotkey: 'Alt+S' },
  { id: 'audio_sync', category: 'audio', name: 'Auto-Sync Audio', icon: Volume2, hotkey: 'Ctrl+Alt+S' },
  { id: 'render', category: 'fx', name: 'Render Cache', icon: Play, hotkey: 'Ctrl+R' },
];

const INITIAL_CHAT: ChatMessage[] = [
  { id: 1, sender: 'ai', text: 'Hello! I am connected to DaVinci Resolve. How can I help you edit today?' },
  { id: 2, sender: 'user', text: 'Can you create a macro to apply my Teal & Orange LUT to all selected clips?' },
  { id: 3, sender: 'ai', text: 'Sure! I have generated a macro for that and added it to your Color Grading page.' },
];

const INITIAL_LOGS: LogEntry[] = [
  { id: 1, time: '10:00:00', level: 'info', message: 'Application started' },
  { id: 2, time: '10:00:02', level: 'info', message: 'Initializing UI components...' },
  { id: 3, time: '10:00:05', level: 'success', message: 'Connected to DaVinci Resolve Studio 18.6' },
  { id: 4, time: '10:00:06', level: 'info', message: 'Loaded 4 macro categories' },
];

export function App() {
  const [activeCategory, setActiveCategory] = useState('edit');
  const [activeRightTab, setActiveRightTab] = useState<'chat' | 'logs'>('chat');
  const [isConnected] = useState(true);
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState(INITIAL_CHAT);
  const [logs] = useState(INITIAL_LOGS);

  const handleSendMessage = () => {
    if (!chatInput.trim()) return;
    setChatMessages([...chatMessages, { id: Date.now(), sender: 'user', text: chatInput }]);
    setChatInput('');
  }

  return (
    <div className="flex flex-col h-screen bg-background text-foreground font-sans overflow-hidden select-none">
      
      {/* Top Menu Bar (Native OS Feel) */}
      <div className="flex items-center h-8 bg-muted/80 border-b px-2 text-[13px] text-muted-foreground w-full">
        <div className="flex space-x-1">
          <button className="px-3 hover:bg-muted hover:text-foreground rounded-sm transition-colors py-0.5">File</button>
          <button className="px-3 hover:bg-muted hover:text-foreground rounded-sm transition-colors py-0.5">Edit</button>
          <button className="px-3 hover:bg-muted hover:text-foreground rounded-sm transition-colors py-0.5">View</button>
          <button className="px-3 hover:bg-muted hover:text-foreground rounded-sm transition-colors py-0.5 font-medium text-foreground">Preferences</button>
          <button className="px-3 hover:bg-muted hover:text-foreground rounded-sm transition-colors py-0.5">Help</button>
        </div>
      </div>

      {/* Toolbar */}
      <header className="flex h-14 items-center justify-between border-b px-4 bg-card shrink-0">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-sm">
              <MonitorPlay className="h-4 w-4" />
            </div>
            <div>
              <h1 className="text-sm font-bold tracking-tight leading-none">PipeFX</h1>
              <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Command Center</span>
            </div>
          </div>
          
          <div className="h-6 w-px bg-border mx-2"></div>

          {/* Quick Actions */}
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground">
              <FolderOpen className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground">
              <Save className="h-4 w-4" />
            </Button>
            <div className="h-4 w-px bg-border mx-1"></div>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground">
              <Undo2 className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground">
              <Redo2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Status Indicator */}
        <div className="flex items-center gap-3 bg-muted/50 px-3 py-1.5 rounded-full border border-border/50">
          <div className="flex flex-col items-end">
            <span className="text-xs font-semibold leading-none">DaVinci Resolve</span>
            <span className="text-[10px] text-muted-foreground">Studio 18.6</span>
          </div>
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-background border shadow-sm">
            <div className={`h-2 w-2 rounded-full ${isConnected ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]' : 'bg-red-500'}`}></div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex flex-1 min-h-0 bg-muted/10">
        
        {/* Left Sidebar - Categories */}
        <aside className="w-56 border-r bg-card/50 flex flex-col items-stretch space-y-1 p-3 shrink-0">
          <div className="px-2 pb-2 mb-2 border-b">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Macro Pages</h2>
          </div>
          
          {MACRO_CATEGORIES.map(category => {
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

        {/* Center - Macro Grid */}
        <ScrollArea className="flex-1 p-6 relative">
          <div className="max-w-4xl mx-auto pb-10">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold tracking-tight">
                {MACRO_CATEGORIES.find(c => c.id === activeCategory)?.name} Macros
              </h2>
              <Button size="sm" variant="outline" className="gap-2">
                <Settings className="h-4 w-4" />
                Edit Profile
              </Button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
              {MACROS.filter(m => m.category === activeCategory).map(macro => {
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
              })}

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

        {/* Right Sidebar - AI Chat & Logs */}
        <aside className="w-80 border-l bg-card flex flex-col shrink-0 shadow-[-10px_0_20px_rgba(0,0,0,0.02)] z-10">
          <div className="flex shadow-sm bg-muted/30 p-1 m-2 rounded-lg border">
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
              <ScrollArea className="flex-1 p-4">
                <div className="flex flex-col gap-4 pb-4">
                  {chatMessages.map(msg => (
                    <div key={msg.id} className={`flex gap-3 text-sm ${msg.sender === 'user' ? 'flex-row-reverse' : ''}`}>
                      <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 shadow-sm ${msg.sender === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted border border-border/50'}`}>
                        {msg.sender === 'user' ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                      </div>
                      <div className={`py-2 px-3 rounded-xl max-w-[85%] leading-relaxed ${
                        msg.sender === 'user' 
                          ? 'bg-primary text-primary-foreground rounded-tr-sm shadow-sm' 
                          : 'bg-muted rounded-tl-sm border border-border/50 text-foreground shadow-sm'
                      }`}>
                        {msg.text}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
              
              <div className="p-4 border-t bg-muted/30">
                <div className="relative flex items-center">
                  <Input 
                    value={chatInput}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => setChatInput(e.target.value)}
                    onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => { 
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleSendMessage();
                      } 
                    }}
                    placeholder="Ask AI to create a macro..."
                    className="pr-10 bg-background shadow-inner border-muted-foreground/20 focus-visible:ring-primary/50 h-9"
                  />
                  <Button 
                    onClick={handleSendMessage}
                    size="icon" 
                    variant="ghost" 
                    className="absolute right-1 top-1 h-7 w-7 text-primary hover:bg-primary/10 transition-colors"
                    title="Send message"
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
                <div className="text-center mt-2 text-[10px] text-muted-foreground leading-tight">
                  Type or speak to generate custom macros
                </div>
              </div>
            </>
          ) : (
            <ScrollArea className="flex-1">
              <div className="flex flex-col p-2 space-y-1">
                {logs.map(log => (
                  <div key={log.id} className="flex gap-2 text-[11px] p-2 rounded hover:bg-muted/50 font-mono">
                    <span className="text-muted-foreground shrink-0">[{log.time}]</span>
                    <span className={`shrink-0 w-16 ${log.level === 'info' ? 'text-blue-500' : log.level === 'success' ? 'text-green-500' : 'text-red-500'}`}>
                      {log.level.toUpperCase()}
                    </span>
                    <span className="text-foreground break-all">{log.message}</span>
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
        <div className="font-mono">
          Profile: Default
        </div>
      </footer>
    </div>
  );
}
