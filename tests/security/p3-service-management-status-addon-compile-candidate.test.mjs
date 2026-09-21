import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const root = resolve(import.meta.dirname, '../..');
const sourcePath = resolve(
  root,
  'native-helpers/service-management-status-addon/service-management-status-addon.mm',
);
const source = await readFile(sourcePath, 'utf8');
const testSource = await readFile(import.meta.filename, 'utf8');
const v33 = JSON.parse(
  await readFile(resolve(root, 'docs/architecture/process-ownership-v33.json'), 'utf8'),
);
const addon = v33.native_helpers.find(({ id }) => id === 'service-management-status-addon');

async function resolveCanonicalHeaderRoot(executablePath, runtimeVersion) {
  if (runtimeVersion !== 'v24.18.0') {
    throw new Error('DOSAI_STATUS_ADDON_NODE_VERSION_0001');
  }
  let executable;
  try {
    executable = await realpath(executablePath);
  } catch {
    throw new Error('DOSAI_STATUS_ADDON_CANONICAL_NODE_LAYOUT_0001');
  }
  if (basename(executable) !== 'node' || basename(dirname(executable)) !== 'bin') {
    throw new Error('DOSAI_STATUS_ADDON_CANONICAL_NODE_LAYOUT_0001');
  }
  const headerRoot = join(dirname(dirname(executable)), 'include/node');
  try {
    for (const header of addon.node_api_header_files) {
      const digest = createHash('sha256')
        .update(await readFile(join(headerRoot, header.name)))
        .digest('hex');
      if (digest !== header.sha256) {
        throw new Error('header mismatch');
      }
    }
  } catch {
    throw new Error('DOSAI_STATUS_ADDON_CANONICAL_NODE_LAYOUT_0001');
  }
  return headerRoot;
}

test('status addon explicitly selects stable Node-API v8 and no adjacent Node ABI', () => {
  assert.equal(v33.status, 'ACCEPTED');
  assert.match(source, /#define NAPI_VERSION 8\n#include <node_api\.h>/);
  assert.equal((source.match(/#define NAPI_VERSION/g) ?? []).length, 1);
  assert.equal((source.match(/#include <node_api\.h>/g) ?? []).length, 1);
  assert.doesNotMatch(source, /NAPI_EXPERIMENTAL|node_addon_api/);
  assert.deepEqual(
    [...source.matchAll(/^#include\s+[<"]([^>"]+)[>"]/gm)].map((match) => match[1]),
    ['node_api.h'],
  );
});

test('canonical header admission rejects wrong versions and shim-like missing layouts', async () => {
  await assert.rejects(
    resolveCanonicalHeaderRoot(process.execPath, 'v24.17.0'),
    /DOSAI_STATUS_ADDON_NODE_VERSION_0001/,
  );

  const directory = await mkdtemp(join(tmpdir(), 'dosai-node-shim-layout-'));
  const shim = join(directory, 'bin/node');
  try {
    await mkdir(dirname(shim));
    await writeFile(shim, 'inert shim fixture', { encoding: 'utf8', mode: 0o700 });
    await assert.rejects(
      resolveCanonicalHeaderRoot(shim, 'v24.18.0'),
      /DOSAI_STATUS_ADDON_CANONICAL_NODE_LAYOUT_0001/,
    );
  } finally {
    await rm(directory, { force: true, recursive: true });
  }

  assert.equal(
    await resolveCanonicalHeaderRoot(process.execPath, process.version),
    join(dirname(dirname(await realpath(process.execPath))), 'include/node'),
  );
});

test('compile proof can spawn only fixed compiler and inspection tools', () => {
  const invokedTools = [...testSource.matchAll(/execFileAsync\(\s*'([^']+)'/g)]
    .map((match) => match[1]);
  assert.deepEqual(invokedTools, [
    '/usr/bin/xcrun',
    '/usr/bin/lipo',
    '/usr/bin/xcrun',
    '/usr/bin/otool',
    '/usr/bin/otool',
    '/usr/bin/nm',
  ]);
  assert.doesNotMatch(testSource, /execFileAsync\(\s*(?:bundlePath|sourcePath|executablePath)/);
  assert.doesNotMatch(testSource, /process\.dlopen|require\s*\(|import\s*\(|from ['"]electron['"]/);
  assert.equal(invokedTools.includes('/usr/bin/codesign'), false);
});

test('arm64 macOS 15 addon compiles unsigned, is inspected, and is removed without loading', {
  timeout: 120_000,
}, async () => {
  const headerRoot = await resolveCanonicalHeaderRoot(process.execPath, process.version);
  const directory = await mkdtemp(join(tmpdir(), 'dosai-status-addon-compile-'));
  const moduleCachePath = join(directory, 'module-cache');
  const bundlePath = join(directory, 'service-management-status-addon.node');
  let architectures;
  let build;
  let libraries;
  let loadCommands;
  let symbols;

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
        bundlePath,
      ],
      {
        encoding: 'utf8',
        env: {
          CLANG_MODULE_CACHE_PATH: moduleCachePath,
          HOME: directory,
          LANG: 'C',
          LC_ALL: 'C',
          MACOSX_DEPLOYMENT_TARGET: '15.0',
          PATH: '/usr/bin:/bin',
          SDKROOT: '',
          TMPDIR: directory,
          ZERO_AR_DATE: '1',
        },
        maxBuffer: 1024 * 1024,
        timeout: 60_000,
      },
    );

    assert.ok((await stat(bundlePath)).isFile());
    [architectures, build, libraries, loadCommands, symbols] = await Promise.all([
      execFileAsync('/usr/bin/lipo', ['-archs', bundlePath], { encoding: 'utf8' }),
      execFileAsync('/usr/bin/xcrun', ['vtool', '-show-build', bundlePath], {
        encoding: 'utf8',
      }),
      execFileAsync('/usr/bin/otool', ['-L', bundlePath], { encoding: 'utf8' }),
      execFileAsync('/usr/bin/otool', ['-l', bundlePath], { encoding: 'utf8' }),
      execFileAsync('/usr/bin/nm', ['-g', bundlePath], { encoding: 'utf8' }),
    ]);
  } finally {
    await rm(directory, { force: true, recursive: true });
  }

  assert.equal(architectures.stdout.trim(), 'arm64');
  assert.match(build.stdout, /minos 15\.0/);
  assert.match(libraries.stdout, /ServiceManagement\.framework/);
  assert.doesNotMatch(
    libraries.stdout,
    /Virtualization\.framework|Security\.framework|Network\.framework/,
  );
  assert.doesNotMatch(loadCommands.stdout, /LC_CODE_SIGNATURE/);
  assert.match(symbols.stdout, /node_api_module_get_api_version_v1/);
  assert.match(symbols.stdout, /napi_register_module_v1/);
  for (const symbol of [
    '_napi_create_function',
    '_napi_create_string_utf8',
    '_napi_get_cb_info',
    '_napi_set_named_property',
  ]) {
    assert.match(symbols.stdout, new RegExp(`${symbol}\\b`));
  }
  assert.doesNotMatch(symbols.stdout, /\bnode::|\bv8::|\buv_|\bSSL_|\bCRYPTO_/);
  await assert.rejects(access(directory));
});
