/**
 * PipeFX AI Brain — Type definitions for the memory engine.
 *
 * This module defines all data structures used by the SQLite-backed
 * cognitive architecture (projects, knowledge, sessions, tasks).
 */

// ──────────────────────── Projects ────────────────────────

export interface Project {
  id: string;
  name: string;
  external_app: string | null;
  external_project: string | null;
  genre: string | null;
  target_platforms: string | null; // JSON array stored as text
  deliverables: string | null;    // JSON object stored as text
  folder_path: string | null;
  status: string;
  created_at: number;
  updated_at: number;
}

/** Shape returned to the API / frontend (parsed JSON fields). */
export interface ProjectDTO {
  id: string;
  name: string;
  externalAppName?: string;
  externalProjectName?: string;
  genre?: string;
  targetPlatforms?: string[];
  deliverables?: Record<string, unknown>;
  folderPath?: string;
  status: string;
  createdAt: number;
  updatedAt: number;
}

// ──────────────────────── Knowledge ────────────────────────

export type KnowledgeCategory =
  | 'creative_rule'
  | 'preference'
  | 'fact'
  | 'decision'
  | 'constraint'
  | 'style_guide'
  | 'behavior'
  | 'content_analysis'
  | 'media_inventory';

export type KnowledgeSource =
  | 'user_stated'
  | 'ai_extracted'
  | 'ai_inferred';

export interface Knowledge {
  id: number;
  project_id: string | null;
  category: KnowledgeCategory;
  subject: string;
  content: string;
  source: KnowledgeSource;
  confidence: number;
  access_count: number;
  last_accessed: number | null;
  created_at: number;
  updated_at: number;
  superseded_by: number | null;
}

export interface KnowledgeDTO {
  id: number;
  projectId: string | null;
  category: KnowledgeCategory;
  subject: string;
  content: string;
  source: KnowledgeSource;
  confidence: number;
  accessCount: number;
  createdAt: number;
  updatedAt: number;
  supersededBy: number | null;
}

export interface KnowledgeInsert {
  projectId?: string;
  category: KnowledgeCategory;
  subject: string;
  content: string;
  source?: KnowledgeSource;
  confidence?: number;
}

// ──────────────────────── Knowledge Relations ────────────────────────

export type RelationType =
  | 'contradicts'
  | 'supports'
  | 'refines'
  | 'depends_on';

export interface KnowledgeRelation {
  id: number;
  from_id: number;
  to_id: number;
  relation_type: RelationType;
}

// ──────────────────────── Sessions ────────────────────────

export interface Session {
  id: string;
  project_id: string | null;
  summary: string | null;
  key_outcomes: string | null; // JSON array
  tools_used: string | null;   // JSON array
  started_at: number;
  ended_at: number | null;
}

export interface SessionDTO {
  id: string;
  projectId: string | null;
  summary: string | null;
  keyOutcomes: string[];
  toolsUsed: string[];
  startedAt: number;
  endedAt: number | null;
}

// ──────────────────────── Tasks ────────────────────────
// Canonical types re-exported from the shared @pipefx/tasks package.
// The raw DB row type is backend-specific and stays here.

export type { TaskStatus, TaskStep, TaskDTO } from '@pipefx/tasks';
export type { TaskEvent } from '@pipefx/tasks';

/** Raw SQLite row shape for the tasks table (backend-only). */
export interface TaskRow {
  id: string;
  project_id: string | null;
  session_id: string | null;
  name: string;
  status: string;
  steps: string | null;
  thoughts: string | null;
  result_summary: string | null;
  created_at: number;
  completed_at: number | null;
}

// ──────────────────────── User Profile ────────────────────────

export interface UserProfileRow {
  key: string;
  value: string; // JSON value
  updated_at: number;
}

// ──────────────────────── Learned Workflows ────────────────────────

export interface LearnedWorkflow {
  id: number;
  name: string;
  trigger_pattern: string | null;
  steps: string; // JSON array
  success_count: number;
  last_used: number | null;
}

// ──────────────────────── Context Assembly ────────────────────────

/** The assembled context injected into the AI system prompt. */
export interface AssembledContext {
  project: ProjectDTO | null;
  creativeRules: KnowledgeDTO[];
  relevantKnowledge: KnowledgeDTO[];
  lastSessionSummary: string | null;
  userPreferences: Record<string, unknown>;
}
