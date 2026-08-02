import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => ({
  base: './',
  build: {
    emptyOutDir: false,
    outDir: resolve(import.meta.dirname, 'dist/renderer'),
    sourcemap: mode === 'development',
  },
  plugins: [react()],
  root: resolve(import.meta.dirname, 'src/renderer'),
}));
