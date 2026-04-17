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
 * Markers that MUST appear somewhere in the assembled prompt. If any is
 * missing, the loader throws at boot — preferring a loud failure to a silent
 * regression where the agent quietly loses capabilities.
 */
const REQUIRED_MARKERS: string[] = [
  'PipeFX AI',
  'analyze_project',
  'pipeline_actions',
  '```plan',
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
