/**
 * Centralized API client for the PipeFX backend.
 * Replaces all hardcoded `http://localhost:3001` fetch calls.
 */

const API_BASE = 'http://localhost:3001';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => null);
    throw Object.assign(new Error(errData?.error || `Request failed: ${res.status}`), {
      status: res.status,
    });
  }
  return res.json();
}

// ── Projects ──

export function fetchProjects(): Promise<any[]> {
  return request('/api/projects');
}

export function createProject(data: {
  name: string;
  externalAppName: string;
  externalProjectName?: string;
}): Promise<any> {
  return request('/api/projects', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

// ── Chat ──

export interface ChatPayload {
  message: string;
  skill?: any;
  history: Array<{ role: string; parts: Array<{ text: string }> }>;
  llmModel: string;
  activeApp: string;
  projectId?: string;
  taskId: string;
}

export interface ChatResponse {
  text?: string;
  actions?: any[];
}

export async function sendChat(
  payload: ChatPayload,
  signal?: AbortSignal
): Promise<ChatResponse> {
  const res = await fetch(`${API_BASE}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal,
  });
  if (!res.ok) {
    if (res.status === 499) {
      return { text: 'Agent stopped by user.' };
    }
    const errData = await res.json().catch(() => null);
    throw Object.assign(new Error(errData?.error || 'Failed to connect to AI Engine'), {
      status: res.status,
    });
  }
  return res.json();
}

// ── App State ──

export function switchApp(activeApp: string): Promise<void> {
  return request('/api/switch-app', {
    method: 'POST',
    body: JSON.stringify({ activeApp }),
  });
}

export async function getActiveAppState(): Promise<{ activeProjectName?: string }> {
  return request('/api/active-app-state');
}

// ── Knowledge ──

export function fetchKnowledge(projectId: string): Promise<any[]> {
  return request(`/api/knowledge?projectId=${projectId}`);
}

export function forgetKnowledge(id: string): Promise<void> {
  return request('/api/knowledge', {
    method: 'DELETE',
    body: JSON.stringify({ id }),
  });
}

// ── Skills ──

export function deleteSkill(filename: string): Promise<void> {
  return request('/api/skills/delete', {
    method: 'POST',
    body: JSON.stringify({ filename }),
  });
}

// ── Tasks ──

export function createTaskStreamUrl(projectId?: string): string {
  const base = `${API_BASE}/api/tasks/stream`;
  return projectId ? `${base}?projectId=${projectId}` : base;
}

export function cancelTask(taskId: string): Promise<void> {
  return request('/api/tasks/cancel', {
    method: 'POST',
    body: JSON.stringify({ taskId }),
  });
}

export function clearTasks(): Promise<void> {
  return request('/api/tasks/clear', { method: 'POST' });
}

// ── Settings ──

export function fetchSettings(): Promise<any> {
  return request('/api/settings');
}

export function updateSettings(settings: any): Promise<void> {
  return request('/api/settings', {
    method: 'POST',
    body: JSON.stringify(settings),
  });
}
