import { execFile } from 'node:child_process';
import { chmod, mkdir, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const root = resolve(import.meta.dirname, '..');

export const virtualizationConfigurationProbeName = 'dosai-virtualization-configuration-probe';
export const virtualizationConfigurationProbeSource = resolve(
  root,
  'tests/fixtures/p3-virtualization-probe/main.swift',
);
export const virtualizationConfigurationProbeEntitlements = resolve(
  root,
  'tests/fixtures/p3-virtualization-probe/entitlements.plist',
);

function buildEnvironment(moduleCachePath, outputDirectory) {
  return {
    CLANG_MODULE_CACHE_PATH: moduleCachePath,
    HOME: outputDirectory,
    LANG: 'C',
    LC_ALL: 'C',
    MACOSX_DEPLOYMENT_TARGET: '15.0',
    PATH: '/usr/bin:/bin',
    SDKROOT: '',
    SWIFT_MODULECACHE_PATH: moduleCachePath,
    TMPDIR: '/tmp',
    ZERO_AR_DATE: '1',
  };
}

export async function buildVirtualizationConfigurationProbe(outputPath) {
  const absoluteOutput = resolve(outputPath);
  const outputDirectory = dirname(absoluteOutput);
  const moduleCachePath = resolve(outputDirectory, '.swift-module-cache');
  await mkdir(outputDirectory, { recursive: true });
  await rm(absoluteOutput, { force: true });
  await rm(moduleCachePath, { force: true, recursive: true });

  try {
    await execFileAsync(
      '/usr/bin/xcrun',
      [
        '--sdk',
        'macosx',
        'swiftc',
        virtualizationConfigurationProbeSource,
        '-o',
        absoluteOutput,
        '-target',
        'arm64-apple-macos15.0',
        '-parse-as-library',
        '-O',
        '-whole-module-optimization',
        '-module-cache-path',
        moduleCachePath,
        '-framework',
        'Virtualization',
      ],
      {
        encoding: 'utf8',
        env: buildEnvironment(moduleCachePath, outputDirectory),
        maxBuffer: 1024 * 1024,
        timeout: 60_000,
      },
    );
    await execFileAsync(
      '/usr/bin/codesign',
      [
        '--force',
        '--sign',
        '-',
        '--entitlements',
        virtualizationConfigurationProbeEntitlements,
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

export async function invokeVirtualizationConfigurationProbe(executablePath, operation) {
  const { stdout } = await execFileAsync(resolve(executablePath), [operation], {
    encoding: 'utf8',
    env: { LANG: 'C', LC_ALL: 'C', PATH: '/usr/bin:/bin' },
    maxBuffer: 64 * 1024,
    timeout: 5_000,
  });
  return JSON.parse(stdout);
}

if (import.meta.main) {
  const output = resolve(root, 'build/test-fixtures', virtualizationConfigurationProbeName);
  await buildVirtualizationConfigurationProbe(output);
  const description = await invokeVirtualizationConfigurationProbe(output, 'describe');
  const profile = await invokeVirtualizationConfigurationProbe(output, 'inspect-fixed-profile');
  console.log(JSON.stringify({ description, executable: output, profile }, null, 2));
}
