import type { RuntimeSnapshot } from '../../contracts/runtime';

export function createRuntimeSnapshot(): RuntimeSnapshot {
  if (process.platform !== 'darwin' || process.arch !== 'arm64') {
    throw new Error('DOSAI requires the MACOS_ARM64_V1 platform profile');
  }

  const versions = Object.freeze({
    chromium: process.versions.chrome,
    electron: process.versions.electron,
    node: process.versions.node,
    v8: process.versions.v8,
  });

  return Object.freeze({
    application: 'DOSAI',
    architecture: process.arch,
    platform: process.platform,
    platformProfile: 'MACOS_ARM64_V1',
    versions,
  });
}
