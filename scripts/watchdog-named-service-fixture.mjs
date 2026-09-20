import { execFile } from 'node:child_process';
import { chmod, mkdir, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const root = resolve(import.meta.dirname, '..');
const signingIdentitySelector = 'UMXN25Z493';

export const watchdogNamedServiceFixtureName =
  'com.socialeap.dosai.execution-service-fixture';
export const watchdogNamedServiceFixtureIdentifier =
  'com.socialeap.dosai.execution-service-fixture';
export const watchdogNamedServiceFixtureSources = Object.freeze([
  resolve(root, 'native-helpers/execution-service/WatchdogControlCore.swift'),
  resolve(root, 'native-helpers/execution-service/WatchdogXPCTransport.swift'),
  resolve(root, 'native-helpers/execution-service/WatchdogNamedListenerCandidate.swift'),
  resolve(root, 'native-helpers/execution-service/WatchdogNamedListenerTransportCandidate.swift'),
  resolve(root, 'native-helpers/execution-service/WatchdogNamedServiceFixtureMain.swift'),
]);

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

export async function buildWatchdogNamedServiceFixture(outputPath) {
  const absoluteOutput = resolve(outputPath);
  const outputDirectory = dirname(absoluteOutput);
  const moduleCachePath = resolve(outputDirectory, '.swift-named-service-module-cache');
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
        ...watchdogNamedServiceFixtureSources,
        '-o',
        absoluteOutput,
        '-target',
        'arm64-apple-macos15.0',
        '-parse-as-library',
        '-O',
        '-whole-module-optimization',
        '-swift-version',
        '5',
        '-module-cache-path',
        moduleCachePath,
        '-Xlinker',
        '-no_adhoc_codesign',
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
        signingIdentitySelector,
        '--identifier',
        watchdogNamedServiceFixtureIdentifier,
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
