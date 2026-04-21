import { useState, useEffect, useCallback } from 'react';
import { History, MessageSquare, Trash2, X } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { ScrollArea } from '../../components/ui/scroll-area';

interface ChatSession {
  id: string;
  projectId: string | null;
  title: string | null;
  model: string | null;
  messageCount: number;
  createdAt: number;
  updatedAt: number;
}

interface ChatMessage {
  id: number;
  sessionId: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

interface SessionHistoryProps {
  projectId?: string;
  currentSessionId: string | null;
  onLoadSession: (sessionId: string, messages: ChatMessage[]) => void;
  onClose: () => void;
  isOpen: boolean;
}

const API_BASE = 'http://localhost:3001';

export function SessionHistory({
  projectId,
  currentSessionId,
  onLoadSession,
  onClose,
  isOpen,
}: SessionHistoryProps) {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchSessions = useCallback(async () => {
    setLoading(true);
    try {
      const url = projectId
        ? `${API_BASE}/api/sessions?projectId=${projectId}&limit=30`
        : `${API_BASE}/api/sessions?limit=30`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setSessions(data);
      }
    } catch (err) {
      console.error('Failed to fetch sessions:', err);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (isOpen) {
      fetchSessions();
    }
  }, [isOpen, fetchSessions]);

  const loadSession = async (session: ChatSession) => {
    try {
      const res = await fetch(
        `${API_BASE}/api/sessions/${session.id}/messages`
      );
      if (res.ok) {
        const messages: ChatMessage[] = await res.json();
        onLoadSession(session.id, messages);
      }
    } catch (err) {
      console.error('Failed to load session messages:', err);
    }
  };

  const deleteSession = async (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await fetch(`${API_BASE}/api/sessions/${sessionId}`, {
        method: 'DELETE',
      });
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
    } catch (err) {
      console.error('Failed to delete session:', err);
    }
  };

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffDays = Math.floor(
      (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (diffDays === 0) {
      return date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
    }
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  if (!isOpen) return null;

  return (
    <div className="absolute bottom-full left-0 right-0 mb-1 z-50 bg-background border border-border rounded-lg shadow-xl overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-200">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/50 bg-muted/30">
        <div className="flex items-center gap-1.5">
          <History className="w-3.5 h-3.5 text-primary" />
          <span className="text-xs font-semibold text-foreground">
            Chat History
          </span>
          <span className="text-[10px] text-muted-foreground">
            ({sessions.length})
          </span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-5 w-5 text-muted-foreground hover:text-foreground"
          onClick={onClose}
        >
          <X className="h-3 w-3" />
        </Button>
      </div>

      <ScrollArea className="max-h-[240px]">
        {loading ? (
          <div className="flex items-center justify-center py-6">
            <span className="text-xs text-muted-foreground animate-pulse">
              Loading...
            </span>
          </div>
        ) : sessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-6 gap-1">
            <MessageSquare className="w-5 h-5 text-muted-foreground/50" />
            <span className="text-xs text-muted-foreground">
              No saved sessions yet
            </span>
          </div>
        ) : (
          <div className="py-1">
            {sessions.map((session) => (
              <button
                key={session.id}
                onClick={() => loadSession(session)}
                className={`w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted/50 transition-colors group ${
                  session.id === currentSessionId
                    ? 'bg-primary/5 border-l-2 border-primary'
                    : ''
                }`}
              >
                <MessageSquare className="w-3 h-3 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-foreground truncate">
                    {session.title || 'Untitled Session'}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] text-muted-foreground">
                      {session.messageCount} msgs
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {formatTime(session.updatedAt)}
                    </span>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive shrink-0"
                  onClick={(e) => deleteSession(session.id, e)}
                >
                  <Trash2 className="h-2.5 w-2.5" />
                </Button>
              </button>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
