// ── @pipefx/skills/domain — SKILL.md parser ──────────────────────────────
// Pure, synchronous, no I/O. Takes a SKILL.md source string, splits it
// into YAML frontmatter + Markdown body, validates the frontmatter, and
// returns a `LoadedSkill`. The loader (Phase 12.2) layers FS reads on top.
//
// Frontmatter delimiter rules:
//   • Source must start with a line that is exactly `---` (CRLF tolerated).
//   • Frontmatter ends at the next line that is exactly `---` or `...`.
//   • Everything after that closing line — including a single trailing
//     newline — is the body. Leading blank lines in the body are
//     preserved (the body is fed to the model verbatim).
//
// We tolerate UTF-8 BOMs at the start of the source — some Windows editors
// add them — but otherwise expect plain text.

import { parse as parseYaml } from 'yaml';
import { ZodError } from 'zod';

import type { LoadedSkill } from '../contracts/skill-md.js';
import {
  parseFrontmatter,
  type FrontmatterParseResult,
} from './skill-md-schema.js';

// ── Errors ───────────────────────────────────────────────────────────────

export type SkillMdParseError =
  | { kind: 'missing-frontmatter'; message: string }
  | { kind: 'unterminated-frontmatter'; message: string }
  | { kind: 'invalid-yaml'; message: string }
  | { kind: 'invalid-frontmatter'; message: string; zodResult: FrontmatterParseResult };

export type SkillMdParseResult =
  | { ok: true; loaded: LoadedSkill }
  | { ok: false; error: SkillMdParseError };

// ── Public API ───────────────────────────────────────────────────────────

export interface ParseSkillMdOptions {
  /** Filesystem path the source was read from. Threaded through to
   *  `LoadedSkill.sourceFile` for diagnostics; not used during parsing. */
  sourceFile?: string;
}

/**
 * Parse a SKILL.md source string.
 */
export function parseSkillMd(
  source: string,
  options: ParseSkillMdOptions = {}
): SkillMdParseResult {
  const split = splitFrontmatter(source);
  if (!split.ok) return { ok: false, error: split.error };

  let yamlValue: unknown;
  try {
    yamlValue = parseYaml(split.frontmatter);
  } catch (error) {
    return {
      ok: false,
      error: {
        kind: 'invalid-yaml',
        message: error instanceof Error ? error.message : String(error),
      },
    };
  }

  if (yamlValue === null || yamlValue === undefined) {
    return {
      ok: false,
      error: {
        kind: 'invalid-frontmatter',
        message: 'frontmatter is empty',
        zodResult: { ok: false, error: emptyZodError() },
      },
    };
  }

  const validated = parseFrontmatter(yamlValue);
  if (!validated.ok) {
    return {
      ok: false,
      error: {
        kind: 'invalid-frontmatter',
        message: validated.error.issues
          .map((i) => `${i.path.join('.') || '<root>'}: ${i.message}`)
          .join('; '),
        zodResult: validated,
      },
    };
  }

  return {
    ok: true,
    loaded: {
      frontmatter: validated.frontmatter,
      body: split.body,
      sourceFile: options.sourceFile,
    },
  };
}

/** Throwing variant — for tests and trusted-source paths. */
export function parseSkillMdOrThrow(
  source: string,
  options: ParseSkillMdOptions = {}
): LoadedSkill {
  const result = parseSkillMd(source, options);
  if (!result.ok) {
    throw new Error(`failed to parse SKILL.md: ${result.error.message}`);
  }
  return result.loaded;
}

// ── Internals ────────────────────────────────────────────────────────────

interface SplitOk {
  ok: true;
  frontmatter: string;
  body: string;
}
interface SplitErr {
  ok: false;
  error: SkillMdParseError;
}

function splitFrontmatter(source: string): SplitOk | SplitErr {
  // Strip UTF-8 BOM if present.
  const raw = source.charCodeAt(0) === 0xfeff ? source.slice(1) : source;

  // Normalize line endings for delimiter detection. We re-use the original
  // `raw` for body extraction so CRLF inside the body survives untouched.
  const normalized = raw.replace(/\r\n/g, '\n');

  if (!normalized.startsWith('---\n') && normalized !== '---' && !normalized.startsWith('---\r\n')) {
    // Either no frontmatter at all, or `---` without a trailing newline.
    if (normalized.trimStart().startsWith('---')) {
      // Lenient: source begins with `---` after some leading whitespace —
      // still treat as missing because YAML requires the delimiter at col 0.
      return {
        ok: false,
        error: {
          kind: 'missing-frontmatter',
          message: 'SKILL.md must begin with a `---` line at column 0',
        },
      };
    }
    return {
      ok: false,
      error: {
        kind: 'missing-frontmatter',
        message: 'SKILL.md must begin with a `---` frontmatter delimiter',
      },
    };
  }

  // Walk lines from index 1 (after the opening `---`) looking for the
  // closing delimiter. Either `---` or `...` terminates a YAML document.
  const lines = normalized.split('\n');
  let endIdx = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === '---' || lines[i] === '...') {
      endIdx = i;
      break;
    }
  }

  if (endIdx === -1) {
    return {
      ok: false,
      error: {
        kind: 'unterminated-frontmatter',
        message: 'frontmatter block is not closed by `---` or `...`',
      },
    };
  }

  const frontmatter = lines.slice(1, endIdx).join('\n');
  // Body starts on the line *after* the closing delimiter. A single
  // trailing newline (the one separating delimiter from body) is consumed;
  // additional blank lines remain part of the body.
  const body = lines.slice(endIdx + 1).join('\n');

  return { ok: true, frontmatter, body };
}

// Build a synthetic empty-input ZodError so the caller-facing
// `zodResult` field has a uniform shape across error kinds.
function emptyZodError(): ZodError {
  return new ZodError([
    {
      code: 'custom',
      path: [],
      message: 'frontmatter is empty',
    },
  ]);
}
