import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '../..');
const v16Path = resolve(root, 'docs/architecture/process-ownership-v16.json');
const v17Path = resolve(root, 'docs/architecture/process-ownership-v17.json');
const v16Bytes = await readFile(v16Path);
const v16 = JSON.parse(v16Bytes);
const v17 = JSON.parse(await readFile(v17Path, 'utf8'));
const v19 = JSON.parse(
  await readFile(resolve(root, 'docs/architecture/process-ownership-v19.json'), 'utf8'),
);
const v24 = JSON.parse(
  await readFile(resolve(root, 'docs/architecture/process-ownership-v24.json'), 'utf8'),
);
const v26 = JSON.parse(
  await readFile(resolve(root, 'docs/architecture/process-ownership-v26.json'), 'utf8'),
);
const v28 = JSON.parse(
  await readFile(resolve(root, 'docs/architecture/process-ownership-v28.json'), 'utf8'),
);
const v36 = JSON.parse(
  await readFile(resolve(root, 'docs/architecture/process-ownership-v36.json'), 'utf8'),
);
const v37 = JSON.parse(
  await readFile(resolve(root, 'docs/architecture/process-ownership-v37.json'), 'utf8'),
);

const hashFile = async (path) =>
  createHash('sha256').update(await readFile(resolve(root, path))).digest('hex');

test('accepted process ownership v17 is hash-bound to immutable accepted v16', () => {
  const digest = createHash('sha256').update(v16Bytes).digest('hex');
  assert.equal(digest, '0cac461340fbce6c37c11ce16d9accee9dc50af8de597bf50d28148cde0e87d0');
  assert.equal(v16.status, 'ACCEPTED');
  assert.equal(v17.schema_version, 17);
  assert.equal(v17.status, 'ACCEPTED');
  assert.deepEqual(v17.supersedes, {
    path: 'docs/architecture/process-ownership-v16.json',
    sha256: digest,
  });
  assert.deepEqual(v17.accepted_adrs, v16.accepted_adrs);
});

test('v17 changes only execution-service named-listener proposal fields and invariants', () => {
  assert.deepEqual(v17.source_boundaries, v16.source_boundaries);
  assert.deepEqual(
    v17.native_helpers.filter(({ id }) => id !== 'execution-service'),
    v16.native_helpers.filter(({ id }) => id !== 'execution-service'),
  );

  const before = v16.native_helpers.find(({ id }) => id === 'execution-service');
  const after = v17.native_helpers.find(({ id }) => id === 'execution-service');
  const namedFields = new Set([
    'named_listener_source_authority',
    'named_listener_source_application_reachable',
    'named_listener_source_typechecked',
    'named_listener_source_compiled_to_executable',
    'named_listener_source_packaged',
    'named_listener_source_signed',
    'named_listener_source_executed',
    'named_listener_connection_activated',
    'named_listener_registration_observed',
    'named_listener_future_executable_identifier',
    'named_listener_mach_service_identifier',
    'named_listener_expected_client_identifier',
    'named_listener_expected_team_identifier',
    'named_listener_allowed_creation_api',
    'named_listener_allowed_flag',
    'named_listener_privileged_flag_authority',
    'named_listener_activation_authority',
    'named_listener_proposed_files',
    'named_listener_immutable_inputs',
  ]);
  const withoutNamedFields = (value) => Object.fromEntries(
    Object.entries(value).filter(([key]) => !namedFields.has(key)),
  );
  assert.deepEqual(withoutNamedFields(after), withoutNamedFields(before));
});

test('v17 fixes one compile-only named-listener identity boundary', () => {
  const service = v17.native_helpers.find(({ id }) => id === 'execution-service');
  assert.equal(
    service.named_listener_source_authority,
    'PROPOSED_COMPILE_ONLY_FIXED_TEST_CANDIDATE',
  );
  assert.equal(
    service.named_listener_future_executable_identifier,
    'com.socialeap.dosai.execution-service-fixture',
  );
  assert.equal(
    service.named_listener_mach_service_identifier,
    'com.socialeap.dosai.execution-service-fixture.watchdog',
  );
  assert.equal(service.named_listener_expected_client_identifier, 'com.socialeap.dosai');
  assert.equal(service.named_listener_expected_team_identifier, '3RD3TADLRY');
  assert.equal(service.named_listener_allowed_creation_api, 'xpc_connection_create_mach_service');
  assert.equal(service.named_listener_allowed_flag, 'XPC_CONNECTION_MACH_SERVICE_LISTENER');
  assert.deepEqual(service.named_listener_proposed_files, [
    'native-helpers/execution-service/WatchdogNamedListenerCandidate.swift',
    'tests/security/p3-watchdog-named-listener-candidate.test.mjs',
  ]);
});

test('v17 hash-locks accepted inputs and the v19 transport preimage', async () => {
  const service = v17.native_helpers.find(({ id }) => id === 'execution-service');
  const successor = v19.native_helpers.find(({ id }) => id === 'execution-service');
  const packageSuccessor = v24.native_helpers.find(({ id }) => id === 'execution-service');
  const v28Service = v28.native_helpers.find(({ id }) => id === 'execution-service');
  const successorFiles = new Map(
    [
      ...packageSuccessor.named_service_static_package_implemented_files,
      ...v28Service.launch_agent_static_package_implemented_files,
      ...v28Service.launch_agent_static_package_guard_remediations,
      ...v36.native_helpers.find(({ id }) => id === 'service-management-status-addon')
        .static_package_implemented_files,
      ...v36.native_helpers.find(({ id }) => id === 'service-management-status-addon')
        .static_package_guard_remediations,
      ...v37.native_helpers.find(({ id }) => id === 'service-management-status-addon')
        .physical_proof_implemented_files,
    ]
      .map((file) => [file.path, file.sha256]),
  );
  assert.equal(v19.status, 'ACCEPTED');
  for (const file of service.named_listener_immutable_inputs) {
    const digest = await hashFile(file.path);
    if (file.path === successor.named_listener_transport_refactor_baseline.path) {
      assert.deepEqual(successor.named_listener_transport_refactor_baseline, file);
      assert.notEqual(digest, file.sha256, file.path);
    } else if (successorFiles.has(file.path)) {
      assert.notEqual(digest, file.sha256, file.path);
      assert.equal(digest, successorFiles.get(file.path), file.path);
    } else {
      assert.equal(digest, file.sha256, file.path);
    }
  }
});

test('v17 permits only the exact source and test while every listener effect remains absent', async () => {
  const service = v17.native_helpers.find(({ id }) => id === 'execution-service');
  for (const field of [
    'named_listener_source_application_reachable',
    'named_listener_source_typechecked',
    'named_listener_source_compiled_to_executable',
    'named_listener_source_packaged',
    'named_listener_source_signed',
    'named_listener_source_executed',
    'named_listener_connection_activated',
    'named_listener_registration_observed',
    'named_listener_privileged_flag_authority',
    'named_listener_activation_authority',
    'application_reachable',
    'registration_authority',
    'production_registration_authority',
    'service_management_authority',
    'launch_agent_plist_authority',
    'launch_daemon_plist_authority',
    'mach_service_listener_authority',
    'process_launch_authority',
    'filesystem_authority',
    'network_authority',
    'vm_creation_authority',
    'vm_start_authority',
  ]) {
    assert.equal(service[field], false, field);
  }
  for (const path of service.named_listener_proposed_files) {
    await access(resolve(root, path));
  }
  const plistRecord = v26.native_helpers
    .find(({ id }) => id === 'execution-service')
    .launch_agent_plist_implemented_files[0];
  assert.equal(
    plistRecord.path,
    'native-helpers/execution-service/com.socialeap.dosai.execution-service-fixture.plist',
  );
  assert.equal(await hashFile(plistRecord.path), plistRecord.sha256);
  await assert.rejects(
    access(resolve(root, 'docs/architecture/schema-registry-v19.json')),
  );

  const packageSource = await readFile(resolve(root, 'scripts/package.mjs'), 'utf8');
  assert.doesNotMatch(
    packageSource,
    /xpc_connection_create_mach_service|XPC_CONNECTION_MACH_SERVICE_LISTENER|SMAppService|launchctl|\.register\s*\(|\.unregister\s*\(/,
  );
  assert.equal(
    v36.native_helpers.find(({ id }) => id === 'service-management-status-addon')
      .static_package_status_call_observed,
    false,
  );
  assert.equal(
    v28.native_helpers.find(({ id }) => id === 'execution-service')
      .launch_agent_static_package_registration_observed,
    false,
  );
});
