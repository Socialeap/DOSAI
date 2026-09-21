import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '../..');
const v11Path = resolve(root, 'docs/architecture/process-ownership-v11.json');
const v12Path = resolve(root, 'docs/architecture/process-ownership-v12.json');
const v11Bytes = await readFile(v11Path);
const v11 = JSON.parse(v11Bytes);
const v12 = JSON.parse(await readFile(v12Path, 'utf8'));
const v19 = JSON.parse(
  await readFile(resolve(root, 'docs/architecture/process-ownership-v19.json'), 'utf8'),
);
const v39 = JSON.parse(
  await readFile(resolve(root, 'docs/architecture/process-ownership-v39.json'), 'utf8'),
);

const hashFile = async (path) =>
  createHash('sha256').update(await readFile(resolve(root, path))).digest('hex');

test('accepted process ownership v12 is hash-bound to immutable accepted v11', () => {
  const digest = createHash('sha256').update(v11Bytes).digest('hex');
  assert.equal(digest, 'de7c8d2f0c25c908886035e75a6f116ba4003d29d16f07d44accd25d4c2add6f');
  assert.equal(v11.status, 'ACCEPTED');
  assert.equal(v12.schema_version, 12);
  assert.equal(v12.status, 'ACCEPTED');
  assert.deepEqual(v12.supersedes, {
    path: 'docs/architecture/process-ownership-v11.json',
    sha256: digest,
  });
  assert.deepEqual(v12.accepted_adrs, v11.accepted_adrs);
});

test('v12 changes only contracts, Main, execution-service, and invariants', () => {
  const changedSourceIds = new Set(['contracts', 'main']);
  assert.deepEqual(
    v12.source_boundaries.filter(({ id }) => !changedSourceIds.has(id)),
    v11.source_boundaries.filter(({ id }) => !changedSourceIds.has(id)),
  );
  assert.deepEqual(
    v12.native_helpers.filter(({ id }) => id !== 'execution-service'),
    v11.native_helpers.filter(({ id }) => id !== 'execution-service'),
  );

  for (const id of ['contracts', 'main']) {
    const before = v11.source_boundaries.find((boundary) => boundary.id === id);
    const after = v12.source_boundaries.find((boundary) => boundary.id === id);
    const { proposed_watchdog_implementation_files, ...unchanged } = after;
    assert.deepEqual(unchanged, before);
    assert.equal(proposed_watchdog_implementation_files.length, 1);
  }
});

test('v12 binds original implementation preimages and only its exact accepted successors', async () => {
  const contracts = v12.source_boundaries.find(({ id }) => id === 'contracts');
  const main = v12.source_boundaries.find(({ id }) => id === 'main');
  const service = v12.native_helpers.find(({ id }) => id === 'execution-service');
  const files = [
    ...contracts.proposed_watchdog_implementation_files,
    ...main.proposed_watchdog_implementation_files,
    ...service.accepted_implementation_files,
    ...service.proposed_implementation_files,
  ];

  assert.deepEqual(files, [
    {
      path: 'src/contracts/p3/watchdog-control.ts',
      sha256: '5a191b8f95fc6a41e4725644e1b2fe689a6318e39ced1b050a26733cc29b261c',
    },
    {
      path: 'src/main/execution/watchdog-control-client.ts',
      sha256: 'bcbc9f508398a8df67812401d82d3686d6fe4cbaf8fca70427755535f2943007',
    },
    {
      path: 'native-helpers/execution-service/WatchdogControlCore.swift',
      sha256: 'c1f1148225dc4b9dd7a4174f13243a12fe5148d62ea404d9289c01fc346b1e11',
    },
    {
      path: 'native-helpers/execution-service/main.swift',
      sha256: '8bc5e445b7bf2f4b23b81a7ada47146202abfcde797818e15ea95ab4293994cf',
    },
    {
      path: 'native-helpers/execution-service/WatchdogXPCTransport.swift',
      sha256: '0350b401ff50519cc97bae9cd0911f77cd6f163e65e243499fbfc6fe7617b7dd',
    },
    {
      path: 'native-helpers/execution-service/WatchdogXPCFixtureMain.swift',
      sha256: '5ee2812a17dd73811515b41658dd19c4b1b7d655147ab1aa8004d37ca62931a5',
    },
  ]);
  const successor = v19.native_helpers.find(({ id }) => id === 'execution-service');
  const clientSuccessor = v39.implemented_files.find(
    ({ path }) => path === 'src/main/execution/watchdog-control-client.ts',
  );
  assert.equal(v19.status, 'ACCEPTED');
  assert.equal(v39.status, 'ACCEPTED');
  assert.deepEqual(successor.named_listener_transport_refactor_baseline, files.at(-2));
  assert.deepEqual(clientSuccessor, {
    path: 'src/main/execution/watchdog-control-client.ts',
    sha256: '40c961fc8e8fccde77488b38b430fa237cd99c10a47f035684c8de36b0fc49aa',
  });
  assert.equal(
    successor.named_listener_transport_adapter_proposed_files.includes(files.at(-2).path),
    true,
  );
  for (const file of files) {
    const digest = await hashFile(file.path);
    if (file.path === successor.named_listener_transport_refactor_baseline.path) {
      assert.notEqual(digest, file.sha256, file.path);
    } else if (file.path === clientSuccessor.path) {
      assert.notEqual(digest, file.sha256, file.path);
      assert.equal(digest, clientSuccessor.sha256, file.path);
    } else {
      assert.equal(digest, file.sha256, file.path);
    }
  }

  assert.equal(main.may_hold_authority, false);
  assert.equal(main.watchdog_service_configuration_authority, false);
  assert.equal(main.watchdog_peer_requirement_authority, false);
  assert.equal(service.application_reachable, false);
  assert.equal(service.registration_authority, false);
  assert.equal(service.mach_service_listener_authority, false);
  for (const field of [
    'generic_payload_authority',
    'pid_targeting_authority',
    'ownership_release_authority',
    'reconciliation_authority',
    'journal_authority',
    'vm_creation_authority',
    'vm_start_authority',
    'process_launch_authority',
    'filesystem_authority',
    'network_authority',
  ]) {
    assert.equal(service[field], false, field);
  }
});

test('v12 records fail-closed authentication evidence without claiming success', () => {
  const service = v12.native_helpers.find(({ id }) => id === 'execution-service');
  assert.equal(service.runtime, 'SWIFT_INERT_ANONYMOUS_XPC_TRANSPORT_FIXTURE_AUTH_PENDING');
  assert.equal(service.implementation_state, 'ACTIVE_TEST_FIXTURE_AUTH_PENDING');
  assert.equal(service.valid_signing_identity_required, true);
  assert.equal(service.valid_signing_identity_reported_installed, true);
  assert.equal(service.valid_signing_identity_observation, 'INDEPENDENT_REVIEWER_REPORTED');
  assert.equal(service.reported_signing_team_id, 'UMXN25Z493');
  assert.equal(service.owner_authorized_signing_identity_available, true);
  assert.equal(service.authenticated_peer_observed, false);
  assert.equal(service.ad_hoc_signature_eligible, false);
  assert.equal(service.ad_hoc_peer_rejection_observed, true);
  assert.equal(service.keychain_mutation_authority, false);
  assert.equal(service.signing_identity_export_authority, false);
  assert.deepEqual(service.allowed_external_imports, ['Foundation', 'XPC']);
});

test('v12 adds no schema generation or service registration artifact', async () => {
  const registryV18 = await readFile(resolve(root, 'docs/architecture/schema-registry-v18.json'));
  assert.equal(
    createHash('sha256').update(registryV18).digest('hex'),
    'bb342e97ee5552283a1ac10a64d6a1fde37f959b780637e7bc33f421f7bbab6a',
  );
  for (const path of [
    'docs/architecture/schema-registry-v19.json',
    'native-helpers/execution-service/LaunchAgent.plist',
  ]) {
    await assert.rejects(access(resolve(root, path)));
  }
});
