import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

import { loadGuardSuccessors } from './p3-guard-successor.mjs';

const root = resolve(import.meta.dirname, '../..');
const successors = await loadGuardSuccessors(root);
const v27Path = resolve(root, 'docs/architecture/process-ownership-v27.json');
const v27Bytes = await readFile(v27Path);
const v27 = JSON.parse(v27Bytes);
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

test('accepted process ownership v28 is hash-bound to immutable accepted v27', () => {
  const digest = createHash('sha256').update(v27Bytes).digest('hex');
  assert.equal(digest, '932ad6f09d2e852469ba72b9dc340c857ee37752d071967b2159a387752e4374');
  assert.equal(v27.status, 'ACCEPTED');
  assert.equal(v28.schema_version, 28);
  assert.equal(v28.status, 'ACCEPTED');
  assert.deepEqual(v28.supersedes, {
    path: 'docs/architecture/process-ownership-v27.json',
    sha256: digest,
  });
  assert.deepEqual(v28.accepted_adrs, v27.accepted_adrs);
});

test('v28 changes only plist-bearing package evidence and invariants', () => {
  assert.deepEqual(v28.source_boundaries, v27.source_boundaries);
  assert.deepEqual(
    v28.native_helpers.filter(({ id }) => id !== 'execution-service'),
    v27.native_helpers.filter(({ id }) => id !== 'execution-service'),
  );
  const before = v27.native_helpers.find(({ id }) => id === 'execution-service');
  const after = v28.native_helpers.find(({ id }) => id === 'execution-service');
  const evidenceFields = new Set([
    'launch_agent_static_package_candidate_authority',
    'launch_agent_static_package_source_observed',
    'launch_agent_static_package_build_observed',
    'launch_agent_static_package_plist_copy_observed',
    'launch_agent_static_package_plist_hash_match_observed',
    'launch_agent_static_package_nested_signature_observed',
    'launch_agent_static_package_outer_signature_observed',
    'launch_agent_static_package_designated_requirements_observed',
    'launch_agent_static_package_layout_observed',
    'launch_agent_static_package_package_script_invocation_observed',
    'launch_agent_static_package_signing_identity_lookup_observed',
    'launch_agent_static_package_team_identifier_observed',
    'launch_agent_static_package_nested_identifier_observed',
    'launch_agent_static_package_outer_identifier_observed',
    'launch_agent_static_package_architecture_observed',
    'launch_agent_static_package_minimum_macos_observed',
    'launch_agent_static_package_forbidden_framework_observed',
    'launch_agent_static_package_anonymous_fixture_absent_observed',
    'launch_agent_static_package_launch_daemon_absent_observed',
    'launch_agent_static_package_packaged_plist_regular_file_observed',
    'launch_agent_static_package_packaged_plist_symbolic_link_observed',
    'launch_agent_static_package_generated_artifact_retained',
    'launch_agent_static_package_output_path',
    'launch_agent_static_package_nested_sha256',
    'launch_agent_static_package_plist_sha256',
    'launch_agent_static_package_outer_executable_sha256',
    'launch_agent_static_package_info_plist_sha256',
    'launch_agent_static_package_nested_cdhash',
    'launch_agent_static_package_outer_cdhash',
    'launch_agent_static_package_adversarial_argument_rejection_observed',
    'launch_agent_static_package_adversarial_argument_effect_observed',
    'launch_agent_static_package_restricted_shell_trust_failure_observed',
    'launch_agent_static_package_restricted_shell_trust_failure_code',
    'launch_agent_static_package_normal_keychain_strict_verification_observed',
    'launch_agent_static_package_trust_visibility_limitation_recorded',
    'launch_agent_static_package_implemented_files',
    'launch_agent_static_package_guard_remediations',
  ]);
  const withoutEvidence = (value) => Object.fromEntries(
    Object.entries(value).filter(([key]) => !evidenceFields.has(key)),
  );
  assert.deepEqual(withoutEvidence(after), withoutEvidence(before));

  const evidenceInvariants = new Set([
    'The implemented plist-bearing package mode preserves every accepted package mode and input, admits only its one exact argument, verifies the accepted source plist as a regular non-symlink file, signs nested code before plist copy and outer signing, and invokes no packaged executable.',
    'The retained local evidence app contains exactly the signed named-service executable under LaunchServices and the byte-identical accepted three-key plist under LaunchAgents; both signatures, exact designated requirements, TeamIdentifier, architecture, minimum OS, and two-file Library layout were verified.',
    'A read-only strict verification in the restricted shell reported CSSMERR_TP_NOT_TRUSTED because normal Keychain trust was unavailable; the same immutable package passed strict and designated-requirement verification with normal Keychain access, and no signature fault is concealed.',
    'Static plist-bearing package composition does not authorize ServiceManagement, SMAppService, launchctl, installation, registration, unregistration, loading, launch, application connection, VM, process, filesystem-data, network, journal, reconciliation, ownership release, production signing, or production behavior.',
  ]);
  assert.deepEqual(
    v28.invariants.filter((value) => !evidenceInvariants.has(value)),
    v27.invariants,
  );
  assert.equal(v28.invariants.length, v27.invariants.length + 4);
});

test('v28 records exact package, signature, plist, and trust observations', () => {
  const service = v28.native_helpers.find(({ id }) => id === 'execution-service');
  assert.equal(
    service.launch_agent_static_package_candidate_authority,
    'IMPLEMENTED_OWNER_GATED_SIGNED_TEST_PACKAGE_ONLY',
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
    'launch_agent_static_package_package_script_invocation_observed',
    'launch_agent_static_package_anonymous_fixture_absent_observed',
    'launch_agent_static_package_launch_daemon_absent_observed',
    'launch_agent_static_package_packaged_plist_regular_file_observed',
    'launch_agent_static_package_generated_artifact_retained',
    'launch_agent_static_package_adversarial_argument_rejection_observed',
    'launch_agent_static_package_restricted_shell_trust_failure_observed',
    'launch_agent_static_package_normal_keychain_strict_verification_observed',
    'launch_agent_static_package_trust_visibility_limitation_recorded',
  ]) {
    assert.equal(service[field], true, field);
  }
  assert.equal(service.launch_agent_static_package_signing_identity_lookup_observed, false);
  assert.equal(service.launch_agent_static_package_forbidden_framework_observed, false);
  assert.equal(service.launch_agent_static_package_packaged_plist_symbolic_link_observed, false);
  assert.equal(service.launch_agent_static_package_adversarial_argument_effect_observed, false);
  assert.equal(service.launch_agent_static_package_team_identifier_observed, '3RD3TADLRY');
  assert.equal(service.launch_agent_static_package_architecture_observed, 'arm64');
  assert.equal(service.launch_agent_static_package_minimum_macos_observed, '15.0');
  assert.equal(
    service.launch_agent_static_package_restricted_shell_trust_failure_code,
    'CSSMERR_TP_NOT_TRUSTED',
  );
});

test('v28 binds implementation, guard, and retained artifact postimages', async () => {
  const service = v28.native_helpers.find(({ id }) => id === 'execution-service');
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
  assert.deepEqual(
    service.launch_agent_static_package_implemented_files.map(({ path }) => path),
    service.launch_agent_static_package_proposed_files,
  );
  assert.equal(service.launch_agent_static_package_guard_remediations.length, 15);
  for (const file of [
    ...service.launch_agent_static_package_implemented_files,
    ...service.launch_agent_static_package_guard_remediations,
  ]) {
    const digest = await hashFile(file.path);
    if (successorFiles.has(file.path)) {
      assert.notEqual(digest, file.sha256, file.path);
      assert.equal(digest, successorFiles.get(file.path), file.path);
    } else {
      assert.equal(digest, file.sha256, file.path);
    }
  }

  const app = 'out/DOSAI-darwin-arm64/DOSAI.app';
  const statusAddon = v36.native_helpers.find(
    ({ id }) => id === 'service-management-status-addon',
  );
  assert.equal(
    await hashFile(`${app}/${service.launch_agent_static_package_executable_relative_path}`),
    statusAddon.static_package_named_service_sha256,
  );
  assert.equal(
    await hashFile(`${app}/${service.launch_agent_static_package_plist_relative_path}`),
    service.launch_agent_static_package_plist_sha256,
  );
  assert.equal(
    await hashFile(`${app}/Contents/MacOS/DOSAI`),
    statusAddon.static_package_outer_executable_sha256,
  );
  assert.equal(
    await hashFile(`${app}/Contents/Info.plist`),
    service.launch_agent_static_package_info_plist_sha256,
  );
  assert.match(service.launch_agent_static_package_nested_cdhash, /^[0-9a-f]{40}$/);
  assert.match(service.launch_agent_static_package_outer_cdhash, /^[0-9a-f]{40}$/);
});

test('v28 preserves every registration, launch, and effect denial', () => {
  const service = v28.native_helpers.find(({ id }) => id === 'execution-service');
  for (const field of [
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
  assert.doesNotMatch(
    packageSource,
    /SMAppService|agent\(plistName|registerAndReturnError|unregisterAndReturnError|launchctl|invokeWatchdogXPCFixture|invokeWatchdogNamedService/,
  );
  assert.equal(
    v36.native_helpers.find(({ id }) => id === 'service-management-status-addon')
      .static_package_status_call_observed,
    false,
  );
});
