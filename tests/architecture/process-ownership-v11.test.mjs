import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '../..');
const v10Path = resolve(root, 'docs/architecture/process-ownership-v10.json');
const v11Path = resolve(root, 'docs/architecture/process-ownership-v11.json');
const v10Bytes = await readFile(v10Path);
const v10 = JSON.parse(v10Bytes);
const v11 = JSON.parse(await readFile(v11Path, 'utf8'));

test('accepted process ownership v11 is hash-bound to immutable accepted v10', () => {
  const digest = createHash('sha256').update(v10Bytes).digest('hex');
  assert.equal(digest, 'fe29a2fa6e2d370d881abc79ae4f9cf176a603da572066f40c5809aecfc8cfd2');
  assert.equal(v10.status, 'ACCEPTED');
  assert.equal(v11.schema_version, 11);
  assert.equal(v11.status, 'ACCEPTED');
  assert.deepEqual(v11.supersedes, {
    path: 'docs/architecture/process-ownership-v10.json',
    sha256: digest,
  });
  assert.deepEqual(v11.accepted_adrs, v10.accepted_adrs);
});

test('v11 changes only the Main client, execution-service transport, and invariants', () => {
  assert.deepEqual(
    v11.source_boundaries.filter(({ id }) => id !== 'main'),
    v10.source_boundaries.filter(({ id }) => id !== 'main'),
  );
  assert.deepEqual(
    v11.native_helpers.filter(({ id }) => id !== 'execution-service'),
    v10.native_helpers.filter(({ id }) => id !== 'execution-service'),
  );

  const main = v11.source_boundaries.find(({ id }) => id === 'main');
  assert.equal(main.may_hold_authority, false);
  assert.equal(main.watchdog_client_contract, 'TYPED_UNCOMPOSED_INJECTED_XPC_TEST_FIXTURE_ONLY');
  assert.equal(main.watchdog_service_configuration_authority, false);
  assert.equal(main.watchdog_peer_requirement_authority, false);
  assert.deepEqual(main.allowed_external_imports, [
    'electron',
    'node:fs/promises',
    'node:path',
  ]);
});

test('v11 permits only a signed anonymous XPC fixture and rejects ad-hoc authentication', () => {
  const service = v11.native_helpers.find(({ id }) => id === 'execution-service');
  assert.equal(service.implementation_state, 'PROPOSED');
  assert.equal(service.application_reachable, false);
  assert.equal(service.registration_authority, false);
  assert.equal(service.production_registration_authority, false);
  assert.equal(service.xpc_listener_authority, 'ANONYMOUS_IN_PROCESS_TEST_FIXTURE_ONLY');
  assert.equal(service.mach_service_listener_authority, false);
  assert.equal(service.peer_requirement_api, 'xpc_connection_set_peer_code_signing_requirement');
  assert.equal(service.minimum_peer_requirement_os, '12.0');
  assert.equal(service.valid_signing_identity_required, true);
  assert.equal(service.ad_hoc_signature_eligible, false);
  assert.equal(service.keychain_mutation_authority, false);
  assert.equal(service.signing_identity_export_authority, false);
  assert.deepEqual(service.allowed_external_imports, ['Foundation', 'XPC']);
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

test('v11 preserves accepted core bytes and authorizes an exact implementation source set', async () => {
  const service = v11.native_helpers.find(({ id }) => id === 'execution-service');
  assert.deepEqual(service.accepted_implementation_files, [
    {
      path: 'native-helpers/execution-service/WatchdogControlCore.swift',
      sha256: 'c1f1148225dc4b9dd7a4174f13243a12fe5148d62ea404d9289c01fc346b1e11',
    },
    {
      path: 'native-helpers/execution-service/main.swift',
      sha256: '8bc5e445b7bf2f4b23b81a7ada47146202abfcde797818e15ea95ab4293994cf',
    },
  ]);
  for (const file of service.accepted_implementation_files) {
    const digest = createHash('sha256').update(await readFile(resolve(root, file.path))).digest('hex');
    assert.equal(digest, file.sha256, file.path);
  }

  assert.deepEqual(service.proposed_implementation_files, [
    'native-helpers/execution-service/WatchdogXPCTransport.swift',
    'native-helpers/execution-service/WatchdogXPCFixtureMain.swift',
    'src/contracts/p3/watchdog-control.ts',
    'src/main/execution/watchdog-control-client.ts',
  ]);
  for (const path of service.proposed_implementation_files) {
    await access(resolve(root, path));
  }
});

test('v11 adds no schema generation or registration artifact', async () => {
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
