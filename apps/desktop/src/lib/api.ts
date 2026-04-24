/**
 * Centralized API client for the PipeFX backend.
 * Replaces all hardcoded `http://localhost:3001` fetch calls.
 *
 * Auth: every request automatically includes the Supabase JWT
 * via the Authorization: Bearer header.
 */

import { getAccessToken } from '@pipefx/auth/ui';

const API_BASE = 'http://localhost:3001';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const token = await getAccessToken();

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
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
  const token = await getAccessToken();
  const res = await fetch(`${API_BASE}/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
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

// ── Agents (Todo / PlanMode / Sub-agents) ──

export function submitPlanResponse(payload: {
  sessionId: string;
  taskId: string;
  approved: boolean;
  feedback?: string;
}): Promise<{ ok: true }> {
  return request('/agents/plan-response', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function fetchTaskOutput(
  sessionId: string,
  taskId: string,
  tailBytes?: number
): Promise<{ taskId: string; sessionId: string; content: string }> {
  const qs = new URLSearchParams({ sessionId });
  if (tailBytes) qs.set('tail', String(tailBytes));
  return request(
    `/agents/tasks/${encodeURIComponent(taskId)}/output?${qs.toString()}`
  );
}

export function fetchSessionTodos(sessionId: string): Promise<{
  sessionId: string;
  todos: Array<{ content: string; activeForm: string; status: string }>;
  planMode: { active: boolean; plan?: string; approved?: boolean };
}> {
  return request(`/agents/sessions/${encodeURIComponent(sessionId)}/todos`);
}
