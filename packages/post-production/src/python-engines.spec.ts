// ── @pipefx/post-production — python-engines tests ───────────────────────

import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  resolvePythonEngineDir,
  resolvePythonEngineScript,
  resolvePythonProjectRoot,
} from './python-engines.js';

const FAKE_ROOT = path.resolve('/tmp/fake-workspace');

describe('resolvePythonEngineDir', () => {
  it('returns the pipefx_postpro Python package directory', () => {
    const dir = resolvePythonEngineDir(FAKE_ROOT);
    expect(dir).toBe(
      path.join(FAKE_ROOT, 'packages', 'post-production', 'python', 'pipefx_postpro')
    );
  });
});

describe('resolvePythonProjectRoot', () => {
  it('returns the pyproject root (parent of pipefx_postpro)', () => {
    const root = resolvePythonProjectRoot(FAKE_ROOT);
    expect(root).toBe(
      path.join(FAKE_ROOT, 'packages', 'post-production', 'python')
    );
  });
});

describe('resolvePythonEngineScript', () => {
  it.each(['audio_sync', 'autopod', 'xml_inject_sync', 'cli'] as const)(
    'resolves %s.py inside the engine directory',
    (name) => {
      const script = resolvePythonEngineScript(FAKE_ROOT, name);
      expect(script).toBe(
        path.join(
          FAKE_ROOT,
          'packages',
          'post-production',
          'python',
          'pipefx_postpro',
          `${name}.py`
        )
      );
    }
  );
});
