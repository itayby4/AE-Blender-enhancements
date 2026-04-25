// ── @pipefx/skills/domain — template engine ──────────────────────────────
// Renders a SkillManifest.prompt against the user's input form values.
//
// Why a tiny custom engine instead of Mustache/Handlebars?
//
// • Skill prompts are user-authored content destined for the LLM. We want
//   exact control over what counts as a substitution and what passes
//   through verbatim — no helpers, no partials, no HTML escaping (the
//   prompt is plain text, not markup), no surprise behavior.
// • Mustache's lambda + section semantics overlap awkwardly with our
//   inputs (which are typed values, not nested objects).
// • Keeping the engine small makes it auditable from a prompt-injection
//   standpoint: we know exactly which input values land in the prompt and
//   which delimiters could end a section block.
//
// Supported syntax (everything else is literal text):
//
//   {{name}}                     — substitute a variable
//   {{#if name}}…{{/if}}         — include block iff value is truthy
//   {{#unless name}}…{{/unless}} — include block iff value is falsy
//   {{!  any comment  }}         — stripped from output (notes for authors)
//
// `truthy` follows JS `Boolean(...)` for booleans/numbers and treats empty
// strings as falsy — matching what the form-builder UI does when an
// optional input is left blank.
//
// We DO NOT support nested blocks of the same kind (no `{{#if a}}{{#if b}}…`),
// because no current example skill needs them and supporting them would
// require a real parser. If we hit that case, switch to a tokenizer rather
// than extending the regex.

import type { SkillInput, SkillManifest } from '../contracts/types.js';

export type SkillInputValue = string | number | boolean;
export type SkillInputValues = Readonly<Record<string, SkillInputValue>>;

export interface RenderOptions {
  /**
   * When true, throw if the prompt references a variable that isn't in
   * `values` AND isn't declared on the manifest. Defaults to true — silent
   * blanks have historically masked typos that only surface as
   * mysteriously-bad model output.
   */
  strict?: boolean;
}

export interface RenderResult {
  text: string;
  /** Variables that appeared in the template. Useful for the dry-run UI
   *  (Phase 7.8) to highlight which form fields actually fed into the
   *  prompt. */
  usedVariables: ReadonlyArray<string>;
}

// ── Public API ───────────────────────────────────────────────────────────

/**
 * Render a manifest's prompt with the given input values. Convenience
 * wrapper around `renderTemplate` that pre-fills defaults from the
 * manifest's declared inputs so authors don't have to thread that through
 * at every call site.
 */
export function renderManifestPrompt(
  manifest: SkillManifest,
  values: SkillInputValues,
  options: RenderOptions = {}
): RenderResult {
  const merged: Record<string, SkillInputValue> = {};
  for (const input of manifest.inputs) {
    if (input.default !== undefined) merged[input.name] = input.default;
  }
  for (const [k, v] of Object.entries(values)) {
    merged[k] = v;
  }
  return renderTemplate(manifest.prompt, merged, {
    declaredInputs: manifest.inputs,
    ...options,
  });
}

interface InternalOptions extends RenderOptions {
  declaredInputs?: ReadonlyArray<SkillInput>;
}

/**
 * Render a raw template string. Exposed for tests + the authoring UI's
 * live preview, which renders the in-progress prompt before the manifest
 * is even valid.
 */
export function renderTemplate(
  template: string,
  values: SkillInputValues,
  options: InternalOptions = {}
): RenderResult {
  const strict = options.strict ?? true;
  const declaredNames = new Set(
    (options.declaredInputs ?? []).map((i) => i.name)
  );
  const used = new Set<string>();

  // Pass 1: strip comments. Done first so a comment that contains `{{#if x}}`
  // can't fool the block matcher.
  let work = template.replace(/\{\{!\s*[\s\S]*?\s*\}\}/g, '');

  // Pass 2: resolve `{{#if}}` / `{{#unless}}` blocks. Non-greedy so adjacent
  // blocks don't get swallowed into a single match. The `(?!\{\{[#/])` in
  // the body would let us reject nested same-kind blocks, but matching
  // them and erroring out is friendlier than silently rendering wrong
  // output.
  work = work.replace(
    /\{\{#(if|unless)\s+([A-Za-z_][A-Za-z0-9_]*)\s*\}\}([\s\S]*?)\{\{\/\1\s*\}\}/g,
    (_match, kind: string, name: string, body: string) => {
      assertResolvable(name, values, declaredNames, strict);
      used.add(name);
      if (/\{\{#(if|unless)\b/.test(body)) {
        throw new Error(
          `template error: nested {{#if}}/{{#unless}} blocks are not supported (variable: ${name})`
        );
      }
      const truthy = isTruthy(values[name]);
      const include = kind === 'if' ? truthy : !truthy;
      return include ? body : '';
    }
  );

  // Pass 3: any leftover `{{#…}}` or `{{/…}}` means a malformed block.
  // Catch it before substitution silently drops it on the floor.
  const stray = /\{\{[#/][^}]*\}\}/.exec(work);
  if (stray) {
    throw new Error(
      `template error: unmatched block tag "${stray[0]}" (check for typos or nested blocks)`
    );
  }

  // Pass 4: variable substitution.
  work = work.replace(
    /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g,
    (_match, name: string) => {
      assertResolvable(name, values, declaredNames, strict);
      used.add(name);
      const v = values[name];
      return v === undefined || v === null ? '' : String(v);
    }
  );

  return { text: work, usedVariables: [...used] };
}

// ── Helpers ──────────────────────────────────────────────────────────────

function isTruthy(value: SkillInputValue | undefined): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string') return value.length > 0;
  if (typeof value === 'number') return value !== 0 && !Number.isNaN(value);
  return Boolean(value);
}

function assertResolvable(
  name: string,
  values: SkillInputValues,
  declaredNames: Set<string>,
  strict: boolean
): void {
  if (!strict) return;
  if (Object.prototype.hasOwnProperty.call(values, name)) return;
  if (declaredNames.has(name)) return;
  throw new Error(
    `template error: undeclared variable "${name}" — add it to manifest.inputs or pass it in values`
  );
}
