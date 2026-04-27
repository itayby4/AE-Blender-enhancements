import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  rmSync,
} from 'node:fs';

// CEP loads index.html in a CEF webview that has Node's `require` available
// (via the `--enable-nodejs` CEF flag in CSXS/manifest.xml). We need:
//   - CJS output, so `import http from 'http'` compiles to `require('http')`.
//   - A single bundle file, no module preloading.
//   - Node builtins marked external so they resolve at runtime via require().
//
// Using Vite library mode gives us all three with the simplest config. The
// downside: Vite stops auto-generating <script> tags in index.html. We hand-
// write the script tag in index.html and treat the JS bundle as a classic
// script (no `type="module"`, no `crossorigin`).
export default defineConfig({
  root: __dirname,
  base: './',
  cacheDir: '../../node_modules/.vite/apps/mcp-aftereffects',
  plugins: [
    react(),
    {
      name: 'pipefx-copy-cep-assets',
      closeBundle() {
        const distDir = resolve(__dirname, 'dist');
        // index.html is hand-written (not transformed by Vite in lib mode).
        copyFileSync(
          resolve(__dirname, 'index.html'),
          resolve(distDir, 'index.html')
        );
        const cepAssets = [
          ['CSXS', true],
          ['.debug', false],
          ['host.jsx', false],
          ['CSInterface.js', false],
        ] as const;
        for (const [name, isDir] of cepAssets) {
          const src = resolve(__dirname, name);
          const dst = resolve(distDir, name);
          if (!existsSync(src)) continue;
          if (isDir) {
            if (existsSync(dst)) rmSync(dst, { recursive: true, force: true });
            cpSync(src, dst, { recursive: true });
          } else {
            mkdirSync(distDir, { recursive: true });
            copyFileSync(src, dst);
          }
        }
      },
    },
  ],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2020',
    sourcemap: true,
    lib: {
      entry: resolve(__dirname, 'src/main.tsx'),
      formats: ['cjs'],
      fileName: () => 'main.js',
    },
    rollupOptions: {
      external: [
        /^node:/,
        'os',
        'fs',
        'path',
        'http',
        'https',
        'crypto',
        'tls',
        'net',
        'url',
        'stream',
        'events',
        'buffer',
        'util',
        'querystring',
        'zlib',
        'async_hooks',
      ],
    },
  },
});
