import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { access, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const root = resolve(import.meta.dirname, '../..');
const serviceRoot = resolve(root, 'native-helpers/execution-service');
const corePath = resolve(serviceRoot, 'WatchdogControlCore.swift');
const transportPath = resolve(serviceRoot, 'WatchdogXPCTransport.swift');
const listenerPath = resolve(serviceRoot, 'WatchdogNamedListenerCandidate.swift');
const adapterPath = resolve(serviceRoot, 'WatchdogNamedListenerTransportCandidate.swift');
const [transportSource, adapterSource] = await Promise.all([
  readFile(transportPath, 'utf8'),
  readFile(adapterPath, 'utf8'),
]);
const v19 = JSON.parse(
  await readFile(resolve(root, 'docs/architecture/process-ownership-v19.json'), 'utf8'),
);
const service = v19.native_helpers.find(({ id }) => id === 'execution-service');

test('named transport refactor preserves one strict shared service event path', () => {
  assert.equal(v19.status, 'ACCEPTED');
  assert.equal((transportSource.match(/func routeWatchdogXPCServiceEvent/g) ?? []).length, 1);
  assert.equal((transportSource.match(/func decodeWatchdogXPCRequest/g) ?? []).length, 1);
  assert.equal((transportSource.match(/func makeStopResult/g) ?? []).length, 1);
  assert.match(transportSource, /watchdogXPCFrameLimit = 4_096/);
  assert.match(transportSource, /case \.disconnected:\s*disconnectObserved\.signal\(\)/);
  assert.match(
    transportSource,
    /routeWatchdogXPCServiceEvent\(message, from: peer, through: core\)/,
  );
  assert.doesNotMatch(adapterSource, /decodeWatchdogXPCRequest|makeStopResult|watchdogXPCRequestKeys/);
});

test('named transport adapter activates only the fixed listener and authenticated peers', () => {
  assert.match(adapterSource, /^import XPC$/m);
  assert.match(
    adapterSource,
    /static func makeActivatedListener\(\) throws -> xpc_connection_t/,
  );
  assert.match(adapterSource, /let core = InertWatchdogControlCore\(\)/);
  assert.match(
    adapterSource,
    /WatchdogNamedListenerCandidate\.makeInactiveListener\(\)/,
  );
  assert.equal((adapterSource.match(/xpc_connection_set_event_handler/g) ?? []).length, 2);
  assert.equal((adapterSource.match(/xpc_connection_activate/g) ?? []).length, 2);
  assert.match(adapterSource, /xpc_get_type\(event\) == XPC_TYPE_CONNECTION/);
  assert.match(
    adapterSource,
    /routeWatchdogXPCServiceEvent\(message, from: peer, through: core\)/,
  );
  assert.doesNotMatch(adapterSource, /func makeActivatedListener\([^)]/);
});

test('named transport adapter exposes no client, configuration, or adjacent authority', () => {
  assert.doesNotMatch(
    adapterSource,
    /xpc_connection_(?:create|create_from_endpoint|create_mach_service|send_message|set_peer_code_signing_requirement)/,
  );
  assert.doesNotMatch(adapterSource, /XPC_CONNECTION_MACH_SERVICE_PRIVILEGED/);
  assert.doesNotMatch(
    adapterSource,
    /import (?:ServiceManagement|Virtualization|Network|Security|Foundation)/,
  );
  assert.doesNotMatch(adapterSource, /\b(?:SMAppService|VZVirtualMachine|MachServices|launchctl)\b/);
  assert.doesNotMatch(adapterSource, /\bProcess\s*\(|posix_spawn|execve|system\s*\(/);
  assert.doesNotMatch(adapterSource, /FileManager|FileHandle|Data\(contentsOf:|write\(to:/);
  assert.doesNotMatch(adapterSource, /URLSession|CFNetwork|NWConnection|socket\s*\(/);
  assert.doesNotMatch(adapterSource, /pid|path|payload|entitlement/i);
  assert.doesNotMatch(adapterSource, /public\s|@main|dispatchMain|CommandLine/);

  for (const field of [
    'named_listener_transport_adapter_application_reachable',
    'named_listener_transport_adapter_generic_configuration_authority',
    'named_listener_transport_adapter_client_connection_authority',
    'named_listener_transport_adapter_executable_entry_point_authority',
    'named_listener_transport_adapter_executable_output_authority',
    'named_listener_transport_adapter_signing_authority',
    'named_listener_transport_adapter_packaging_authority',
    'named_listener_transport_adapter_plist_authority',
    'named_listener_transport_adapter_registration_authority',
    'named_listener_transport_adapter_launch_authority',
    'named_listener_transport_adapter_runtime_effect_observed',
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

test('named transport adapter typechecks without executable output', {
  timeout: 120_000,
}, async (context) => {
  const directory = await mkdtemp(join(tmpdir(), 'dosai-watchdog-named-transport-'));
  context.after(async () => rm(directory, { force: true, recursive: true }));
  const moduleCachePath = join(directory, 'module-cache');
  const forbiddenExecutable = join(directory, 'watchdog-named-transport');

  await execFileAsync(
    '/usr/bin/xcrun',
    [
      '--sdk',
      'macosx',
      'swiftc',
      corePath,
      transportPath,
      listenerPath,
      adapterPath,
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
