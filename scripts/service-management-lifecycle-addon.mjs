import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmod, mkdir, readFile, realpath, rm, stat } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const root = resolve(import.meta.dirname, '..');
const signingIdentitySelector = 'UMXN25Z493';
const sourcePath = resolve(
  root,
  'src/main/execution/service-management-lifecycle-adapter.mm',
);
const nodeHeaders = Object.freeze([
  Object.freeze({
    name: 'node_api.h',
    sha256: '2d4560831e525b47b060ec8a0864ab73993df9e20215ce9f0fe7b24cd31af32a',
  }),
  Object.freeze({
    name: 'node_api_types.h',
    sha256: 'a25356630d3058f0a0c8937d9f297e9471e037fda58c2696d8a505c2bd99cb00',
  }),
  Object.freeze({
    name: 'js_native_api.h',
    sha256: '8808ef8899a1691411928ef5dd7dae0537aedc93d3a34e223b2d89692e79c788',
  }),
  Object.freeze({
    name: 'js_native_api_types.h',
    sha256: '4f19cb90d240765cc0961d92a1ee20f65fdc50db7de1ab0a5cb6bc227224e1a0',
  }),
]);

export const serviceManagementLifecycleAddonName =
  'dosai-service-management-lifecycle.node';
export const serviceManagementLifecycleAddonIdentifier =
  'com.socialeap.dosai.service-management-lifecycle-addon';

async function canonicalNodeHeaderRoot() {
  if (process.version !== 'v24.18.0') {
    throw new Error('DOSAI_LIFECYCLE_ADDON_NODE_VERSION_0001');
  }
  let executable;
  try {
    executable = await realpath(process.execPath);
  } catch {
    throw new Error('DOSAI_LIFECYCLE_ADDON_CANONICAL_NODE_LAYOUT_0001');
  }
  if (basename(executable) !== 'node' || basename(dirname(executable)) !== 'bin') {
    throw new Error('DOSAI_LIFECYCLE_ADDON_CANONICAL_NODE_LAYOUT_0001');
  }
  const headerRoot = join(dirname(dirname(executable)), 'include/node');
  try {
    for (const header of nodeHeaders) {
      const digest = createHash('sha256')
        .update(await readFile(join(headerRoot, header.name)))
        .digest('hex');
      if (digest !== header.sha256) throw new Error('header mismatch');
    }
  } catch {
    throw new Error('DOSAI_LIFECYCLE_ADDON_CANONICAL_NODE_LAYOUT_0001');
  }
  return headerRoot;
}

function buildEnvironment(moduleCachePath, outputDirectory) {
  return {
    CLANG_MODULE_CACHE_PATH: moduleCachePath,
    HOME: outputDirectory,
    LANG: 'C',
    LC_ALL: 'C',
    MACOSX_DEPLOYMENT_TARGET: '15.0',
    PATH: '/usr/bin:/bin',
    SDKROOT: '',
    TMPDIR: outputDirectory,
    ZERO_AR_DATE: '1',
  };
}

export async function buildServiceManagementLifecycleAddon(outputPath) {
  const absoluteOutput = resolve(outputPath);
  const outputDirectory = dirname(absoluteOutput);
  const moduleCachePath = resolve(outputDirectory, '.lifecycle-addon-module-cache');
  const headerRoot = await canonicalNodeHeaderRoot();
  await mkdir(outputDirectory, { recursive: true });
  await rm(absoluteOutput, { force: true });
  await rm(moduleCachePath, { force: true, recursive: true });

  try {
    await execFileAsync(
      '/usr/bin/xcrun',
      [
        '--sdk',
        'macosx',
        'clang++',
        '-std=c++20',
        '-fobjc-arc',
        '-fvisibility=hidden',
        '-x',
        'objective-c++',
        '-target',
        'arm64-apple-macos15.0',
        '-I',
        headerRoot,
        sourcePath,
        '-bundle',
        '-undefined',
        'dynamic_lookup',
        '-framework',
        'ServiceManagement',
        '-Wl,-no_adhoc_codesign',
        '-o',
        absoluteOutput,
      ],
      {
        encoding: 'utf8',
        env: buildEnvironment(moduleCachePath, outputDirectory),
        maxBuffer: 1024 * 1024,
        timeout: 60_000,
      },
    );
    if (!(await stat(absoluteOutput)).isFile()) {
      throw new Error('DOSAI_LIFECYCLE_ADDON_BUILD_0001');
    }
    await execFileAsync(
      '/usr/bin/codesign',
      [
        '--force',
        '--sign',
        signingIdentitySelector,
        '--identifier',
        serviceManagementLifecycleAddonIdentifier,
        absoluteOutput,
      ],
      {
        encoding: 'utf8',
        env: { LANG: 'C', LC_ALL: 'C', PATH: '/usr/bin:/bin' },
        maxBuffer: 64 * 1024,
        timeout: 10_000,
      },
    );
    await chmod(absoluteOutput, 0o755);
    return absoluteOutput;
  } finally {
    await rm(moduleCachePath, { force: true, recursive: true });
  }
}
