import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { access, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const root = resolve(import.meta.dirname, '../..');
const sourcePath = resolve(
  root,
  'native-helpers/execution-service/WatchdogNamedListenerCandidate.swift',
);
const source = await readFile(sourcePath, 'utf8');
const v17 = JSON.parse(
  await readFile(resolve(root, 'docs/architecture/process-ownership-v17.json'), 'utf8'),
);
const service = v17.native_helpers.find(({ id }) => id === 'execution-service');

test('named-listener candidate fixes one inactive directional identity boundary', () => {
  assert.equal(v17.status, 'ACCEPTED');
  assert.match(source, /^import XPC$/m);
  assert.match(
    source,
    /futureExecutableIdentifier = "com\.socialeap\.dosai\.execution-service-fixture"/,
  );
  assert.match(
    source,
    /machServiceIdentifier = "com\.socialeap\.dosai\.execution-service-fixture\.watchdog"/,
  );
  assert.match(source, /expectedClientIdentifier = "com\.socialeap\.dosai"/);
  assert.match(source, /expectedTeamIdentifier = "3RD3TADLRY"/);
  assert.match(source, /certificate leaf\[subject\.OU\]/);
  assert.match(source, /identifier/);
  assert.match(source, /static func makeInactiveListener\(\) throws -> xpc_connection_t/);
  assert.equal(
    (source.match(/xpc_connection_create_mach_service/g) ?? []).length,
    1,
  );
  assert.match(source, /UInt64\(XPC_CONNECTION_MACH_SERVICE_LISTENER\)/);
  assert.match(source, /xpc_connection_set_peer_code_signing_requirement/);
  assert.doesNotMatch(source, /func makeInactiveListener\([^)]/);
});

test('named-listener candidate exposes no activation, messaging, or adjacent authority', () => {
  assert.doesNotMatch(
    source,
    /xpc_connection_(?:activate|resume|set_event_handler|send_message|create_from_endpoint)/,
  );
  assert.doesNotMatch(source, /XPC_CONNECTION_MACH_SERVICE_PRIVILEGED/);
  assert.doesNotMatch(source, /import (?:ServiceManagement|Virtualization|Network|Security|Foundation)/);
  assert.doesNotMatch(source, /\b(?:SMAppService|VZVirtualMachine|MachServices|launchctl)\b/);
  assert.doesNotMatch(source, /\bProcess\s*\(|posix_spawn|execve|system\s*\(/);
  assert.doesNotMatch(source, /FileManager|FileHandle|Data\(contentsOf:|write\(to:/);
  assert.doesNotMatch(source, /URLSession|CFNetwork|NWConnection|socket\s*\(/);
  assert.doesNotMatch(source, /pid|path|payload|entitlement/i);
  assert.doesNotMatch(source, /public\s|@main|CommandLine|standardInput|standardOutput/);

  for (const field of [
    'named_listener_source_application_reachable',
    'named_listener_source_compiled_to_executable',
    'named_listener_source_packaged',
    'named_listener_source_signed',
    'named_listener_source_executed',
    'named_listener_connection_activated',
    'named_listener_registration_observed',
    'named_listener_privileged_flag_authority',
    'named_listener_activation_authority',
    'registration_authority',
    'service_management_authority',
    'launch_agent_plist_authority',
    'mach_service_listener_authority',
    'process_launch_authority',
    'filesystem_authority',
    'network_authority',
    'vm_creation_authority',
    'vm_start_authority',
  ]) {
    assert.equal(service[field], false, field);
  }
});

test('named-listener candidate typechecks for arm64 macOS 15 without executable output', {
  timeout: 120_000,
}, async (context) => {
  const directory = await mkdtemp(join(tmpdir(), 'dosai-watchdog-named-listener-'));
  context.after(async () => rm(directory, { force: true, recursive: true }));
  const moduleCachePath = join(directory, 'module-cache');
  const forbiddenExecutable = join(directory, 'watchdog-named-listener');

  await execFileAsync(
    '/usr/bin/xcrun',
    [
      '--sdk',
      'macosx',
      'swiftc',
      sourcePath,
      '-typecheck',
      '-target',
      'arm64-apple-macos15.0',
      '-swift-version',
      '5',
      '-module-cache-path',
      moduleCachePath,
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
      },
      maxBuffer: 1024 * 1024,
      timeout: 60_000,
    },
  );

  await assert.rejects(access(forbiddenExecutable));
});
