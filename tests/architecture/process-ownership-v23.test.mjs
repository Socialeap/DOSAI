import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import { loadLifecycleCompositionSuccessor } from './p3-lifecycle-composition-successor.mjs';

const root = resolve(import.meta.dirname, '../..');
const lifecycleSuccessor = await loadLifecycleCompositionSuccessor(root);
const v22Path = resolve(root, 'docs/architecture/process-ownership-v22.json');
const v23Path = resolve(root, 'docs/architecture/process-ownership-v23.json');
const v22Bytes = await readFile(v22Path);
const v22 = JSON.parse(v22Bytes);
const v23 = JSON.parse(await readFile(v23Path, 'utf8'));
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
const packageSource = await readFile(resolve(root, 'scripts/package.mjs'), 'utf8');

const hashFile = async (path) =>
  createHash('sha256').update(await readFile(resolve(root, path))).digest('hex');

test('accepted process ownership v23 is hash-bound to immutable accepted v22', () => {
  const digest = createHash('sha256').update(v22Bytes).digest('hex');
  assert.equal(digest, 'cad2d39ef855511a71b081cf1d9378a69374cf37b37b62aa7648fce9dd35a8a3');
  assert.equal(v22.status, 'ACCEPTED');
  assert.equal(v23.schema_version, 23);
  assert.equal(v23.status, 'ACCEPTED');
  assert.deepEqual(v23.supersedes, {
    path: 'docs/architecture/process-ownership-v22.json',
    sha256: digest,
  });
  assert.deepEqual(v23.accepted_adrs, v22.accepted_adrs);
});

test('v23 changes only static named-service package proposal fields and invariants', () => {
  assert.deepEqual(v23.source_boundaries, v22.source_boundaries);
  assert.deepEqual(
    v23.native_helpers.filter(({ id }) => id !== 'execution-service'),
    v22.native_helpers.filter(({ id }) => id !== 'execution-service'),
  );
  const before = v22.native_helpers.find(({ id }) => id === 'execution-service');
  const after = v23.native_helpers.find(({ id }) => id === 'execution-service');
  const proposalFields = new Set([
    'named_service_static_package_candidate_authority',
    'named_service_static_package_build_authority',
    'named_service_static_package_script_change_authority',
    'named_service_static_package_test_authority',
    'named_service_static_package_signing_authority',
    'named_service_static_package_identity_selector',
    'named_service_static_package_team_identifier',
    'owner_authorized_named_service_fixture_signing',
    'owner_authorized_named_service_outer_app_signing',
    'named_service_static_package_mode_argument',
    'named_service_static_package_outer_app_identifier',
    'named_service_static_package_executable_identifier',
    'named_service_static_package_relative_path',
    'named_service_static_package_output_scope',
    'named_service_static_package_source_observed',
    'named_service_static_package_build_observed',
    'named_service_static_package_nested_signature_observed',
    'named_service_static_package_outer_signature_observed',
    'named_service_static_package_designated_requirements_observed',
    'named_service_static_package_team_identifier_observed',
    'named_service_static_package_executable_invocation_observed',
    'named_service_static_package_app_invocation_observed',
    'named_service_static_package_plist_observed',
    'named_service_static_package_registration_observed',
    'named_service_static_package_launch_observed',
    'named_service_static_package_application_connection_observed',
    'named_service_static_package_proposed_files',
    'named_service_static_package_immutable_inputs',
  ]);
  const withoutProposal = (value) => Object.fromEntries(
    Object.entries(value).filter(([key]) => !proposalFields.has(key)),
  );
  assert.deepEqual(withoutProposal(after), before);

  const proposalInvariants = new Set([
    'The proposed static named-service package slice may add only one dedicated fixed-source build helper, one exact package-mode change, and one adversarial security test over the accepted named-service source postimages.',
    'Named-service package signing remains unavailable until the owner separately authorizes test-only use of selector UMXN25Z493 and TeamIdentifier 3RD3TADLRY for the exact nested named-service fixture and containing static DOSAI test app.',
    'After both gates are accepted, the package proof may place only com.socialeap.dosai.execution-service-fixture under the fixed Contents/Library/LaunchServices path, sign nested code before the outer app, inspect both signatures, and retain only the local generated out artifact without invoking either executable.',
    'The proposed static package slice cannot add a LaunchAgent or LaunchDaemon plist, ServiceManagement or SMAppService operation, registration, unregistration, launch, application connection, VM, process, filesystem, network, journal, reconciliation, ownership release, or production authority.',
  ]);
  assert.deepEqual(
    v23.invariants.filter((value) => !proposalInvariants.has(value)),
    v22.invariants,
  );
  assert.equal(v23.invariants.length, v22.invariants.length + 4);
});

test('v23 accepts one fixed package mode and exact owner-authorized test signing', () => {
  const service = v23.native_helpers.find(({ id }) => id === 'execution-service');
  assert.equal(
    service.named_service_static_package_candidate_authority,
    'ACCEPTED_OWNER_GATED_SIGNED_TEST_PACKAGE_ONLY',
  );
  assert.equal(service.named_service_static_package_build_authority, true);
  assert.equal(service.named_service_static_package_script_change_authority, true);
  assert.equal(service.named_service_static_package_test_authority, true);
  assert.equal(
    service.named_service_static_package_signing_authority,
    'OWNER_AUTHORIZED_TEST_ONLY',
  );
  assert.equal(service.named_service_static_package_identity_selector, 'UMXN25Z493');
  assert.equal(service.named_service_static_package_team_identifier, '3RD3TADLRY');
  assert.equal(service.owner_authorized_named_service_fixture_signing, true);
  assert.equal(service.owner_authorized_named_service_outer_app_signing, true);
  assert.equal(
    service.named_service_static_package_mode_argument,
    '--static-named-service-fixture',
  );
  assert.equal(
    service.named_service_static_package_relative_path,
    'Contents/Library/LaunchServices/com.socialeap.dosai.execution-service-fixture',
  );
  assert.deepEqual(service.named_service_static_package_proposed_files, [
    'scripts/watchdog-named-service-fixture.mjs',
    'scripts/package.mjs',
    'tests/security/p3-watchdog-named-service-packaging-candidate.test.mjs',
  ]);
});

test('v23 hash-locks accepted source and package preimages', async () => {
  const service = v23.native_helpers.find(({ id }) => id === 'execution-service');
  const successor = v24.native_helpers.find(({ id }) => id === 'execution-service');
  const successorFiles = new Map(
    [
      ...successor.named_service_static_package_implemented_files,
      ...v28.native_helpers.find(({ id }) => id === 'execution-service')
        .launch_agent_static_package_implemented_files,
      ...v28.native_helpers.find(({ id }) => id === 'execution-service')
        .launch_agent_static_package_guard_remediations,
      ...v36.native_helpers.find(({ id }) => id === 'service-management-status-addon')
        .static_package_implemented_files,
      ...v36.native_helpers.find(({ id }) => id === 'service-management-status-addon')
        .static_package_guard_remediations,
      ...v37.native_helpers.find(({ id }) => id === 'service-management-status-addon')
        .physical_proof_implemented_files,
    ]
      .map((file) => [file.path, file.sha256]),
  );
  assert.equal(service.named_service_static_package_immutable_inputs.length, 8);
  for (const file of service.named_service_static_package_immutable_inputs) {
    const digest = await hashFile(file.path);
    if (successorFiles.has(file.path)) {
      assert.notEqual(digest, file.sha256, file.path);
      assert.equal(
        digest,
        lifecycleSuccessor.expected(file.path, successorFiles.get(file.path)),
        file.path,
      );
    } else {
      assert.equal(digest, lifecycleSuccessor.expected(file.path, file.sha256), file.path);
    }
  }
});

test('v23 implementation occupies only accepted paths while effects remain absent', async () => {
  const service = v23.native_helpers.find(({ id }) => id === 'execution-service');
  for (const field of [
    'named_service_static_package_source_observed',
    'named_service_static_package_build_observed',
    'named_service_static_package_nested_signature_observed',
    'named_service_static_package_outer_signature_observed',
    'named_service_static_package_designated_requirements_observed',
    'named_service_static_package_team_identifier_observed',
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

  assert.match(packageSource, /--static-named-service-fixture/);
  assert.match(packageSource, /watchdog-named-service-fixture/);
  assert.match(
    packageSource,
    /Contents\/Library\/LaunchServices\/com\.socialeap\.dosai\.execution-service-fixture/,
  );
  for (const path of [
    'scripts/watchdog-named-service-fixture.mjs',
    'tests/security/p3-watchdog-named-service-packaging-candidate.test.mjs',
    'docs/architecture/schema-registry-v19.json',
  ]) {
    if (path.startsWith('scripts/') || path.startsWith('tests/security/')) {
      await access(resolve(root, path));
    } else {
      await assert.rejects(access(resolve(root, path)), undefined, path);
    }
  }
  const plistRecord = v26.native_helpers
    .find(({ id }) => id === 'execution-service')
    .launch_agent_plist_implemented_files[0];
  assert.equal(
    plistRecord.path,
    'native-helpers/execution-service/com.socialeap.dosai.execution-service-fixture.plist',
  );
  assert.equal(await hashFile(plistRecord.path), plistRecord.sha256);
});
