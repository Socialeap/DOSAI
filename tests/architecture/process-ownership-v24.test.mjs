import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

import { loadGuardSuccessors } from './p3-guard-successor.mjs';

const root = resolve(import.meta.dirname, '../..');
const successors = await loadGuardSuccessors(root);
const v23Path = resolve(root, 'docs/architecture/process-ownership-v23.json');
const v24Path = resolve(root, 'docs/architecture/process-ownership-v24.json');
const v23Bytes = await readFile(v23Path);
const v23 = JSON.parse(v23Bytes);
const v24 = JSON.parse(await readFile(v24Path, 'utf8'));
const v26 = JSON.parse(
  await readFile(resolve(root, 'docs/architecture/process-ownership-v26.json'), 'utf8'),
);
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

test('accepted process ownership v24 is hash-bound to immutable accepted v23', () => {
  const digest = createHash('sha256').update(v23Bytes).digest('hex');
  assert.equal(digest, 'e9b50e1495929034e8648612bedb586e4f7e6eb5dc0c651464a345ce96ef1f21');
  assert.equal(v23.status, 'ACCEPTED');
  assert.equal(v24.schema_version, 24);
  assert.equal(v24.status, 'ACCEPTED');
  assert.deepEqual(v24.supersedes, {
    path: 'docs/architecture/process-ownership-v23.json',
    sha256: digest,
  });
  assert.deepEqual(v24.accepted_adrs, v23.accepted_adrs);
});

test('v24 changes only static named-service package evidence and invariants', () => {
  assert.deepEqual(v24.source_boundaries, v23.source_boundaries);
  assert.deepEqual(
    v24.native_helpers.filter(({ id }) => id !== 'execution-service'),
    v23.native_helpers.filter(({ id }) => id !== 'execution-service'),
  );
  const before = v23.native_helpers.find(({ id }) => id === 'execution-service');
  const after = v24.native_helpers.find(({ id }) => id === 'execution-service');
  const evidenceFields = new Set([
    'named_service_static_package_candidate_authority',
    'named_service_static_package_source_observed',
    'named_service_static_package_build_observed',
    'named_service_static_package_nested_signature_observed',
    'named_service_static_package_outer_signature_observed',
    'named_service_static_package_designated_requirements_observed',
    'named_service_static_package_team_identifier_observed',
    'named_service_static_package_layout_observed',
    'named_service_static_package_architecture_observed',
    'named_service_static_package_minimum_macos_observed',
    'named_service_static_package_forbidden_framework_observed',
    'named_service_static_package_anonymous_fixture_absent_observed',
    'named_service_static_package_generated_artifact_retained',
    'named_service_static_package_output_path',
    'named_service_static_package_nested_sha256',
    'named_service_static_package_outer_executable_sha256',
    'named_service_static_package_info_plist_sha256',
    'named_service_static_package_nested_cdhash',
    'named_service_static_package_outer_cdhash',
    'named_service_static_package_rejected_extra_separator_observed',
    'named_service_static_package_rejected_extra_separator_effect_observed',
    'named_service_static_package_discarded_requirement_flag_run_observed',
    'named_service_static_package_discarded_requirement_flag_run_signed',
    'named_service_static_package_discarded_requirement_flag_run_launched',
    'named_service_static_package_requirement_flag_remediated',
    'named_service_static_package_implemented_files',
    'named_service_static_package_guard_remediations',
  ]);
  const withoutEvidence = (value) => Object.fromEntries(
    Object.entries(value).filter(([key]) => !evidenceFields.has(key)),
  );
  assert.deepEqual(withoutEvidence(after), withoutEvidence(before));

  const evidenceInvariants = new Set([
    'The implemented static package mode builds only the five accepted named-service Swift sources, suppresses default ad-hoc signing before exact Apple Development signing, and fixes the nested and outer test identifiers, selector, TeamIdentifier, architecture, and minimum OS.',
    'The final evidence package contains only the named-service fixture under the fixed LaunchServices path, signs nested code before the outer app, passes strict signature and designated-requirement checks, and contains no anonymous watchdog fixture, LaunchAgent plist, or LaunchDaemon plist.',
    'One extra-separator package attempt failed strict admission before build or signing; one later run signed the authorized artifacts but was discarded when its post-sign requirement option was malformed, and the corrected final run completed every inspection without invocation, registration, or launch.',
    'Static named-service packaging does not authorize plist creation, ServiceManagement or SMAppService operations, installation, registration, unregistration, launch, application connection, VM, process, filesystem, network, journal, reconciliation, ownership release, or production behavior.',
  ]);
  assert.deepEqual(
    v24.invariants.filter((value) => !evidenceInvariants.has(value)),
    v23.invariants,
  );
  assert.equal(v24.invariants.length, v23.invariants.length + 4);
});

test('v24 records exact signed static package observations', () => {
  const service = v24.native_helpers.find(({ id }) => id === 'execution-service');
  assert.equal(
    service.named_service_static_package_candidate_authority,
    'IMPLEMENTED_OWNER_GATED_SIGNED_TEST_PACKAGE_ONLY',
  );
  for (const field of [
    'named_service_static_package_source_observed',
    'named_service_static_package_build_observed',
    'named_service_static_package_nested_signature_observed',
    'named_service_static_package_outer_signature_observed',
    'named_service_static_package_designated_requirements_observed',
    'named_service_static_package_layout_observed',
    'named_service_static_package_anonymous_fixture_absent_observed',
    'named_service_static_package_generated_artifact_retained',
  ]) {
    assert.equal(service[field], true, field);
  }
  assert.equal(service.named_service_static_package_team_identifier_observed, '3RD3TADLRY');
  assert.equal(service.named_service_static_package_architecture_observed, 'arm64');
  assert.equal(service.named_service_static_package_minimum_macos_observed, '15.0');
  assert.equal(
    service.named_service_static_package_output_path,
    'out/DOSAI-darwin-arm64/DOSAI.app',
  );
  for (const field of [
    'named_service_static_package_nested_sha256',
    'named_service_static_package_outer_executable_sha256',
    'named_service_static_package_info_plist_sha256',
  ]) {
    assert.match(service[field], /^[0-9a-f]{64}$/, field);
  }
  for (const field of [
    'named_service_static_package_nested_cdhash',
    'named_service_static_package_outer_cdhash',
  ]) {
    assert.match(service[field], /^[0-9a-f]{40}$/, field);
  }
});

test('v24 preserves implementation while v26 and v28 bind successors', async () => {
  const service = v24.native_helpers.find(({ id }) => id === 'execution-service');
  const v28Service = v28.native_helpers.find(({ id }) => id === 'execution-service');
  const successorFiles = new Map(
    [
      ...v26.native_helpers.find(({ id }) => id === 'execution-service')
        .launch_agent_plist_guard_remediations,
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
    ]
      .map((file) => [file.path, successors.expected(file.path, file.sha256)]),
  );
  assert.equal(service.named_service_static_package_implemented_files.length, 3);
  assert.equal(service.named_service_static_package_guard_remediations.length, 7);
  for (const file of [
    ...service.named_service_static_package_implemented_files,
    ...service.named_service_static_package_guard_remediations,
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

test('v24 discloses discarded runs and preserves every effect denial', async () => {
  const service = v24.native_helpers.find(({ id }) => id === 'execution-service');
  assert.equal(service.named_service_static_package_rejected_extra_separator_observed, true);
  assert.equal(service.named_service_static_package_rejected_extra_separator_effect_observed, false);
  assert.equal(service.named_service_static_package_discarded_requirement_flag_run_observed, true);
  assert.equal(service.named_service_static_package_discarded_requirement_flag_run_signed, true);
  assert.equal(service.named_service_static_package_discarded_requirement_flag_run_launched, false);
  assert.equal(service.named_service_static_package_requirement_flag_remediated, true);
  for (const field of [
    'named_service_static_package_forbidden_framework_observed',
    'named_service_static_package_executable_invocation_observed',
    'named_service_static_package_app_invocation_observed',
    'named_service_static_package_plist_observed',
    'named_service_static_package_registration_observed',
    'named_service_static_package_launch_observed',
    'named_service_static_package_application_connection_observed',
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
    /invokeWatchdogXPCFixture|invokeWatchdogNamedService|SMAppService|launchctl|\.register\s*\(|\.unregister\s*\(/,
  );
  assert.match(
    packageSource,
    /else \{\n\s+await assert\.rejects\(access\(join\(appBundle, 'Contents\/Library\/LaunchAgents'\)\)\);/,
  );
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
