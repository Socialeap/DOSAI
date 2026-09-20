import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '../..');
const v6Path = join(root, 'docs/architecture/process-ownership-v6.json');
const v7Path = join(root, 'docs/architecture/process-ownership-v7.json');
const manifest = JSON.parse(await readFile(v7Path, 'utf8'));

test('accepted process ownership v7 is hash-bound to accepted v6', async () => {
  const v6Digest = createHash('sha256').update(await readFile(v6Path)).digest('hex');
  assert.equal(v6Digest, 'a02bf6e7b4af2244e878f7f066aa246928ec881dc2a8c3f0279fe6ea08b7ad62');
  assert.equal(manifest.schema_version, 7);
  assert.equal(manifest.status, 'ACCEPTED');
  assert.deepEqual(manifest.supersedes, {
    path: 'docs/architecture/process-ownership-v6.json',
    sha256: v6Digest,
  });
  assert.deepEqual(manifest.accepted_adrs, [
    'docs/decisions/0001-runtime-and-privilege-boundaries.md',
    'docs/decisions/0002-typed-operations-policy-and-grants.md',
    'docs/decisions/0003-execution-isolation-cancellation-and-watchdog.md',
    'docs/decisions/0004-audit-journal-keys-and-anchoring.md',
    'docs/decisions/0012-secure-enclave-checkpoints-and-rekor-v2-anchoring.md',
    'docs/decisions/0014-linux-microvm-isolation-backend.md',
  ]);
});

test('accepted execution-service reservation owns no runtime authority', () => {
  const service = manifest.native_helpers.find(({ id }) => id === 'execution-service');
  assert.deepEqual(manifest.native_helpers.map(({ id }) => id), [
    'policy-helper',
    'grant-proof-helper',
    'execution-service',
    'audit-helper',
    'secure-enclave-proof-helper',
  ]);
  assert.equal(manifest.native_helpers.some(({ id }) => id === 'effect-brokers'), false);
  assert.deepEqual(service, {
    id: 'execution-service',
    path: 'native-helpers/execution-service',
    trust_zone: 'Z5',
    runtime: 'NOT_IMPLEMENTED',
    component_owner: 'isolated-execution-service',
    owner_phase: 'P3',
    implementation_state: 'RESERVED',
    authority: 'NO_RUNTIME_AUTHORITY_UNTIL_SEPARATELY_ACCEPTED',
    application_reachable: false,
    vm_creation_authority: false,
    vm_start_authority: false,
    process_launch_authority: false,
    filesystem_authority: false,
    network_authority: false,
    allowed_first_party_imports: [],
    allowed_external_imports: [],
  });
});

test('later implementation remains limited by accepted ownership generations', async () => {
  const { readdir } = await import('node:fs/promises');
  const v9 = JSON.parse(
    await readFile(join(root, 'docs/architecture/process-ownership-v9.json'), 'utf8'),
  );
  const v17 = JSON.parse(
    await readFile(join(root, 'docs/architecture/process-ownership-v17.json'), 'utf8'),
  );
  const v19 = JSON.parse(
    await readFile(join(root, 'docs/architecture/process-ownership-v19.json'), 'utf8'),
  );
  const v21 = JSON.parse(
    await readFile(join(root, 'docs/architecture/process-ownership-v21.json'), 'utf8'),
  );
  const v25 = JSON.parse(
    await readFile(join(root, 'docs/architecture/process-ownership-v25.json'), 'utf8'),
  );
  const service = v9.native_helpers.find(({ id }) => id === 'execution-service');
  assert.equal(v9.status, 'ACCEPTED');
  assert.equal(v17.status, 'ACCEPTED');
  assert.equal(v19.status, 'ACCEPTED');
  assert.equal(v21.status, 'ACCEPTED');
  assert.equal(v25.status, 'ACCEPTED');
  assert.deepEqual(
    v17.native_helpers.find(({ id }) => id === 'execution-service').named_listener_proposed_files,
    [
      'native-helpers/execution-service/WatchdogNamedListenerCandidate.swift',
      'tests/security/p3-watchdog-named-listener-candidate.test.mjs',
    ],
  );
  assert.deepEqual(
    v21.native_helpers.find(({ id }) => id === 'execution-service')
      .named_service_executable_candidate_proposed_files,
    [
      'native-helpers/execution-service/WatchdogNamedServiceFixtureMain.swift',
      'tests/security/p3-watchdog-named-service-executable-candidate.test.mjs',
    ],
  );
  assert.deepEqual(
    v19.native_helpers.find(({ id }) => id === 'execution-service')
      .named_listener_transport_adapter_proposed_files,
    [
      'native-helpers/execution-service/WatchdogXPCTransport.swift',
      'native-helpers/execution-service/WatchdogNamedListenerTransportCandidate.swift',
      'tests/security/p3-watchdog-named-listener-transport-candidate.test.mjs',
    ],
  );
  assert.deepEqual(
    v25.native_helpers.find(({ id }) => id === 'execution-service')
      .launch_agent_plist_proposed_files,
    [
      'native-helpers/execution-service/com.socialeap.dosai.execution-service-fixture.plist',
      'tests/security/p3-watchdog-launch-agent-plist-candidate.test.mjs',
    ],
  );
  assert.equal(service.authority, 'TEST_ONLY_INERT_CAPSULE_REDUCE_ONLY_CONTROL');
  assert.equal(service.application_reachable, false);
  assert.equal(service.vm_creation_authority, false);
  assert.equal(service.process_launch_authority, false);
  assert.deepEqual(
    (await readdir(join(root, service.path))).sort(),
    [
      'WatchdogControlCore.swift',
      'WatchdogLaunchAgentStatusCandidate.swift',
      'WatchdogNamedListenerCandidate.swift',
      'WatchdogNamedListenerTransportCandidate.swift',
      'WatchdogNamedServiceFixtureMain.swift',
      'WatchdogXPCFixtureMain.swift',
      'WatchdogXPCTransport.swift',
      'com.socialeap.dosai.execution-service-fixture.plist',
      'main.swift',
    ],
  );
});
