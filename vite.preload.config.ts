import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => ({
  build: {
    emptyOutDir: false,
    lib: {
      entry: resolve(import.meta.dirname, 'src/preload/index.ts'),
      formats: ['cjs'],
      fileName: () => 'index.cjs',
    },
    minify: false,
    outDir: resolve(import.meta.dirname, 'dist/preload'),
    rollupOptions: {
      external: [/^electron(?:\/.*)?$/, /^node:/],
    },
    sourcemap: mode === 'development',
    target: 'node24',
  },
}));
