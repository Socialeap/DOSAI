import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

import { loadGuardSuccessors } from './p3-guard-successor.mjs';

const root = resolve(import.meta.dirname, '../..');
const successors = await loadGuardSuccessors(root);
const v28Path = resolve(root, 'docs/architecture/process-ownership-v28.json');
const v28Bytes = await readFile(v28Path);
const v28 = JSON.parse(v28Bytes);
const v29 = JSON.parse(
  await readFile(resolve(root, 'docs/architecture/process-ownership-v29.json'), 'utf8'),
);
const v30 = JSON.parse(
  await readFile(resolve(root, 'docs/architecture/process-ownership-v30.json'), 'utf8'),
);
const v36 = JSON.parse(
  await readFile(resolve(root, 'docs/architecture/process-ownership-v36.json'), 'utf8'),
);
const v37 = JSON.parse(
  await readFile(resolve(root, 'docs/architecture/process-ownership-v37.json'), 'utf8'),
);
const packageSource = await readFile(resolve(root, 'scripts/package.mjs'), 'utf8');

const hashFile = async (path) =>
  createHash('sha256').update(await readFile(resolve(root, path))).digest('hex');

test('accepted process ownership v29 is hash-bound to immutable accepted v28', () => {
  const digest = createHash('sha256').update(v28Bytes).digest('hex');
  assert.equal(digest, '11e2595b60f765a3368606f835a2a245f69b98ade60800df37ad409bb3f4edd9');
  assert.equal(v28.status, 'ACCEPTED');
  assert.equal(v29.schema_version, 29);
  assert.equal(v29.status, 'ACCEPTED');
  assert.deepEqual(v29.supersedes, {
    path: 'docs/architecture/process-ownership-v28.json',
    sha256: digest,
  });
  assert.deepEqual(v29.accepted_adrs, v28.accepted_adrs);
});

test('v29 changes only status-candidate proposal fields and invariants', () => {
  assert.deepEqual(v29.source_boundaries, v28.source_boundaries);
  assert.deepEqual(
    v29.native_helpers.filter(({ id }) => id !== 'execution-service'),
    v28.native_helpers.filter(({ id }) => id !== 'execution-service'),
  );
  const before = v28.native_helpers.find(({ id }) => id === 'execution-service');
  const after = v29.native_helpers.find(({ id }) => id === 'execution-service');
  const proposalFields = new Set([
    'launch_agent_status_candidate_authority',
    'launch_agent_status_source_authority',
    'launch_agent_status_test_authority',
    'launch_agent_status_service_management_import_authority',
    'launch_agent_status_agent_lookup_source_authority',
    'launch_agent_status_read_source_authority',
    'launch_agent_status_application_reachable',
    'launch_agent_status_executable_output_authority',
    'launch_agent_status_packaging_authority',
    'launch_agent_status_invocation_authority',
    'launch_agent_status_registration_authority',
    'launch_agent_status_unregistration_authority',
    'launch_agent_status_open_system_settings_authority',
    'launch_agent_status_service_launch_authority',
    'launch_agent_status_application_connection_authority',
    'launch_agent_status_fixed_plist_name',
    'launch_agent_status_typecheck_target',
    'launch_agent_status_allowed_observations',
    'launch_agent_status_semantics',
    'launch_agent_status_proposed_files',
    'launch_agent_status_immutable_inputs',
    'launch_agent_status_proposal_guard_remediations',
  ]);
  assert.deepEqual(
    Object.fromEntries(Object.entries(after).filter(([key]) => !proposalFields.has(key))),
    before,
  );

  const proposalInvariants = new Set([
    'The proposed LaunchAgent status candidate may add only one compile-only Swift source and one adversarial source test over immutable accepted v28, ADR 0020, plist, and package inputs.',
    'The candidate may import ServiceManagement only to construct SMAppService.agent with the one fixed accepted plist name and map its status to NOT_REGISTERED, ENABLED, REQUIRES_APPROVAL, or NOT_FOUND without caller input.',
    'A status value is observational only: ENABLED does not prove process liveness, authenticated XPC reachability, accepted generation, reconciliation, or execution availability, and every other value remains fail-closed.',
    'The proposed status slice cannot produce or invoke an executable, change the package, call register or unregister, open System Settings, install, load, launch, connect from DOSAI, create or start a VM, target a process, access application data or networks, write the journal, reconcile ownership, release ownership, or perform production work.',
  ]);
  assert.deepEqual(
    v29.invariants.filter((value) => !proposalInvariants.has(value)),
    v28.invariants,
  );
  assert.equal(v29.invariants.length, v28.invariants.length + 4);
});

test('v29 fixes one compile-only observational status surface', () => {
  const service = v29.native_helpers.find(({ id }) => id === 'execution-service');
  assert.equal(
    service.launch_agent_status_candidate_authority,
    'PROPOSED_COMPILE_ONLY_FIXED_STATUS_ADAPTER',
  );
  assert.equal(service.launch_agent_status_fixed_plist_name,
    'com.socialeap.dosai.execution-service-fixture.plist');
  assert.equal(service.launch_agent_status_typecheck_target, 'arm64-apple-macos15.0');
  assert.deepEqual(service.launch_agent_status_allowed_observations, [
    'NOT_REGISTERED',
    'ENABLED',
    'REQUIRES_APPROVAL',
    'NOT_FOUND',
  ]);
  assert.equal(
    service.launch_agent_status_semantics,
    'OBSERVATION_ONLY_NOT_AUTHORIZATION_OR_LIVENESS',
  );
  assert.deepEqual(service.launch_agent_status_proposed_files, [
    'native-helpers/execution-service/WatchdogLaunchAgentStatusCandidate.swift',
    'tests/security/p3-watchdog-launch-agent-status-candidate.test.mjs',
  ]);
});

test('v29 hash-locks accepted inputs and its narrow predecessor guard update', async () => {
  const service = v29.native_helpers.find(({ id }) => id === 'execution-service');
  const successorFiles = new Map(
    [
      ...v30.native_helpers.find(({ id }) => id === 'execution-service')
        .launch_agent_status_guard_remediations,
      ...v36.native_helpers.find(({ id }) => id === 'service-management-status-addon')
        .static_package_implemented_files,
      ...v36.native_helpers.find(({ id }) => id === 'service-management-status-addon')
        .static_package_guard_remediations,
      ...v37.native_helpers.find(({ id }) => id === 'service-management-status-addon')
        .physical_proof_implemented_files,
      ...v37.governance_maintenance_files,
    ]
      .map((file) => [file.path, successors.expected(file.path, file.sha256)]),
  );
  assert.equal(service.launch_agent_status_immutable_inputs.length, 3);
  assert.equal(service.launch_agent_status_proposal_guard_remediations.length, 1);
  for (const file of [
    ...service.launch_agent_status_immutable_inputs,
    ...service.launch_agent_status_proposal_guard_remediations,
  ]) {
    const digest = await hashFile(file.path);
    if (successorFiles.has(file.path)) {
      assert.notEqual(digest, file.sha256, file.path);
      assert.equal(digest, successorFiles.get(file.path), file.path);
    } else {
      assert.equal(digest, file.sha256, file.path);
    }
  }
});

test('v29 stays bounded while v30 records compile-only implementation', async () => {
  const service = v29.native_helpers.find(({ id }) => id === 'execution-service');
  const successor = v30.native_helpers.find(({ id }) => id === 'execution-service');
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
  assert.deepEqual(
    successor.launch_agent_status_implemented_files.map(({ path }) => path),
    service.launch_agent_status_proposed_files,
  );
  for (const file of successor.launch_agent_status_implemented_files) {
    assert.equal(await hashFile(file.path), file.sha256, file.path);
  }
  assert.doesNotMatch(
    packageSource,
    /SMAppService|agent\(plistName|registerAndReturnError|unregisterAndReturnError|openSystemSettingsLoginItems|launchctl/,
  );
  assert.equal(successor.launch_agent_status_api_invocation_observed, false);
  assert.equal(successor.launch_agent_status_runtime_value_observed, false);
  assert.equal(successor.launch_agent_status_registration_observed, false);
  assert.equal(successor.launch_agent_status_unregistration_observed, false);
  assert.equal(successor.launch_agent_status_service_launch_observed, false);
  assert.equal(successor.launch_agent_status_application_connection_observed, false);
});
