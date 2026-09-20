import { resolve } from 'node:path';
import { defineConfig } from 'vite';

const root = import.meta.dirname;
const standardMainEntry = resolve(root, 'src/main/index.ts');
const serviceManagementStatusProofEntry = resolve(
  root,
  'src/main/execution/service-management-status-proof-entry.ts',
);

export default defineConfig(({ mode }) => {
  const entry = mode === 'service-management-status-proof'
    ? serviceManagementStatusProofEntry
    : standardMainEntry;
  return {
    build: {
      emptyOutDir: false,
      lib: {
        entry,
        formats: ['cjs'],
        fileName: () => 'index.cjs',
      },
      minify: false,
      outDir: resolve(root, 'dist/main'),
      rollupOptions: {
        external: [/^electron(?:\/.*)?$/, /^node:/],
      },
      sourcemap: mode === 'development',
      target: 'node24',
    },
  };
});
