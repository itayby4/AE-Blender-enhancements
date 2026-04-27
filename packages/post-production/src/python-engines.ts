// ── @pipefx/post-production — Python engine path resolver ────────────────
// One-stop helper for finding the Python pipeline engine directory on
// disk. Callers (the in-package orchestrators at
// `packages/post-production/src/workflows/*.ts`) used to hardcode
// `path.join(workspaceRoot, 'stools')`; with the move in 9.2 they call
// `resolvePythonEngineDir` instead, so the path is one-touch when the
// Python tree shifts again.
//
// Why pass `workspaceRoot` rather than computing it from `import.meta.url`:
// the consumer always knows it (it's already in their config), and a
// computed path would have to special-case dev-source vs. built-dist
// layouts. Explicit > implicit when both are equally easy.

import path from 'node:path';

const PACKAGE_REL_DIR = path.join('packages', 'post-production', 'python');
const PYTHON_PACKAGE_NAME = 'pipefx_postpro';

/**
 * Absolute path to the directory holding the Python engine modules
 * (`audio_sync.py`, `autopod.py`, `xml_inject_sync.py`, `cli.py`). Use
 * this as the argument to `sys.path.insert` or as the directory to
 * resolve script paths against.
 *
 * Example:
 *   const engines = resolvePythonEngineDir(workspaceRoot);
 *   const autopodScript = path.join(engines, 'autopod.py');
 */
export function resolvePythonEngineDir(workspaceRoot: string): string {
  return path.join(workspaceRoot, PACKAGE_REL_DIR, PYTHON_PACKAGE_NAME);
}

/**
 * Absolute path to the Python project root (the directory containing
 * `pyproject.toml` and `requirements.txt`). Use this when invoking
 * `pip install` or `python -m build` — those commands expect the
 * project root, not the inner package dir.
 */
export function resolvePythonProjectRoot(workspaceRoot: string): string {
  return path.join(workspaceRoot, PACKAGE_REL_DIR);
}

/**
 * Absolute path to a single engine script. Convenience wrapper so
 * callers don't have to repeat the `path.join(resolvePythonEngineDir(...),
 * '<name>.py')` dance.
 */
export function resolvePythonEngineScript(
  workspaceRoot: string,
  scriptName: 'audio_sync' | 'autopod' | 'xml_inject_sync' | 'cli'
): string {
  return path.join(resolvePythonEngineDir(workspaceRoot), `${scriptName}.py`);
}
