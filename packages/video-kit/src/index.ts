import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Absolute path to the root of the `@pipefx/video-kit` package
 * (the directory containing `package.json`, `pyproject.toml`, and `src/`).
 * Works for both the built ESM dist and the TS source loaded through the
 * `@pipefx/source` condition (CJS consumers provide `import.meta.url` via
 * an esbuild `define` that points at `pathToFileURL(__filename).href`).
 */
export const VIDEO_KIT_PACKAGE_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
);

/** Absolute path to the Python source tree (`packages/video-kit/src`). */
export const VIDEO_KIT_PY_SRC = path.join(VIDEO_KIT_PACKAGE_ROOT, 'src');
