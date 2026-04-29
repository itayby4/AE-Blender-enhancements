import { appDataDir } from '@tauri-apps/api/path';
import { readTextFile, writeTextFile, mkdir, exists } from '@tauri-apps/plugin-fs';

export interface Project {
  id: string;
  name: string;
  folderPath: string;
  createdAt: number;
  updatedAt: number;
}

const FILE = 'projects.json';

async function getFilePath(): Promise<string> {
  const dir = await appDataDir();
  await mkdir(dir, { recursive: true });
  return `${dir}${dir.endsWith('/') || dir.endsWith('\\') ? '' : '/'}${FILE}`;
}

export async function loadProjects(): Promise<Project[]> {
  try {
    const p = await getFilePath();
    if (!(await exists(p))) return [];
    const text = await readTextFile(p);
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function persist(projects: Project[]): Promise<void> {
  await writeTextFile(await getFilePath(), JSON.stringify(projects, null, 2));
}

export async function saveProject(data: Pick<Project, 'name' | 'folderPath'>): Promise<Project> {
  const projects = await loadProjects();
  const now = Date.now();
  const project: Project = { id: `proj_${now}`, ...data, createdAt: now, updatedAt: now };
  await persist([...projects, project]);
  return project;
}

export async function updateProject(
  id: string,
  updates: Partial<Omit<Project, 'id' | 'createdAt'>>
): Promise<void> {
  const projects = await loadProjects();
  await persist(
    projects.map((p) => (p.id === id ? { ...p, ...updates, updatedAt: Date.now() } : p))
  );
}

export async function deleteProject(id: string): Promise<void> {
  const projects = await loadProjects();
  await persist(projects.filter((p) => p.id !== id));
}
