import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const root = resolve(import.meta.dirname, '../..');
const sourcePath = resolve(
  root,
  'src/main/execution/service-management-lifecycle-adapter.mm',
);
const source = await readFile(sourcePath, 'utf8');
const v33 = JSON.parse(
  await readFile(resolve(root, 'docs/architecture/process-ownership-v33.json'), 'utf8'),
);
const statusAddon = v33.native_helpers.find(
  ({ id }) => id === 'service-management-status-addon',
);

async function resolveCanonicalHeaderRoot(executablePath, runtimeVersion) {
  if (runtimeVersion !== 'v24.18.0') {
    throw new Error('DOSAI_LIFECYCLE_ADAPTER_NODE_VERSION_0001');
  }
  let executable;
  try {
    executable = await realpath(executablePath);
  } catch {
    throw new Error('DOSAI_LIFECYCLE_ADAPTER_CANONICAL_NODE_LAYOUT_0001');
  }
  if (basename(executable) !== 'node' || basename(dirname(executable)) !== 'bin') {
    throw new Error('DOSAI_LIFECYCLE_ADAPTER_CANONICAL_NODE_LAYOUT_0001');
  }
  const headerRoot = join(dirname(dirname(executable)), 'include/node');
  try {
    for (const header of statusAddon.node_api_header_files) {
      const digest = createHash('sha256')
        .update(await readFile(join(headerRoot, header.name)))
        .digest('hex');
      if (digest !== header.sha256) throw new Error('header mismatch');
    }
  } catch {
    throw new Error('DOSAI_LIFECYCLE_ADAPTER_CANONICAL_NODE_LAYOUT_0001');
  }
  return headerRoot;
}

test('native lifecycle adapter exposes only the exact zero-argument binding contract', () => {
  assert.match(source, /#define NAPI_VERSION 8\n#include <node_api\.h>/);
  assert.equal((source.match(/ExportFunction\(env, exports,/g) ?? []).length, 3);
  assert.deepEqual(
    [...source.matchAll(/ExportFunction\(env, exports, "([a-z]+)"/g)]
      .map((match) => match[1]),
    ['observe', 'register', 'unregister'],
  );
  assert.equal((source.match(/HasZeroArguments\(env, info\)/g) ?? []).length, 3);
  assert.match(
    source,
    /napi_get_cb_info\(env, info, &argument_count, arguments, nullptr, nullptr\) == napi_ok\s*&& argument_count == 0/,
  );
  assert.match(source, /return MakeObservation\(env, kNotFound\);/);
  assert.equal((source.match(/return MakeBoolean\(env, false\);/g) ?? []).length, 2);
});

test('native lifecycle adapter fixes identity, bounds mutation, and fails closed', () => {
  assert.equal(
    (source.match(/com\.socialeap\.dosai\.execution-service-fixture\.plist/g) ?? []).length,
    1,
  );
  assert.equal((source.match(/agentServiceWithPlistName/g) ?? []).length, 1);
  assert.equal((source.match(/\bregisterAndReturnError/g) ?? []).length, 1);
  assert.equal((source.match(/unregisterAndReturnError/g) ?? []).length, 1);
  for (const status of [
    'SMAppServiceStatusNotRegistered',
    'SMAppServiceStatusEnabled',
    'SMAppServiceStatusRequiresApproval',
    'SMAppServiceStatusNotFound',
  ]) assert.equal((source.match(new RegExp(`\\b${status}\\b`, 'g')) ?? []).length, 1, status);
  assert.match(source, /default:\s*return kNotFound;/);
  assert.equal((source.match(/@catch \(__unused NSException\* exception\)/g) ?? []).length, 3);
  assert.doesNotMatch(
    source,
    /\b(?:for|while|do)\s*\(|dispatch_|completionHandler|openSystemSettings|SMJobBless|launchctl|NSXPC|Virtualization|child_process|node:fs|node:net|node:http|node:https|\bfetch\s*\(/,
  );
  assert.doesNotMatch(source, /localizedDescription|error\.code|error\.domain|napi_throw/);
});

test('native lifecycle adapter is absent from application, build, and package entrypoints', async () => {
  const marker = 'service-management-lifecycle-adapter';
  for (const path of [
    'src/main/index.ts',
    'src/preload/index.ts',
    'src/renderer/App.tsx',
    'scripts/build.mjs',
    'scripts/package.mjs',
    'scripts/service-management-status-addon.mjs',
  ]) {
    assert.equal((await readFile(resolve(root, path), 'utf8')).includes(marker), false, path);
  }
});

test('arm64 macOS 15 lifecycle adapter passes syntax-only validation without output', {
  timeout: 60_000,
}, async () => {
  const headerRoot = await resolveCanonicalHeaderRoot(process.execPath, process.version);
  const directory = await mkdtemp(join(tmpdir(), 'dosai-lifecycle-adapter-syntax-'));
  try {
    const result = await execFileAsync(
      '/usr/bin/xcrun',
      [
        '--sdk',
        'macosx',
        'clang++',
        '-std=c++20',
        '-fobjc-arc',
        '-fsyntax-only',
        '-x',
        'objective-c++',
        '-target',
        'arm64-apple-macos15.0',
        '-I',
        headerRoot,
        sourcePath,
      ],
      {
        encoding: 'utf8',
        env: {
          CLANG_MODULE_CACHE_PATH: join(directory, 'module-cache'),
          HOME: directory,
          LANG: 'C',
          LC_ALL: 'C',
          MACOSX_DEPLOYMENT_TARGET: '15.0',
          PATH: '/usr/bin:/bin',
          SDKROOT: '',
          TMPDIR: directory,
        },
        maxBuffer: 1024 * 1024,
        timeout: 45_000,
      },
    );
    assert.equal(result.stdout, '');
    assert.equal(result.stderr, '');
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});
