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
  'native-helpers/execution-service/WatchdogLaunchAgentStatusCandidate.swift',
);
const source = await readFile(sourcePath, 'utf8');
const v29 = JSON.parse(
  await readFile(resolve(root, 'docs/architecture/process-ownership-v29.json'), 'utf8'),
);
const service = v29.native_helpers.find(({ id }) => id === 'execution-service');

test('status candidate fixes one plist and four bounded observations', () => {
  assert.equal(v29.status, 'ACCEPTED');
  assert.equal(source.match(/^import .+$/gm)?.length, 1);
  assert.match(source, /^import ServiceManagement$/m);
  assert.equal(
    (source.match(/com\.socialeap\.dosai\.execution-service-fixture\.plist/g) ?? []).length,
    1,
  );
  assert.match(
    source,
    /static func observe\(\) -> WatchdogLaunchAgentStatusObservation/,
  );
  assert.equal((source.match(/SMAppService\.agent\(plistName: plistName\)\.status/g) ?? []).length, 1);
  assert.deepEqual(
    [...source.matchAll(/case \w+ = "([A-Z_]+)"/g)].map((match) => match[1]),
    service.launch_agent_status_allowed_observations,
  );
  for (const [platform, observation] of [
    ['notRegistered', 'notRegistered'],
    ['enabled', 'enabled'],
    ['requiresApproval', 'requiresApproval'],
    ['notFound', 'notFound'],
  ]) {
    assert.match(source, new RegExp(`case \\.${platform}:\\s+return \\.${observation}`));
  }
  assert.match(source, /@unknown default:\s+return \.notFound/);
});

test('status candidate exposes no lifecycle mutation or adjacent authority', () => {
  assert.doesNotMatch(
    source,
    /\.register\s*\(|\.unregister\s*\(|openSystemSettingsLoginItems|statusForLegacyPlist/,
  );
  assert.doesNotMatch(source, /import (?:Foundation|XPC|Virtualization|Network|Security)/);
  assert.doesNotMatch(source, /\b(?:launchctl|SMJob|SMLoginItem|VZVirtualMachine)\b/);
  assert.doesNotMatch(source, /\bProcess\s*\(|posix_spawn|execve|system\s*\(/);
  assert.doesNotMatch(source, /FileManager|FileHandle|Data\(contentsOf:|write\(to:/);
  assert.doesNotMatch(source, /URLSession|CFNetwork|NWConnection|socket\s*\(/);
  assert.doesNotMatch(source, /@main|CommandLine|standardInput|standardOutput|print\s*\(/);
  assert.doesNotMatch(source, /func observe\([^)]/);

  for (const field of [
    'launch_agent_status_application_reachable',
    'launch_agent_status_executable_output_authority',
    'launch_agent_status_packaging_authority',
    'launch_agent_status_invocation_authority',
    'launch_agent_status_registration_authority',
    'launch_agent_status_unregistration_authority',
    'launch_agent_status_open_system_settings_authority',
    'launch_agent_status_service_launch_authority',
    'launch_agent_status_application_connection_authority',
    'registration_authority',
    'production_registration_authority',
    'service_management_authority',
    'process_launch_authority',
    'filesystem_authority',
    'network_authority',
    'reconciliation_authority',
    'journal_authority',
    'vm_creation_authority',
    'vm_start_authority',
  ]) {
    assert.equal(service[field], false, field);
  }
});

test('status candidate typechecks for arm64 macOS 15 without executable output', {
  timeout: 120_000,
}, async (context) => {
  const directory = await mkdtemp(join(tmpdir(), 'dosai-watchdog-status-'));
  context.after(async () => rm(directory, { force: true, recursive: true }));
  const moduleCachePath = join(directory, 'module-cache');
  const forbiddenExecutable = join(directory, 'watchdog-status');

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
