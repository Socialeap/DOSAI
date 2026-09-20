import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '../..');
const v15Path = resolve(root, 'docs/architecture/process-ownership-v15.json');
const v16Path = resolve(root, 'docs/architecture/process-ownership-v16.json');
const v15Bytes = await readFile(v15Path);
const v15 = JSON.parse(v15Bytes);
const v16 = JSON.parse(await readFile(v16Path, 'utf8'));
const v24 = JSON.parse(
  await readFile(resolve(root, 'docs/architecture/process-ownership-v24.json'), 'utf8'),
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

test('accepted process ownership v16 is hash-bound to immutable accepted v15', () => {
  const digest = createHash('sha256').update(v15Bytes).digest('hex');
  assert.equal(digest, 'e24f680092c22de00cb8458d912a5ac722521379e6f24232ba1e995881e60d97');
  assert.equal(v15.status, 'ACCEPTED');
  assert.equal(v16.schema_version, 16);
  assert.equal(v16.status, 'ACCEPTED');
  assert.deepEqual(v16.supersedes, {
    path: 'docs/architecture/process-ownership-v15.json',
    sha256: digest,
  });
  assert.deepEqual(v16.accepted_adrs, v15.accepted_adrs);
});

test('v16 changes only execution-service package evidence and invariants', () => {
  assert.deepEqual(v16.source_boundaries, v15.source_boundaries);
  assert.deepEqual(
    v16.native_helpers.filter(({ id }) => id !== 'execution-service'),
    v15.native_helpers.filter(({ id }) => id !== 'execution-service'),
  );

  const before = v15.native_helpers.find(({ id }) => id === 'execution-service');
  const after = v16.native_helpers.find(({ id }) => id === 'execution-service');
  const evidenceFields = new Set([
    'static_packaged_composition_authority',
    'packaged_test_static_layout_observed',
    'packaged_test_app_signature_observed',
    'packaged_test_fixture_signature_observed',
    'packaged_test_app_designated_requirement_observed',
    'packaged_test_fixture_designated_requirement_observed',
    'packaged_test_signing_team_identifier_observed',
    'packaged_test_launch_agent_artifact_observed',
    'packaged_test_launch_daemon_artifact_observed',
    'packaged_test_registration_operation_observed',
    'packaged_test_named_listener_observed',
    'admissible_static_package_run_app_launch_observed',
    'admissible_static_package_run_fixture_launch_observed',
    'admissible_static_package_run_packaged_helper_launch_observed',
    'pre_admissible_read_only_fixture_description_invocation_observed',
    'pre_admissible_read_only_fixture_description_invocation_remediated',
    'pre_admissible_read_only_fixture_description_mutation_observed',
    'pre_admissible_read_only_fixture_description_registration_observed',
    'pre_admissible_packaged_secure_enclave_description_invocation_observed',
    'pre_admissible_packaged_secure_enclave_description_invocation_remediated',
    'pre_admissible_packaged_secure_enclave_description_mutation_observed',
    'implemented_packaging_files',
  ]);
  const withoutEvidence = (value) => Object.fromEntries(
    Object.entries(value).filter(([key]) => !evidenceFields.has(key)),
  );
  assert.deepEqual(withoutEvidence(after), withoutEvidence(before));
});

test('v16 records exact static signature, layout, and no-launch evidence', () => {
  const service = v16.native_helpers.find(({ id }) => id === 'execution-service');
  assert.equal(
    service.static_packaged_composition_authority,
    'IMPLEMENTED_SIGNED_NESTED_ANONYMOUS_FIXTURE_ONLY',
  );
  for (const field of [
    'packaged_test_static_layout_observed',
    'packaged_test_app_signature_observed',
    'packaged_test_fixture_signature_observed',
    'packaged_test_app_designated_requirement_observed',
    'packaged_test_fixture_designated_requirement_observed',
  ]) {
    assert.equal(service[field], true, field);
  }
  assert.equal(service.packaged_test_signing_team_identifier_observed, '3RD3TADLRY');
  for (const field of [
    'packaged_test_launch_agent_artifact_observed',
    'packaged_test_launch_daemon_artifact_observed',
    'packaged_test_registration_operation_observed',
    'packaged_test_named_listener_observed',
    'admissible_static_package_run_app_launch_observed',
    'admissible_static_package_run_fixture_launch_observed',
    'admissible_static_package_run_packaged_helper_launch_observed',
  ]) {
    assert.equal(service[field], false, field);
  }
});

test('v16 discloses and binds remediation of the discarded pre-evidence invocation', () => {
  const service = v16.native_helpers.find(({ id }) => id === 'execution-service');
  assert.equal(service.pre_admissible_read_only_fixture_description_invocation_observed, true);
  assert.equal(service.pre_admissible_read_only_fixture_description_invocation_remediated, true);
  assert.equal(service.pre_admissible_read_only_fixture_description_mutation_observed, false);
  assert.equal(service.pre_admissible_read_only_fixture_description_registration_observed, false);
  assert.equal(service.pre_admissible_packaged_secure_enclave_description_invocation_observed, true);
  assert.equal(service.pre_admissible_packaged_secure_enclave_description_invocation_remediated, true);
  assert.equal(service.pre_admissible_packaged_secure_enclave_description_mutation_observed, false);
});

test('v16 preserves package postimages while v24 and v28 bind successors', async () => {
  const service = v16.native_helpers.find(({ id }) => id === 'execution-service');
  const successor = v24.native_helpers.find(({ id }) => id === 'execution-service');
  const v28Service = v28.native_helpers.find(({ id }) => id === 'execution-service');
  const successorFiles = new Map(
    [
      ...successor.named_service_static_package_implemented_files,
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
  assert.deepEqual(service.implemented_packaging_files, [
    {
      path: 'scripts/package.mjs',
      sha256: 'fa5c4e9c708e543318c3f681d1e8cab6b8722dc383f8b70195ebfe155d45226c',
    },
    {
      path: 'tests/security/p3-packaged-service-composition.test.mjs',
      sha256: 'd57cd4b4c699e7efd3647ec348396c618846a7602359d5b70d2edb5d1485f620',
    },
  ]);
  for (const file of service.implemented_packaging_files) {
    const digest = await hashFile(file.path);
    if (successorFiles.has(file.path)) {
      assert.notEqual(digest, file.sha256, file.path);
      assert.equal(digest, successorFiles.get(file.path), file.path);
    } else {
      assert.equal(digest, file.sha256, file.path);
    }
  }
  assert.equal(
    await hashFile('package.json'),
    service.packaging_baseline_files.find(({ path }) => path === 'package.json').sha256,
  );
});

test('v16 preserves every registration, launch, and effect denial', async () => {
  const service = v16.native_helpers.find(({ id }) => id === 'execution-service');
  for (const field of [
    'application_reachable',
    'registration_authority',
    'production_registration_authority',
    'service_management_authority',
    'launch_agent_plist_authority',
    'launch_daemon_plist_authority',
    'packaged_fixture_application_reachable',
    'mach_service_listener_authority',
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
    'keychain_mutation_authority',
    'signing_identity_export_authority',
  ]) {
    assert.equal(service[field], false, field);
  }

  const packageSource = await readFile(resolve(root, 'scripts/package.mjs'), 'utf8');
  assert.doesNotMatch(
    packageSource,
    /invokeWatchdogXPCFixture|SMAppService|launchctl|\.register\s*\(|\.unregister\s*\(/,
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
  for (const path of [
    'native-helpers/execution-service/LaunchAgent.plist',
    'native-helpers/execution-service/LaunchAgent.fixture.plist',
    'docs/architecture/schema-registry-v19.json',
  ]) {
    await assert.rejects(access(resolve(root, path)));
  }
});
