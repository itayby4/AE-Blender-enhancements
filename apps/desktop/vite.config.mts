/// <reference types='vitest' />
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { defineConfig } from 'vite';

const host = process.env.TAURI_DEV_HOST;

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/apps/desktop',
  clearScreen: false,
  server: {
    port: 4200,
    host: host || 'localhost',
    strictPort: true,
    hmr: host ? { protocol: 'ws', host, port: 4201 } : undefined,
    watch: {
      ignored: ['**/src-tauri/**'],
    },
  },
  preview: {
    port: 4300,
    host: 'localhost',
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  plugins: [react(), tailwindcss()],
  envPrefix: ['VITE_', 'TAURI_'],
  build: {
    outDir: './dist',
    emptyOutDir: true,
    reportCompressedSize: true,
    commonjsOptions: {
      transformMixedEsModules: true,
    },
    target: ['es2021', 'chrome100', 'safari13'],
    minify: !process.env.TAURI_DEBUG ? ('esbuild' as const) : false,
    sourcemap: !!process.env.TAURI_DEBUG,
  },
  test: {
    name: 'desktop',
    watch: false,
    globals: true,
    environment: 'jsdom',
    include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default'],
    passWithNoTests: true,
    coverage: {
      reportsDirectory: './test-output/vitest/coverage',
      provider: 'v8' as const,
    },
  },
}));
