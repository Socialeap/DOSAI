import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '../..');
const v17Path = resolve(root, 'docs/architecture/process-ownership-v17.json');
const v18Path = resolve(root, 'docs/architecture/process-ownership-v18.json');
const v17Bytes = await readFile(v17Path);
const v17 = JSON.parse(v17Bytes);
const v18 = JSON.parse(await readFile(v18Path, 'utf8'));
const v26 = JSON.parse(
  await readFile(resolve(root, 'docs/architecture/process-ownership-v26.json'), 'utf8'),
);

const hashFile = async (path) =>
  createHash('sha256').update(await readFile(resolve(root, path))).digest('hex');

test('accepted process ownership v18 is hash-bound to immutable accepted v17', () => {
  const digest = createHash('sha256').update(v17Bytes).digest('hex');
  assert.equal(digest, 'd7aaaf6a99de8643adf74c2516941ca9126a6f77083a00f436f82b70689a8603');
  assert.equal(v17.status, 'ACCEPTED');
  assert.equal(v18.schema_version, 18);
  assert.equal(v18.status, 'ACCEPTED');
  assert.deepEqual(v18.supersedes, {
    path: 'docs/architecture/process-ownership-v17.json',
    sha256: digest,
  });
  assert.deepEqual(v18.accepted_adrs, v17.accepted_adrs);
});

test('v18 changes only named-listener implementation evidence and invariants', () => {
  assert.deepEqual(v18.source_boundaries, v17.source_boundaries);
  assert.deepEqual(
    v18.native_helpers.filter(({ id }) => id !== 'execution-service'),
    v17.native_helpers.filter(({ id }) => id !== 'execution-service'),
  );
  const before = v17.native_helpers.find(({ id }) => id === 'execution-service');
  const after = v18.native_helpers.find(({ id }) => id === 'execution-service');
  const evidenceFields = new Set([
    'named_listener_source_authority',
    'named_listener_source_typechecked',
    'named_listener_typecheck_target',
    'named_listener_source_imports',
    'named_listener_generic_configuration_observed',
    'named_listener_activation_api_observed',
    'named_listener_event_handler_api_observed',
    'named_listener_message_api_observed',
    'named_listener_privileged_flag_observed',
    'named_listener_executable_output_observed',
    'named_listener_implemented_files',
  ]);
  const withoutEvidence = (value) => Object.fromEntries(
    Object.entries(value).filter(([key]) => !evidenceFields.has(key)),
  );
  assert.deepEqual(withoutEvidence(after), withoutEvidence(before));
});

test('v18 binds exact compile-only candidate postimages and observations', async () => {
  const service = v18.native_helpers.find(({ id }) => id === 'execution-service');
  assert.equal(
    service.named_listener_source_authority,
    'IMPLEMENTED_COMPILE_ONLY_FIXED_TEST_CANDIDATE',
  );
  assert.equal(service.named_listener_source_typechecked, true);
  assert.equal(service.named_listener_typecheck_target, 'arm64-apple-macos15.0');
  assert.deepEqual(service.named_listener_source_imports, ['XPC']);
  assert.deepEqual(service.named_listener_implemented_files, [
    {
      path: 'native-helpers/execution-service/WatchdogNamedListenerCandidate.swift',
      sha256: '4a26ab98b20ed71e8ea19b1660afcd5d55f20eb636f750d6efb53282d25ca8ce',
    },
    {
      path: 'tests/security/p3-watchdog-named-listener-candidate.test.mjs',
      sha256: 'beb7f1983c3c4ecd340091a394354e5a0bb7474e1f10c1fb1a19b1379b5544e3',
    },
  ]);
  for (const file of service.named_listener_implemented_files) {
    assert.equal(await hashFile(file.path), file.sha256, file.path);
  }
});

test('v18 records no generic, active, privileged, messaging, or executable surface', async () => {
  const service = v18.native_helpers.find(({ id }) => id === 'execution-service');
  for (const field of [
    'named_listener_generic_configuration_observed',
    'named_listener_activation_api_observed',
    'named_listener_event_handler_api_observed',
    'named_listener_message_api_observed',
    'named_listener_privileged_flag_observed',
    'named_listener_executable_output_observed',
    'named_listener_source_compiled_to_executable',
    'named_listener_source_packaged',
    'named_listener_source_signed',
    'named_listener_source_executed',
    'named_listener_connection_activated',
    'named_listener_registration_observed',
  ]) {
    assert.equal(service[field], false, field);
  }
  const source = await readFile(
    resolve(root, 'native-helpers/execution-service/WatchdogNamedListenerCandidate.swift'),
    'utf8',
  );
  assert.doesNotMatch(
    source,
    /xpc_connection_(?:activate|resume|set_event_handler|send_message|create_from_endpoint)/,
  );
  assert.doesNotMatch(source, /XPC_CONNECTION_MACH_SERVICE_PRIVILEGED|ServiceManagement|SMAppService/);
});

test('v18 preserves every registration, launch, and effect denial', async () => {
  const service = v18.native_helpers.find(({ id }) => id === 'execution-service');
  for (const field of [
    'application_reachable',
    'registration_authority',
    'production_registration_authority',
    'service_management_authority',
    'launch_agent_plist_authority',
    'launch_daemon_plist_authority',
    'mach_service_listener_authority',
    'named_listener_activation_authority',
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
});
