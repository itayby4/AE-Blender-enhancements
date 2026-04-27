// ── @pipefx/skills/backend — script-mode runner host ─────────────────────
// Phase 12.6 implementation of the `ScriptRunner` port declared in
// `domain/runner/script-runner.ts`. Spawns a child process for `script`-
// mode skills, pipes the user-submitted inputs as a single JSON document
// on stdin, and captures stdout/stderr.
//
// Interpreter resolution:
//
//   1. If `frontmatter.scripts.interpreter` is set, use it verbatim.
//   2. Otherwise infer from the entry's extension:
//        .py        → python3
//        .mjs/.cjs  → node
//        .js        → node
//        .sh        → bash
//
//   Anything else throws — authors must opt in with an explicit interpreter
//   for non-standard extensions.
//
// Lifecycle guarantees:
//
//   • Hard timeout (default 5 min, configurable). On expiry the child gets
//     `SIGKILL` and the run rejects with a timeout error.
//   • External `AbortSignal` — when triggered, the child gets `SIGTERM`.
//   • `onLine` hook receives every newline-delimited stdout/stderr line as
//     it arrives so the run record can stream output without re-reading
//     the buffered tails. The promise still resolves with the full
//     captured `stdout` / `stderr` strings for callers that prefer the
//     batch view (the routes/runs handler does).
//
// What this layer does NOT do:
//
//   • Sandbox the child. The skill runs with the backend's process
//     credentials. The signing port (Phase 12.13) is what gates which
//     scripts are allowed to run, not this spawner.
//
//   • Pipe MCP / brain handles into the child. Script-mode skills
//     interact with the workspace through Claude Code-style file I/O
//     against the install directory's `cwd`; tool access flows back
//     through the brain when a script-mode skill needs it (Phase 12.10+
//     migrations exercise this surface).

import { spawn } from 'node:child_process';
import * as path from 'node:path';

import type {
  ScriptRunInput,
  ScriptRunResult,
  ScriptRunner,
} from '../../domain/runner/index.js';

// ── Public types ─────────────────────────────────────────────────────────

export type ScriptRunnerLineKind = 'stdout' | 'stderr';

export interface CreateScriptRunnerOptions {
  /** Hard timeout for any single run. Defaults to 5 minutes. */
  timeoutMs?: number;
  /** Receives every newline-terminated line of output as it arrives. The
   *  trailing partial line (if any) is flushed at process close. Errors
   *  thrown by the listener are swallowed — the runner won't fail a run
   *  because of a logging hiccup. */
  onLine?: (
    runId: string,
    kind: ScriptRunnerLineKind,
    line: string
  ) => void;
}

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

const EXTENSION_INTERPRETERS: Readonly<Record<string, string>> = {
  '.py': 'python3',
  '.mjs': 'node',
  '.cjs': 'node',
  '.js': 'node',
  '.sh': 'bash',
};

// ── Helpers (exported for tests) ─────────────────────────────────────────

export function resolveScriptInterpreter(
  entry: string,
  override?: string
): string {
  if (override && override.length > 0) return override;
  const ext = path.extname(entry).toLowerCase();
  const fromExt = EXTENSION_INTERPRETERS[ext];
  if (!fromExt) {
    throw new Error(
      `cannot infer interpreter for "${entry}" — set frontmatter scripts.interpreter`
    );
  }
  return fromExt;
}

// ── Factory ──────────────────────────────────────────────────────────────

export function createScriptRunner(
  opts: CreateScriptRunnerOptions = {}
): ScriptRunner {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const onLine = opts.onLine;

  return {
    async run(input: ScriptRunInput): Promise<ScriptRunResult> {
      const fm = input.skill.loaded.frontmatter;
      const scripts = fm.scripts;
      if (!scripts?.entry) {
        throw new Error(
          `script-mode skill "${fm.id}" has no scripts.entry`
        );
      }
      const interpreter = resolveScriptInterpreter(
        scripts.entry,
        scripts.interpreter
      );
      const scriptAbs = path.join(input.skill.installPath, scripts.entry);
      return spawnScript({
        runId: input.runId,
        interpreter,
        scriptAbs,
        cwd: input.skill.installPath,
        inputs: input.inputs,
        timeoutMs,
        onLine,
        signal: input.signal,
      });
    },
  };
}

// ── Internals ────────────────────────────────────────────────────────────

interface SpawnInput {
  readonly runId: string;
  readonly interpreter: string;
  readonly scriptAbs: string;
  readonly cwd: string;
  readonly inputs: Readonly<Record<string, string | number | boolean>>;
  readonly timeoutMs: number;
  readonly onLine?: CreateScriptRunnerOptions['onLine'];
  readonly signal?: AbortSignal;
}

function spawnScript(s: SpawnInput): Promise<ScriptRunResult> {
  return new Promise<ScriptRunResult>((resolve, reject) => {
    const child = spawn(s.interpreter, [s.scriptAbs], {
      cwd: s.cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let stdoutBuf = '';
    let stderrBuf = '';
    let settled = false;

    const finish = (cleanup: () => void) => {
      settled = true;
      cleanup();
    };

    const timer = setTimeout(() => {
      if (settled) return;
      finish(() => child.kill('SIGKILL'));
      reject(new Error(`script timed out after ${s.timeoutMs}ms`));
    }, s.timeoutMs);

    const onAbort = () => {
      if (settled) return;
      finish(() => child.kill('SIGTERM'));
      reject(new Error('script aborted'));
    };
    s.signal?.addEventListener('abort', onAbort);

    const emitLine = (kind: ScriptRunnerLineKind, line: string) => {
      if (!s.onLine) return;
      try {
        s.onLine(s.runId, kind, line);
      } catch {
        // Listener errors must never fail the run.
      }
    };

    const consume = (
      kind: ScriptRunnerLineKind,
      buf: string,
      chunk: string
    ): string => {
      const next = (buf + chunk).split('\n');
      const tail = next.pop() ?? '';
      for (const line of next) emitLine(kind, line);
      return tail;
    };

    child.stdout.setEncoding('utf-8');
    child.stderr.setEncoding('utf-8');
    child.stdout.on('data', (data: string) => {
      stdout += data;
      stdoutBuf = consume('stdout', stdoutBuf, data);
    });
    child.stderr.on('data', (data: string) => {
      stderr += data;
      stderrBuf = consume('stderr', stderrBuf, data);
    });

    child.on('error', (err) => {
      if (settled) return;
      clearTimeout(timer);
      s.signal?.removeEventListener('abort', onAbort);
      settled = true;
      reject(err);
    });

    child.on('close', (code) => {
      if (settled) return;
      clearTimeout(timer);
      s.signal?.removeEventListener('abort', onAbort);
      if (stdoutBuf.length > 0) emitLine('stdout', stdoutBuf);
      if (stderrBuf.length > 0) emitLine('stderr', stderrBuf);
      settled = true;
      resolve({
        exitCode: code ?? -1,
        stdout,
        stderr,
      });
    });

    try {
      child.stdin.write(JSON.stringify(s.inputs ?? {}));
      child.stdin.end();
    } catch {
      // The 'error' / 'close' handlers above will settle the promise.
    }
  });
}
