import { fileURLToPath } from 'node:url';
import * as path from 'node:path';

/**
 * Absolute path to the root of the `@pipefx/video-kit` package
 * (i.e. the directory containing `package.json`, `pyproject.toml`,
 * and `src/`). Works both when importing from source
 * (`@pipefx/source` condition) and from the built `dist/` output.
 */
export const VIDEO_KIT_PACKAGE_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
);

/** Absolute path to the Python source tree (`packages/video-kit/src`). */
export const VIDEO_KIT_PY_SRC = path.join(VIDEO_KIT_PACKAGE_ROOT, 'src');
