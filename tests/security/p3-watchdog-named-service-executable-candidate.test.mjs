import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { access, mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const root = resolve(import.meta.dirname, '../..');
const serviceRoot = resolve(root, 'native-helpers/execution-service');
const sourcePaths = Object.freeze([
  resolve(serviceRoot, 'WatchdogControlCore.swift'),
  resolve(serviceRoot, 'WatchdogXPCTransport.swift'),
  resolve(serviceRoot, 'WatchdogNamedListenerCandidate.swift'),
  resolve(serviceRoot, 'WatchdogNamedListenerTransportCandidate.swift'),
  resolve(serviceRoot, 'WatchdogNamedServiceFixtureMain.swift'),
]);
const entryPointSource = await readFile(sourcePaths.at(-1), 'utf8');
const testSource = await readFile(import.meta.filename, 'utf8');
const v21 = JSON.parse(
  await readFile(resolve(root, 'docs/architecture/process-ownership-v21.json'), 'utf8'),
);
const service = v21.native_helpers.find(({ id }) => id === 'execution-service');

test('named-service entry point is fixed, input-free, and listener-only', () => {
  assert.equal(v21.status, 'ACCEPTED');
  assert.match(entryPointSource, /^import Dispatch$/m);
  assert.match(entryPointSource, /^@main$/m);
  assert.match(entryPointSource, /enum WatchdogNamedServiceFixtureMain/);
  assert.match(entryPointSource, /static func main\(\) throws/);
  assert.equal(
    (entryPointSource.match(
      /WatchdogNamedListenerTransportCandidate\.makeActivatedListener\(\)/g,
    ) ?? []).length,
    1,
  );
  assert.match(entryPointSource, /withExtendedLifetime\(listener\)/);
  assert.equal((entryPointSource.match(/dispatchMain\(\)/g) ?? []).length, 1);
  assert.doesNotMatch(entryPointSource, /CommandLine|arguments|standardInput|standardOutput/);
  assert.doesNotMatch(entryPointSource, /ProcessInfo|environment|getenv|UserDefaults/);
  assert.doesNotMatch(entryPointSource, /FileManager|FileHandle|Data\(contentsOf:|write\(to:/);
  assert.doesNotMatch(entryPointSource, /URLSession|CFNetwork|NWConnection|socket\s*\(/);
  assert.doesNotMatch(entryPointSource, /\bProcess\s*\(|posix_spawn|execve|system\s*\(/);
  assert.doesNotMatch(
    entryPointSource,
    /ServiceManagement|SMAppService|Virtualization|VZVirtualMachine|Security|codesign/,
  );
  assert.doesNotMatch(entryPointSource, /catch|print\s*\(|NSLog|os_log|fallback/i);
});

test('named-service link proof can spawn only fixed inspection tools', () => {
  const invokedTools = [...testSource.matchAll(/execFileAsync\(\s*'([^']+)'/g)]
    .map((match) => match[1]);
  assert.deepEqual(invokedTools, [
    '/usr/bin/xcrun',
    '/usr/bin/lipo',
    '/usr/bin/xcrun',
    '/usr/bin/otool',
    '/usr/bin/otool',
  ]);
  assert.doesNotMatch(testSource, /execFileAsync\(\s*(?:executable|outputPath|candidate)/);
  assert.equal(invokedTools.includes('/usr/bin/codesign'), false);
});

test('named-service executable authority remains temporary, unsigned, and never invoked', () => {
  assert.equal(
    service.named_service_executable_candidate_authority,
    'PROPOSED_TEMPORARY_UNSIGNED_BUILD_ONLY',
  );
  assert.equal(service.named_service_adhoc_signature_suppression_required, true);
  assert.equal(
    service.named_service_adhoc_signature_suppression_linker_flag,
    '-no_adhoc_codesign',
  );
  for (const field of [
    'named_service_explicit_signing_authority',
    'named_service_signing_identity_use_authority',
    'named_service_signature_output_authority',
    'named_service_executable_invocation_authority',
    'named_service_executable_packaging_authority',
    'named_service_executable_plist_authority',
    'named_service_executable_registration_authority',
    'named_service_executable_launch_authority',
    'named_service_application_connection_authority',
    'named_service_runtime_effect_observed',
    'registration_authority',
    'service_management_authority',
    'launch_agent_plist_authority',
    'process_launch_authority',
    'filesystem_authority',
    'network_authority',
    'vm_creation_authority',
    'vm_start_authority',
  ]) {
    assert.equal(service[field], false, field);
  }
});

test('arm64 macOS 15 candidate links unsigned, is inspected, and is removed', {
  timeout: 120_000,
}, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dosai-watchdog-named-service-'));
  const moduleCachePath = join(directory, 'module-cache');
  const executable = join(directory, 'dosai-execution-service-fixture');
  let architectures;
  let build;
  let libraries;
  let loadCommands;

  try {
    await execFileAsync(
      '/usr/bin/xcrun',
      [
        '--sdk',
        'macosx',
        'swiftc',
        ...sourcePaths,
        '-o',
        executable,
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
        env: {
          CLANG_MODULE_CACHE_PATH: moduleCachePath,
          HOME: directory,
          LANG: 'C',
          LC_ALL: 'C',
          MACOSX_DEPLOYMENT_TARGET: '15.0',
          PATH: '/usr/bin:/bin',
          SDKROOT: '',
          SWIFT_MODULECACHE_PATH: moduleCachePath,
          TMPDIR: directory,
          ZERO_AR_DATE: '1',
        },
        maxBuffer: 1024 * 1024,
        timeout: 60_000,
      },
    );

    const executableStats = await stat(executable);
    assert.ok(executableStats.isFile());
    assert.notEqual(executableStats.mode & 0o111, 0);

    [architectures, build, libraries, loadCommands] = await Promise.all([
      execFileAsync('/usr/bin/lipo', ['-archs', executable], { encoding: 'utf8' }),
      execFileAsync('/usr/bin/xcrun', ['vtool', '-show-build', executable], {
        encoding: 'utf8',
      }),
      execFileAsync('/usr/bin/otool', ['-L', executable], { encoding: 'utf8' }),
      execFileAsync('/usr/bin/otool', ['-l', executable], { encoding: 'utf8' }),
    ]);
  } finally {
    await rm(directory, { force: true, recursive: true });
  }

  assert.equal(architectures.stdout.trim(), 'arm64');
  assert.match(build.stdout, /minos 15\.0/);
  assert.match(libraries.stdout, /libswiftXPC/);
  assert.match(libraries.stdout, /libswiftDispatch/);
  assert.doesNotMatch(
    libraries.stdout,
    /Virtualization|ServiceManagement|Network\.framework|Security\.framework/,
  );
  assert.doesNotMatch(loadCommands.stdout, /LC_CODE_SIGNATURE/);
  await assert.rejects(access(directory));
});
