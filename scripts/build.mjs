import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { build } from 'vite';

const root = resolve(import.meta.dirname, '..');
const applicationBuildModes = new Set([
  'production',
  'service-management-lifecycle-proof',
  'service-management-status-proof',
]);

function admitApplicationBuildMode(candidate) {
  if (!applicationBuildModes.has(candidate)) {
    throw new Error('DOSAI_BUILD_MODE_0001');
  }
  return candidate;
}

export async function buildApplication(mainMode = 'production') {
  const admittedMainMode = admitApplicationBuildMode(mainMode);
  await rm(resolve(root, 'dist'), { force: true, recursive: true });

  await Promise.all([
    build({ configFile: resolve(root, 'vite.main.config.ts'), mode: admittedMainMode }),
    build({ configFile: resolve(root, 'vite.preload.config.ts'), mode: 'production' }),
    build({ configFile: resolve(root, 'vite.renderer.config.ts'), mode: 'production' }),
  ]);
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  await buildApplication();
}
