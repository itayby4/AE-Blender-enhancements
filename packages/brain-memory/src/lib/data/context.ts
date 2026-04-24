/**
 * PipeFX AI Brain — Context assembly for AI prompts.
 *
 * Builds a structured, curated context string that gets injected into
 * the AI's system prompt. Only retrieves *relevant* information to
 * avoid "context pollution" and token waste.
 */

import {
  listKnowledge,
  searchKnowledge,
  getProjectMemories,
} from './knowledge.js';
import { getProject } from './projects.js';
import { getLastSessionSummary } from './sessions.js';
import { getUserPreferences } from './user-profile.js';
import type { KnowledgeDTO, ProjectDTO } from './types.js';

/**
 * Assemble the full project context for injection into the AI system prompt.
 *
 * Strategy:
 * 1. CORE — Project identity (always present)
 * 2. CREATIVE RULES — Style guides, constraints, creative rules (always present)
 * 3. RELEVANT KNOWLEDGE — FTS search based on user's current message
 * 4. LAST SESSION — Summary from previous session for continuity
 * 5. USER PREFERENCES — Global preferences (always present)
 */
export function assembleProjectContext(
  projectId: string,
  userMessage?: string
): string {
  const sections: string[] = [];

  // 1. Project identity
  const project = getProject(projectId);
  if (project) {
    sections.push(formatProjectSection(project));
  }

  // 2. Creative rules (always loaded for the active project)
  const rules = listKnowledge(projectId, [
    'creative_rule',
    'style_guide',
    'constraint',
  ]);
  if (rules.length > 0) {
    sections.push(formatRulesSection(rules));
  }

  // 3. Relevant knowledge (FTS search based on user's message)
  if (userMessage) {
    const relevant = searchKnowledge(userMessage, projectId, 10);
    // Filter out rules we already included
    const ruleIds = new Set(rules.map((r) => r.id));
    const extraKnowledge = relevant.filter((k) => !ruleIds.has(k.id));
    if (extraKnowledge.length > 0) {
      sections.push(formatKnowledgeSection(extraKnowledge));
    }
  }

  // 4. Last session summary
  const lastSummary = getLastSessionSummary(projectId);
  if (lastSummary) {
    sections.push(`### Last Session Recap\n${lastSummary}`);
  }

  // 5. User preferences
  const prefs = getUserPreferences();
  if (Object.keys(prefs).length > 0) {
    sections.push(formatPreferencesSection(prefs));
  }

  if (sections.length === 0) return '';

  return `\n\n## PROJECT CONTEXT\n${sections.join('\n\n')}`;
}

/**
 * Build a legacy-compatible context string (for backwards compatibility
 * with the existing system that just dumps memories into the prompt).
 */
export function assembleLegacyContext(projectId: string): string {
  const project = getProject(projectId);
  if (!project) return '';

  const memories = getProjectMemories(projectId);
  if (memories.length === 0) return '';

  const mems = memories.map((m, i) => `${i + 1}. ${m}`).join('\n');
  return `\n\n### PROJECT CONTEXT\nYou are currently editing Project: "${project.name}".\nHere are the long-term memories/preferences the user saved for this project. YOU MUST NEVER DEVIATE FROM THESE GUIDELINES:\n${mems}`;
}

// ──────────────────────── Formatters ────────────────────────

function formatProjectSection(project: ProjectDTO): string {
  const lines = [
    `### Active Project: "${project.name}"`,
    `- Project ID: ${project.id}  *(always use this ID when calling tools that require projectId)*`,
  ];
  if (project.genre) lines.push(`- Genre: ${project.genre}`);
  if (project.targetPlatforms?.length) {
    lines.push(`- Target Platforms: ${project.targetPlatforms.join(', ')}`);
  }
  if (project.deliverables) {
    lines.push(`- Deliverables: ${JSON.stringify(project.deliverables)}`);
  }
  return lines.join('\n');
}

function formatRulesSection(rules: KnowledgeDTO[]): string {
  const lines = [
    '### Creative Rules & Constraints (MUST FOLLOW)',
    ...rules.map(
      (r) => `- **[${r.category}]** ${r.subject}: ${r.content}`
    ),
  ];
  return lines.join('\n');
}

function formatKnowledgeSection(items: KnowledgeDTO[]): string {
  const lines = [
    '### Relevant Context',
    ...items.map(
      (k) => `- [${k.category}] ${k.subject}: ${k.content}`
    ),
  ];
  return lines.join('\n');
}

function formatPreferencesSection(prefs: Record<string, unknown>): string {
  const lines = ['### User Preferences'];
  for (const [key, value] of Object.entries(prefs)) {
    lines.push(`- ${key}: ${typeof value === 'string' ? value : JSON.stringify(value)}`);
  }
  return lines.join('\n');
}
