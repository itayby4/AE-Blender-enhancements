import * as fs from 'fs';
import * as path from 'path';

/**
 * Load the system prompt by reading + concatenating the sectioned markdown
 * files under apps/backend/src/prompts/. Each section is a separate .md file
 * so iterating on agent behavior does not require hunting through a
 * 100-line template literal.
 */

/** Order matters: this is the order the sections will appear in the prompt. */
const PROMPT_SECTIONS = [
  'core',
  'memory',
  'pipeline_actions',
  'skills',
] as const;

export type PromptSection = (typeof PROMPT_SECTIONS)[number];

/**
 * Legacy sections — identity/tone/tasks now come from composer.ts, so
 * `core.md` is excluded here. These three still carry genuinely distinct
 * content (memory conventions, pipeline_actions JSON protocol, skills).
 */
const LEGACY_MD_SECTIONS: readonly PromptSection[] = [
  'memory',
  'pipeline_actions',
  'skills',
] as const;

/**
 * Markers that MUST appear somewhere in the assembled prompt. If any is
 * missing, the loader throws at boot — preferring a loud failure to a silent
 * regression where the agent quietly loses capabilities.
 */
const REQUIRED_MARKERS: string[] = [
  'PipeFX AI',
  'analyze_project',
  'pipeline_actions',
  // Phase 12.14: was '```plan' (the legacy v1 author block). Replaced
  // with the new brain tool name so the boot-time sanity check fails
  // loudly if someone deletes the skill-authoring section.
  'create_skill',
];

/**
 * Locate the prompts directory. Works both in dev (loading .ts from src/)
 * and in a built bundle (loading .js from dist/) because in both cases the
 * .md files sit next to the compiled module — assuming the esbuild config
 * copies apps/backend/src/prompts as an asset.
 *
 * Falls back to the workspace src/ path if the sibling directory is missing
 * (e.g. when running ts-node without an asset-copy step).
 */
function resolvePromptsDir(workspaceRoot: string): string {
  // 1) Same directory as this module (production / asset-copied)
  const beside = __dirname;
  if (fs.existsSync(path.join(beside, 'core.md'))) {
    return beside;
  }

  // 2) Source tree (dev mode)
  const sourceDir = path.join(
    workspaceRoot,
    'apps',
    'backend',
    'src',
    'prompts'
  );
  if (fs.existsSync(path.join(sourceDir, 'core.md'))) {
    return sourceDir;
  }

  throw new Error(
    `Cannot locate system prompt files. Looked in:\n` +
      `  - ${beside}\n` +
      `  - ${sourceDir}\n` +
      `Did you forget to add "apps/backend/src/prompts" to the esbuild assets list?`
  );
}

function readSection(dir: string, name: PromptSection): string {
  const filePath = path.join(dir, `${name}.md`);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing prompt section "${name}" at ${filePath}`);
  }
  const content = fs.readFileSync(filePath, 'utf8').trim();
  if (content.length === 0) {
    throw new Error(`Prompt section "${name}" is empty (${filePath})`);
  }
  return content;
}

/**
 * Assemble the full system prompt by concatenating all sections in order,
 * separated by blank lines. Validates at load time that every required
 * marker is present.
 *
 * Kept for backwards compat with any caller that still wants the old
 * flat-string prompt. New code should use `loadLegacySections()` + the
 * composer in `./composer.ts`.
 */
export function loadSystemPrompt(workspaceRoot: string): string {
  const dir = resolvePromptsDir(workspaceRoot);

  const parts = PROMPT_SECTIONS.map((section) => readSection(dir, section));
  const prompt = parts.join('\n\n');

  // Sanity-check: the assembled prompt must contain every required marker.
  const missing = REQUIRED_MARKERS.filter((m) => !prompt.includes(m));
  if (missing.length > 0) {
    throw new Error(
      `System prompt is missing required markers: ${missing
        .map((m) => `"${m}"`)
        .join(', ')}. Check the .md files in ${dir}.`
    );
  }

  return prompt;
}

/**
 * Load only the legacy markdown sections that still carry distinct content
 * after identity/tone/tasks/planning moved into composer.ts. These three
 * get threaded through the composer as a single cached `legacy_md` section.
 */
export function loadLegacySections(workspaceRoot: string): string {
  const dir = resolvePromptsDir(workspaceRoot);
  const parts = LEGACY_MD_SECTIONS.map((section) => readSection(dir, section));
  const joined = parts.join('\n\n');

  // Only pipeline_actions / analyze_project markers are asserted here —
  // "PipeFX AI" is the composer's responsibility now (identity section).
  // Phase 12.14: replaced legacy '```plan' marker with the create_skill
  // tool name (see REQUIRED_MARKERS above).
  const required = ['analyze_project', 'pipeline_actions', 'create_skill'];
  const missing = required.filter((m) => !joined.includes(m));
  if (missing.length > 0) {
    throw new Error(
      `Legacy prompt sections missing required markers: ${missing
        .map((m) => `"${m}"`)
        .join(', ')}. Check the .md files in ${dir}.`
    );
  }
  return joined;
}

export {
  composeSystemPrompt,
  clearSystemPromptSections,
} from './composer.js';
export type { PromptContext } from './composer.js';
