/**
 * Load user-defined agent profiles from a directory.
 *
 * Scans `<dir>/*.json` and parses each as an `AgentProfile`. Missing dirs
 * resolve to an empty list (no error) so the feature is opt-in. Invalid
 * files are logged and skipped; one bad file does not break the rest.
 *
 * Expected JSON shape:
 * ```
 * {
 *   "name": "plan-edit",
 *   "type": "local_agent",
 *   "whenToUse": "Break a complex edit down into an ordered action plan.",
 *   "systemPrompt": "You are the plan-edit sub-agent...",
 *   "allowedTools": ["add_timeline_marker", "get_project_info"]
 * }
 * ```
 */

import { promises as fs } from 'node:fs';
import { existsSync } from 'node:fs';
import * as path from 'node:path';
import type { AgentProfile, TaskType } from '@pipefx/brain-contracts';
import { brainSubagentsLog } from '../log.js';

const VALID_TASK_TYPES: readonly TaskType[] = [
  'local_bash',
  'local_agent',
  'remote_agent',
  'in_process_teammate',
  'local_workflow',
  'monitor_mcp',
  'dream',
];

function isAgentProfile(v: unknown): v is AgentProfile {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  if (typeof o.name !== 'string' || !o.name) return false;
  if (typeof o.type !== 'string' || !VALID_TASK_TYPES.includes(o.type as TaskType))
    return false;
  if (typeof o.whenToUse !== 'string') return false;
  if (o.systemPrompt !== undefined && typeof o.systemPrompt !== 'string')
    return false;
  if (o.allowedTools !== undefined && !Array.isArray(o.allowedTools)) return false;
  return true;
}

export async function loadAgentsDir(dir: string): Promise<AgentProfile[]> {
  if (!existsSync(dir)) {
    brainSubagentsLog.debug('loadAgentsDir skip (no dir)', { dir });
    return [];
  }

  let names: string[];
  try {
    names = await fs.readdir(dir);
  } catch (err) {
    brainSubagentsLog.warn('loadAgentsDir readdir failed', {
      dir,
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }

  const profiles: AgentProfile[] = [];
  for (const name of names) {
    if (!name.endsWith('.json')) continue;
    const file = path.join(dir, name);
    try {
      const raw = await fs.readFile(file, 'utf8');
      const parsed = JSON.parse(raw);
      const list = Array.isArray(parsed) ? parsed : [parsed];
      for (const entry of list) {
        if (isAgentProfile(entry)) {
          profiles.push(entry);
        } else {
          brainSubagentsLog.warn('loadAgentsDir skip invalid entry', {
            file,
            reason: 'shape-mismatch',
          });
        }
      }
    } catch (err) {
      brainSubagentsLog.warn('loadAgentsDir parse failed', {
        file,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  brainSubagentsLog.info('loadAgentsDir', { dir, profileCount: profiles.length });
  return profiles;
}

/**
 * Compose a final profile list: built-ins first, then user profiles that
 * don't collide (user-defined names override built-ins when they share a
 * name — lets users customize e.g. "explore" for their own codebase).
 */
export function composeProfiles(
  builtIn: AgentProfile[],
  user: AgentProfile[]
): AgentProfile[] {
  const userNames = new Set(user.map((p) => p.name));
  const kept = builtIn.filter((p) => !userNames.has(p.name));
  return [...kept, ...user];
}
