import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

import { loadGuardSuccessors } from './p3-guard-successor.mjs';

const root = resolve(import.meta.dirname, '../..');
const successors = await loadGuardSuccessors(root);
const v36Path = resolve(root, 'docs/architecture/process-ownership-v36.json');
const v36Bytes = await readFile(v36Path);
const v36 = JSON.parse(v36Bytes);
const v37 = JSON.parse(
  await readFile(resolve(root, 'docs/architecture/process-ownership-v37.json'), 'utf8'),
);

const hashFile = async (path) =>
  createHash('sha256').update(await readFile(resolve(root, path))).digest('hex');

test('accepted process ownership v37 is hash-bound to immutable accepted v36', () => {
  const digest = createHash('sha256').update(v36Bytes).digest('hex');
  assert.equal(digest, '3113333bd03ede0701aa080be1cf38fdbfbe30de375272a03f352f2fb4f56d05');
  assert.equal(v36.status, 'ACCEPTED');
  assert.equal(v37.schema_version, 37);
  assert.equal(v37.status, 'ACCEPTED');
  assert.deepEqual(v37.supersedes, {
    path: 'docs/architecture/process-ownership-v36.json',
    sha256: digest,
  });
  assert.deepEqual(v37.accepted_adrs, v36.accepted_adrs);
});

test('v37 binds only the explicitly authorized governance-maintenance files', async () => {
  assert.deepEqual(
    v37.governance_maintenance_files.map(({ path }) => path),
    [
      'tests/architecture/process-ownership.test.mjs',
      'tests/architecture/process-ownership-v16.test.mjs',
      'tests/architecture/process-ownership-v17.test.mjs',
      'tests/architecture/process-ownership-v19.test.mjs',
      'tests/architecture/process-ownership-v20.test.mjs',
      'tests/architecture/process-ownership-v21.test.mjs',
      'tests/architecture/process-ownership-v22.test.mjs',
      'tests/architecture/process-ownership-v23.test.mjs',
      'tests/architecture/process-ownership-v24.test.mjs',
      'tests/architecture/process-ownership-v25.test.mjs',
      'tests/architecture/process-ownership-v26.test.mjs',
      'tests/architecture/process-ownership-v27.test.mjs',
      'tests/architecture/process-ownership-v28.test.mjs',
      'tests/architecture/process-ownership-v29.test.mjs',
      'tests/architecture/process-ownership-v30.test.mjs',
      'tests/architecture/process-ownership-v31.test.mjs',
      'tests/architecture/process-ownership-v32.test.mjs',
      'tests/architecture/process-ownership-v34.test.mjs',
      'tests/architecture/process-ownership-v35.test.mjs',
      'tests/architecture/process-ownership-v36.test.mjs',
      'tests/architecture/process-ownership-v37.test.mjs',
      'tests/security/p3-watchdog-launch-agent-packaging-candidate.test.mjs',
      'tests/security/p3-watchdog-launch-agent-plist-candidate.test.mjs',
      'tests/security/p3-watchdog-named-service-packaging-candidate.test.mjs',
    ],
  );
  for (const file of v37.governance_maintenance_files) {
    assert.equal(await hashFile(file.path), successors.expected(file.path, file.sha256), file.path);
  }
});

test('v37 changes only Main and status-addon proof acceptance fields plus five invariants', () => {
  assert.deepEqual(
    v37.source_boundaries.filter(({ id }) => id !== 'main'),
    v36.source_boundaries.filter(({ id }) => id !== 'main'),
  );
  assert.deepEqual(
    v37.native_helpers.filter(({ id }) => id !== 'service-management-status-addon'),
    v36.native_helpers.filter(({ id }) => id !== 'service-management-status-addon'),
  );

  const mainFields = new Set([
    'service_management_status_physical_proof_candidate_authority',
    'service_management_status_physical_proof_entry_implementation_authority',
    'service_management_status_physical_proof_production_entry_change_authority',
    'service_management_status_physical_proof_application_reachable',
    'service_management_status_physical_proof_native_module_load_authority',
    'service_management_status_physical_proof_status_call_authority',
    'service_management_status_physical_proof_renderer_exposure_authority',
    'service_management_status_physical_proof_allowed_external_imports',
    'service_management_status_physical_proof_proposed_files',
  ]);
  const beforeMain = v36.source_boundaries.find(({ id }) => id === 'main');
  const afterMain = v37.source_boundaries.find(({ id }) => id === 'main');
  assert.deepEqual(
    Object.fromEntries(Object.entries(afterMain).filter(([key]) => !mainFields.has(key))),
    beforeMain,
  );

  const beforeAddon = v36.native_helpers.find(
    ({ id }) => id === 'service-management-status-addon',
  );
  const afterAddon = v37.native_helpers.find(
    ({ id }) => id === 'service-management-status-addon',
  );
  const physicalFields = new Set(
    Object.keys(afterAddon).filter((key) => key.startsWith('physical_proof_')),
  );
  for (const field of [
    'owner_authorized_physical_proof_package_signing',
    'owner_authorized_physical_proof_app_launch',
    'owner_authorized_physical_proof_module_load',
    'owner_authorized_physical_proof_single_status_call',
  ]) {
    physicalFields.add(field);
  }
  assert.deepEqual(
    Object.fromEntries(Object.entries(afterAddon).filter(([key]) => !physicalFields.has(key))),
    beforeAddon,
  );
  assert.equal(v37.invariants.length, v36.invariants.length + 5);
  assert.deepEqual(v37.invariants.slice(0, -5), v36.invariants);
});

test('v37 fixes a dedicated one-shot proof bundle and bounded result contract', () => {
  const main = v37.source_boundaries.find(({ id }) => id === 'main');
  const addon = v37.native_helpers.find(({ id }) => id === 'service-management-status-addon');
  assert.equal(
    main.service_management_status_physical_proof_candidate_authority,
    'ACCEPTED_DEDICATED_TEST_BUNDLE_ENTRY_ONLY',
  );
  assert.equal(
    addon.physical_proof_candidate_authority,
    'ACCEPTED_OWNER_GATED_SIGNED_APP_SINGLE_STATUS_OBSERVATION_ONLY',
  );
  assert.equal(addon.physical_proof_design, 'DEDICATED_NO_WINDOW_ONE_SHOT_ELECTRON_MAIN_TEST_BUNDLE');
  assert.equal(addon.physical_proof_package_mode_argument, '--signed-app-service-management-status-proof-fixture');
  assert.deepEqual(addon.physical_proof_inputs, []);
  assert.deepEqual(addon.physical_proof_outputs, [
    'NOT_REGISTERED',
    'ENABLED',
    'REQUIRES_APPROVAL',
    'NOT_FOUND',
  ]);
  assert.equal(addon.physical_proof_failure_observation, 'NOT_FOUND');
  assert.equal(
    addon.physical_proof_result_protocol,
    'DOSAI_SERVICE_MANAGEMENT_STATUS_PROOF_V1:<OBSERVATION>',
  );
  assert.equal(addon.physical_proof_result_count, 1);
  assert.equal(addon.physical_proof_attempt_limit, 1);
  assert.equal(addon.physical_proof_timeout_ms, 15_000);
});

test('v37 retains every unchanged accepted input and exact v36 package evidence', async () => {
  const addon = v37.native_helpers.find(({ id }) => id === 'service-management-status-addon');
  const implementationPreimages = new Set([
    'scripts/build.mjs',
    'scripts/package.mjs',
    'vite.main.config.ts',
  ]);
  for (const file of addon.physical_proof_immutable_inputs) {
    if (implementationPreimages.has(file.path)) {
      continue;
    }
    assert.equal(await hashFile(file.path), file.sha256, file.path);
  }

  const baseline = addon.physical_proof_retained_package_baseline;
  const appPath = resolve(root, baseline.app_path);
  for (const [path, digest] of [
    ['Contents/Resources/dosai-service-management-status.node', baseline.addon_sha256],
    ['Contents/Library/LaunchServices/com.socialeap.dosai.execution-service-fixture', baseline.named_service_sha256],
    ['Contents/Library/LaunchAgents/com.socialeap.dosai.execution-service-fixture.plist', baseline.launch_agent_plist_sha256],
    ['Contents/MacOS/DOSAI', baseline.outer_executable_sha256],
    ['Contents/Info.plist', baseline.info_plist_sha256],
    ['Contents/Resources/app.asar', baseline.app_asar_sha256],
  ]) {
    assert.equal(await hashFile(resolve(appPath, path)), digest, path);
  }
  assert.equal(baseline.module_loaded_observed, false);
  assert.equal(baseline.status_call_observed, false);
});

test('v37 binds the accepted source-only implementation to exact postimages', async () => {
  const addon = v37.native_helpers.find(({ id }) => id === 'service-management-status-addon');
  const expectedPaths = [
    'src/main/execution/service-management-status-proof-entry.ts',
    'scripts/build.mjs',
    'scripts/package.mjs',
    'scripts/service-management-status-proof.mjs',
    'vite.main.config.ts',
    'tests/security/p3-service-management-status-addon-physical-proof-candidate.test.mjs',
  ];
  assert.deepEqual(addon.physical_proof_proposed_files, expectedPaths);
  assert.equal(addon.physical_proof_source_implementation_observed, true);
  assert.equal(addon.physical_proof_entry_source_observed, true);
  assert.equal(addon.physical_proof_build_selection_source_observed, true);
  assert.equal(addon.physical_proof_package_mode_source_observed, true);
  assert.equal(addon.physical_proof_audit_runner_source_observed, true);
  assert.equal(addon.physical_proof_adversarial_test_observed, true);
  assert.deepEqual(
    addon.physical_proof_implemented_files.map(({ path }) => path),
    expectedPaths,
  );
  for (const file of addon.physical_proof_implemented_files) {
    assert.equal(await hashFile(file.path), file.sha256, file.path);
  }
  for (const path of ['scripts/build.mjs', 'scripts/package.mjs', 'vite.main.config.ts']) {
    const immutable = addon.physical_proof_immutable_inputs.find((file) => file.path === path);
    assert.ok(immutable, path);
    assert.notEqual(await hashFile(path), immutable.sha256, path);
  }
});

test('v37 grants no physical action, lifecycle, renderer, or production authority', () => {
  const main = v37.source_boundaries.find(({ id }) => id === 'main');
  const addon = v37.native_helpers.find(({ id }) => id === 'service-management-status-addon');
  for (const field of [
    'service_management_status_physical_proof_production_entry_change_authority',
    'service_management_status_physical_proof_application_reachable',
    'service_management_status_physical_proof_native_module_load_authority',
    'service_management_status_physical_proof_status_call_authority',
    'service_management_status_physical_proof_renderer_exposure_authority',
  ]) {
    assert.equal(main[field], false, field);
  }
  for (const field of [
    'physical_proof_package_build_authority',
    'physical_proof_app_launch_authority',
    'physical_proof_native_module_load_authority',
    'physical_proof_status_call_authority',
    'physical_proof_service_management_runtime_call_authority',
    'owner_authorized_physical_proof_package_signing',
    'owner_authorized_physical_proof_app_launch',
    'owner_authorized_physical_proof_module_load',
    'owner_authorized_physical_proof_single_status_call',
    'physical_proof_window_creation_authority',
    'physical_proof_normal_main_entry_change_authority',
    'physical_proof_preload_or_renderer_authority',
    'physical_proof_registration_authority',
    'physical_proof_unregistration_authority',
    'physical_proof_open_system_settings_authority',
    'physical_proof_service_launch_authority',
    'physical_proof_application_connection_authority',
    'physical_proof_process_targeting_authority',
    'physical_proof_network_authority',
    'physical_proof_xpc_authority',
    'physical_proof_journal_authority',
    'physical_proof_reconciliation_authority',
    'physical_proof_vm_authority',
    'physical_proof_execution_authority',
    'physical_proof_production_authority',
    'physical_proof_entry_observed',
    'physical_proof_package_mode_observed',
    'physical_proof_package_build_observed',
    'physical_proof_signing_observed',
    'physical_proof_app_launch_observed',
    'physical_proof_native_module_load_observed',
    'physical_proof_status_call_observed',
    'physical_proof_runtime_observation_observed',
    'physical_proof_registration_observed',
    'physical_proof_service_launch_observed',
    'physical_proof_application_connection_observed',
  ]) {
    assert.equal(addon[field], false, field);
  }
  assert.equal(addon.physical_proof_signing_authority, 'OWNER_AUTHORIZATION_REQUIRED');
});
