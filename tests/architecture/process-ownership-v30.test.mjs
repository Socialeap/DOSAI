import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '../..');
const v29Path = resolve(root, 'docs/architecture/process-ownership-v29.json');
const v29Bytes = await readFile(v29Path);
const v29 = JSON.parse(v29Bytes);
const v30 = JSON.parse(
  await readFile(resolve(root, 'docs/architecture/process-ownership-v30.json'), 'utf8'),
);
const v36 = JSON.parse(
  await readFile(resolve(root, 'docs/architecture/process-ownership-v36.json'), 'utf8'),
);
const v37 = JSON.parse(
  await readFile(resolve(root, 'docs/architecture/process-ownership-v37.json'), 'utf8'),
);

const hashFile = async (path) =>
  createHash('sha256').update(await readFile(resolve(root, path))).digest('hex');

test('accepted process ownership v30 is hash-bound to immutable accepted v29', () => {
  const digest = createHash('sha256').update(v29Bytes).digest('hex');
  assert.equal(digest, 'def750d606cb1586b1fce47a7982b33614c1a4a21970f08970fcd2c56f62141d');
  assert.equal(v29.status, 'ACCEPTED');
  assert.equal(v30.schema_version, 30);
  assert.equal(v30.status, 'ACCEPTED');
  assert.deepEqual(v30.supersedes, {
    path: 'docs/architecture/process-ownership-v29.json',
    sha256: digest,
  });
  assert.deepEqual(v30.accepted_adrs, v29.accepted_adrs);
});

test('v30 changes only status-candidate evidence and invariants', () => {
  assert.deepEqual(v30.source_boundaries, v29.source_boundaries);
  assert.deepEqual(
    v30.native_helpers.filter(({ id }) => id !== 'execution-service'),
    v29.native_helpers.filter(({ id }) => id !== 'execution-service'),
  );
  const before = v29.native_helpers.find(({ id }) => id === 'execution-service');
  const after = v30.native_helpers.find(({ id }) => id === 'execution-service');
  const evidenceFields = new Set([
    'launch_agent_status_candidate_authority',
    'launch_agent_status_source_observed',
    'launch_agent_status_imports_observed',
    'launch_agent_status_mapping_observed',
    'launch_agent_status_unknown_fail_closed_observed',
    'launch_agent_status_typecheck_observed',
    'launch_agent_status_executable_output_observed',
    'launch_agent_status_api_invocation_observed',
    'launch_agent_status_runtime_value_observed',
    'launch_agent_status_registration_observed',
    'launch_agent_status_unregistration_observed',
    'launch_agent_status_open_system_settings_observed',
    'launch_agent_status_package_mutation_observed',
    'launch_agent_status_app_invocation_observed',
    'launch_agent_status_helper_invocation_observed',
    'launch_agent_status_service_launch_observed',
    'launch_agent_status_application_connection_observed',
    'launch_agent_status_implemented_files',
    'launch_agent_status_guard_remediations',
  ]);
  const withoutEvidence = (value) => Object.fromEntries(
    Object.entries(value).filter(([key]) => !evidenceFields.has(key)),
  );
  assert.deepEqual(withoutEvidence(after), withoutEvidence(before));

  const evidenceInvariants = new Set([
    'The implemented status candidate imports only ServiceManagement, fixes the accepted plist filename internally, accepts no input, and maps the four current platform states to the four bounded DOSAI observations.',
    'Unknown future SMAppService status values fail closed to NOT_FOUND, and the typed observation remains informational rather than registration, liveness, connection, reconciliation, or execution evidence.',
    'The adversarial source test rejects lifecycle mutation, System Settings, legacy status, entry-point, process, filesystem, network, XPC, Virtualization, and caller-input surfaces and typechecks without executable output.',
    'No Service Management API was invoked, no runtime status was observed, and no package, signature, app, helper, launchd, registration, launch, application connection, VM, filesystem-data, network, journal, reconciliation, or production state changed.',
  ]);
  assert.deepEqual(
    v30.invariants.filter((value) => !evidenceInvariants.has(value)),
    v29.invariants,
  );
  assert.equal(v30.invariants.length, v29.invariants.length + 4);
});

test('v30 records exact compile-only status implementation evidence', () => {
  const service = v30.native_helpers.find(({ id }) => id === 'execution-service');
  assert.equal(
    service.launch_agent_status_candidate_authority,
    'IMPLEMENTED_COMPILE_ONLY_FIXED_STATUS_ADAPTER',
  );
  assert.deepEqual(service.launch_agent_status_imports_observed, ['ServiceManagement']);
  for (const field of [
    'launch_agent_status_source_observed',
    'launch_agent_status_mapping_observed',
    'launch_agent_status_unknown_fail_closed_observed',
    'launch_agent_status_typecheck_observed',
  ]) {
    assert.equal(service[field], true, field);
  }
  for (const field of [
    'launch_agent_status_executable_output_observed',
    'launch_agent_status_api_invocation_observed',
    'launch_agent_status_runtime_value_observed',
    'launch_agent_status_registration_observed',
    'launch_agent_status_unregistration_observed',
    'launch_agent_status_open_system_settings_observed',
    'launch_agent_status_package_mutation_observed',
    'launch_agent_status_app_invocation_observed',
    'launch_agent_status_helper_invocation_observed',
    'launch_agent_status_service_launch_observed',
    'launch_agent_status_application_connection_observed',
  ]) {
    assert.equal(service[field], false, field);
  }
});

test('v30 binds implementation and successor-aware guard postimages', async () => {
  const service = v30.native_helpers.find(({ id }) => id === 'execution-service');
  assert.deepEqual(
    service.launch_agent_status_implemented_files.map(({ path }) => path),
    service.launch_agent_status_proposed_files,
  );
  assert.equal(service.launch_agent_status_guard_remediations.length, 12);
  const successorFiles = new Map(
    [
      ...v36.native_helpers.find(({ id }) => id === 'service-management-status-addon')
        .static_package_guard_remediations,
      ...v37.governance_maintenance_files,
    ]
      .map((file) => [file.path, file.sha256]),
  );
  for (const file of [
    ...service.launch_agent_status_implemented_files,
    ...service.launch_agent_status_guard_remediations,
  ]) {
    assert.equal(await hashFile(file.path), successorFiles.get(file.path) ?? file.sha256, file.path);
  }
});

test('v30 preserves all lifecycle and adjacent effect denials', () => {
  const service = v30.native_helpers.find(({ id }) => id === 'execution-service');
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
