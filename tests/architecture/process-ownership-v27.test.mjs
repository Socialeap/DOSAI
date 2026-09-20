import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '../..');
const v26Path = resolve(root, 'docs/architecture/process-ownership-v26.json');
const v27Path = resolve(root, 'docs/architecture/process-ownership-v27.json');
const v26Bytes = await readFile(v26Path);
const v26 = JSON.parse(v26Bytes);
const v27 = JSON.parse(await readFile(v27Path, 'utf8'));
const v28 = JSON.parse(
  await readFile(resolve(root, 'docs/architecture/process-ownership-v28.json'), 'utf8'),
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

test('accepted process ownership v27 is hash-bound to immutable accepted v26', () => {
  const digest = createHash('sha256').update(v26Bytes).digest('hex');
  assert.equal(digest, '757879f93a098b52432cf853dd7ad5b89a1a3d7abe7b0509d6d3095e8f7e87fb');
  assert.equal(v26.status, 'ACCEPTED');
  assert.equal(v27.schema_version, 27);
  assert.equal(v27.status, 'ACCEPTED');
  assert.deepEqual(v27.supersedes, {
    path: 'docs/architecture/process-ownership-v26.json',
    sha256: digest,
  });
  assert.deepEqual(v27.accepted_adrs, v26.accepted_adrs);
});

test('v27 changes only plist-bearing package proposal fields and invariants', () => {
  assert.deepEqual(v27.source_boundaries, v26.source_boundaries);
  assert.deepEqual(
    v27.native_helpers.filter(({ id }) => id !== 'execution-service'),
    v26.native_helpers.filter(({ id }) => id !== 'execution-service'),
  );
  const before = v26.native_helpers.find(({ id }) => id === 'execution-service');
  const after = v27.native_helpers.find(({ id }) => id === 'execution-service');
  const proposalFields = new Set([
    'launch_agent_static_package_candidate_authority',
    'launch_agent_static_package_script_change_authority',
    'launch_agent_static_package_test_authority',
    'launch_agent_static_package_signing_authority',
    'launch_agent_static_package_identity_selector',
    'launch_agent_static_package_team_identifier',
    'owner_authorized_launch_agent_static_package_nested_signing',
    'owner_authorized_launch_agent_static_package_outer_signing',
    'launch_agent_static_package_mode_argument',
    'launch_agent_static_package_outer_app_identifier',
    'launch_agent_static_package_executable_identifier',
    'launch_agent_static_package_executable_relative_path',
    'launch_agent_static_package_plist_source_path',
    'launch_agent_static_package_plist_relative_path',
    'launch_agent_static_package_mach_service',
    'launch_agent_static_package_source_plist_sha256',
    'launch_agent_static_package_output_scope',
    'launch_agent_static_package_baseline_output_path',
    'launch_agent_static_package_baseline_nested_sha256',
    'launch_agent_static_package_baseline_outer_executable_sha256',
    'launch_agent_static_package_baseline_info_plist_sha256',
    'launch_agent_static_package_source_observed',
    'launch_agent_static_package_build_observed',
    'launch_agent_static_package_plist_copy_observed',
    'launch_agent_static_package_plist_hash_match_observed',
    'launch_agent_static_package_nested_signature_observed',
    'launch_agent_static_package_outer_signature_observed',
    'launch_agent_static_package_designated_requirements_observed',
    'launch_agent_static_package_layout_observed',
    'launch_agent_static_package_executable_invocation_observed',
    'launch_agent_static_package_app_invocation_observed',
    'launch_agent_static_package_service_management_observed',
    'launch_agent_static_package_launchctl_observed',
    'launch_agent_static_package_registration_observed',
    'launch_agent_static_package_launch_observed',
    'launch_agent_static_package_application_connection_observed',
    'launch_agent_static_package_proposed_files',
    'launch_agent_static_package_immutable_inputs',
    'launch_agent_static_package_proposal_guard_remediations',
  ]);
  const withoutProposal = (value) => Object.fromEntries(
    Object.entries(value).filter(([key]) => !proposalFields.has(key)),
  );
  assert.deepEqual(withoutProposal(after), before);

  const proposalInvariants = new Set([
    'The proposed plist-bearing package slice may change only scripts/package.mjs and add one adversarial package test, while preserving the accepted source plist, Swift sources, builder, existing package modes, and retained v24 package during proposal review.',
    'Signing the plist-bearing package remains unavailable until the owner separately authorizes test-only use of selector UMXN25Z493 and TeamIdentifier 3RD3TADLRY for the exact nested executable and containing com.socialeap.dosai app with the accepted plist.',
    'After both gates are accepted, the distinct fixed package mode may copy only the accepted plist to Contents/Library/LaunchAgents/com.socialeap.dosai.execution-service-fixture.plist before outer signing, verify exact source and packaged hashes and parsed values, sign nested code before the outer app, and retain only local generated evidence without invoking code.',
    'The proposed package slice cannot import ServiceManagement, call SMAppService, use launchctl, install, register, unregister, load, launch, connect from DOSAI, create or start a VM, target a process, access application data or networks, write the journal, reconcile ownership, release ownership, or perform production work.',
  ]);
  assert.deepEqual(
    v27.invariants.filter((value) => !proposalInvariants.has(value)),
    v26.invariants,
  );
  assert.equal(v27.invariants.length, v26.invariants.length + 4);
});

test('v27 fixes one distinct package mode and exact plist placement', () => {
  const service = v27.native_helpers.find(({ id }) => id === 'execution-service');
  assert.equal(
    service.launch_agent_static_package_candidate_authority,
    'ACCEPTED_OWNER_GATED_SIGNED_TEST_PACKAGE_ONLY',
  );
  assert.equal(
    service.launch_agent_static_package_signing_authority,
    'OWNER_AUTHORIZED_TEST_ONLY',
  );
  assert.equal(service.owner_authorized_launch_agent_static_package_nested_signing, true);
  assert.equal(service.owner_authorized_launch_agent_static_package_outer_signing, true);
  assert.equal(
    service.launch_agent_static_package_mode_argument,
    '--static-named-service-launch-agent-fixture',
  );
  assert.equal(
    service.launch_agent_static_package_plist_relative_path,
    'Contents/Library/LaunchAgents/com.socialeap.dosai.execution-service-fixture.plist',
  );
  assert.equal(
    service.launch_agent_static_package_executable_relative_path,
    'Contents/Library/LaunchServices/com.socialeap.dosai.execution-service-fixture',
  );
  assert.equal(
    service.launch_agent_static_package_source_plist_sha256,
    'b7c1a4e1434bea935cb6ca64f8a33e78cb8f94f0b7644bbc103c1f55c6a1c3b5',
  );
  assert.deepEqual(service.launch_agent_static_package_proposed_files, [
    'scripts/package.mjs',
    'tests/security/p3-watchdog-launch-agent-packaging-candidate.test.mjs',
  ]);
});

test('v27 hash-locks accepted inputs and proposal guard updates', async () => {
  const service = v27.native_helpers.find(({ id }) => id === 'execution-service');
  const v28Service = v28.native_helpers.find(({ id }) => id === 'execution-service');
  const successorFiles = new Map([
    ...v28Service.launch_agent_static_package_implemented_files,
    ...v28Service.launch_agent_static_package_guard_remediations,
    ...v30.native_helpers.find(({ id }) => id === 'execution-service')
      .launch_agent_status_guard_remediations,
    ...v36.native_helpers.find(({ id }) => id === 'service-management-status-addon')
      .static_package_implemented_files,
    ...v36.native_helpers.find(({ id }) => id === 'service-management-status-addon')
      .static_package_guard_remediations,
    ...v37.native_helpers.find(({ id }) => id === 'service-management-status-addon')
      .physical_proof_implemented_files,
    ...v37.governance_maintenance_files,
  ].map((file) => [file.path, file.sha256]));
  assert.equal(service.launch_agent_static_package_immutable_inputs.length, 10);
  assert.equal(service.launch_agent_static_package_proposal_guard_remediations.length, 2);
  for (const file of [
    ...service.launch_agent_static_package_immutable_inputs,
    ...service.launch_agent_static_package_proposal_guard_remediations,
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

test('v27 remains bounded while v28 records implementation without effects', () => {
  const service = v27.native_helpers.find(({ id }) => id === 'execution-service');
  const v28Service = v28.native_helpers.find(({ id }) => id === 'execution-service');
  assert.equal(
    createHash('sha256').update(packageSource).digest('hex'),
    v37.native_helpers.find(({ id }) => id === 'service-management-status-addon')
      .physical_proof_implemented_files
      .find(({ path }) => path === 'scripts/package.mjs').sha256,
  );
  for (const field of [
    'launch_agent_static_package_source_observed',
    'launch_agent_static_package_build_observed',
    'launch_agent_static_package_plist_copy_observed',
    'launch_agent_static_package_plist_hash_match_observed',
    'launch_agent_static_package_nested_signature_observed',
    'launch_agent_static_package_outer_signature_observed',
    'launch_agent_static_package_designated_requirements_observed',
    'launch_agent_static_package_layout_observed',
    'launch_agent_static_package_executable_invocation_observed',
    'launch_agent_static_package_app_invocation_observed',
    'launch_agent_static_package_service_management_observed',
    'launch_agent_static_package_launchctl_observed',
    'launch_agent_static_package_registration_observed',
    'launch_agent_static_package_launch_observed',
    'launch_agent_static_package_application_connection_observed',
    'application_reachable',
    'registration_authority',
    'production_registration_authority',
    'service_management_authority',
    'launch_agent_plist_authority',
    'launch_daemon_plist_authority',
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
  assert.match(packageSource, /--static-named-service-launch-agent-fixture/);
  assert.doesNotMatch(
    packageSource,
    /SMAppService|agent\(plistName|registerAndReturnError|unregisterAndReturnError|launchctl/,
  );
  assert.deepEqual(
    v28Service.launch_agent_static_package_implemented_files.map(({ path }) => path),
    service.launch_agent_static_package_proposed_files,
  );
  assert.equal(v28Service.launch_agent_static_package_registration_observed, false);
  assert.equal(v28Service.launch_agent_static_package_launch_observed, false);
});
