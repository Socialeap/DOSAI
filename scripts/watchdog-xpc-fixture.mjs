import { execFile } from 'node:child_process';
import { chmod, mkdir, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const root = resolve(import.meta.dirname, '..');

export const watchdogXPCFixtureName = 'dosai-watchdog-xpc-fixture';
export const watchdogXPCFixtureIdentifier = 'com.socialeap.dosai.watchdog-xpc-fixture';
export const watchdogXPCFixtureSources = Object.freeze([
  resolve(root, 'native-helpers/execution-service/WatchdogControlCore.swift'),
  resolve(root, 'native-helpers/execution-service/WatchdogXPCTransport.swift'),
  resolve(root, 'native-helpers/execution-service/WatchdogXPCFixtureMain.swift'),
]);

function admitBuildOptions(candidate) {
  if (candidate === null || typeof candidate !== 'object' || Array.isArray(candidate)) {
    throw new TypeError('DOSAI_WATCHDOG_XPC_BUILD_OPTIONS_0001');
  }
  const prototype = Object.getPrototypeOf(candidate);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError('DOSAI_WATCHDOG_XPC_BUILD_OPTIONS_0001');
  }
  const keys = Reflect.ownKeys(candidate);
  if (keys.some((key) => typeof key === 'symbol') || keys.some((key) => key !== 'signingIdentity')) {
    throw new TypeError('DOSAI_WATCHDOG_XPC_BUILD_OPTIONS_0001');
  }
  const descriptor = Object.getOwnPropertyDescriptor(candidate, 'signingIdentity');
  if (descriptor === undefined) return Object.freeze({ signingIdentity: '-' });
  if (!descriptor.enumerable || !('value' in descriptor) || typeof descriptor.value !== 'string') {
    throw new TypeError('DOSAI_WATCHDOG_XPC_BUILD_OPTIONS_0001');
  }
  if (descriptor.value.length === 0 || descriptor.value.length > 256) {
    throw new TypeError('DOSAI_WATCHDOG_XPC_SIGNING_IDENTITY_0001');
  }
  return Object.freeze({ signingIdentity: descriptor.value });
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
    SWIFT_MODULECACHE_PATH: moduleCachePath,
    TMPDIR: '/tmp',
    ZERO_AR_DATE: '1',
  };
}

export async function buildWatchdogXPCFixture(outputPath, options = {}) {
  const absoluteOutput = resolve(outputPath);
  const outputDirectory = dirname(absoluteOutput);
  const moduleCachePath = resolve(outputDirectory, '.swift-xpc-module-cache');
  const { signingIdentity } = admitBuildOptions(options);
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
        ...watchdogXPCFixtureSources,
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
        signingIdentity,
        '--identifier',
        watchdogXPCFixtureIdentifier,
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

export async function invokeWatchdogXPCFixture(executablePath, operation, argument) {
  const arguments_ = argument === undefined ? [operation] : [operation, argument];
  const { stdout } = await execFileAsync(resolve(executablePath), arguments_, {
    encoding: 'utf8',
    env: { LANG: 'C', LC_ALL: 'C', PATH: '/usr/bin:/bin' },
    maxBuffer: 64 * 1024,
    timeout: 5_000,
  });
  return JSON.parse(stdout);
}

if (import.meta.main) {
  const output = resolve(root, 'build/test-fixtures', watchdogXPCFixtureName);
  await buildWatchdogXPCFixture(output);
  const description = await invokeWatchdogXPCFixture(output, 'describe');
  const report = await invokeWatchdogXPCFixture(output, 'self-test');
  console.log(JSON.stringify({ description, executable: output, report }, null, 2));
}
