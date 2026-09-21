import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

import { loadGuardSuccessors } from './p3-guard-successor.mjs';

const root = resolve(import.meta.dirname, '../..');
const successors = await loadGuardSuccessors(root);
const v35Path = resolve(root, 'docs/architecture/process-ownership-v35.json');
const v35Bytes = await readFile(v35Path);
const v35 = JSON.parse(v35Bytes);
const v36 = JSON.parse(
  await readFile(resolve(root, 'docs/architecture/process-ownership-v36.json'), 'utf8'),
);
const v37 = JSON.parse(
  await readFile(resolve(root, 'docs/architecture/process-ownership-v37.json'), 'utf8'),
);

const hashFile = async (path) =>
  createHash('sha256').update(await readFile(resolve(root, path))).digest('hex');

test('accepted process ownership v36 is hash-bound to immutable accepted v35', () => {
  const digest = createHash('sha256').update(v35Bytes).digest('hex');
  assert.equal(digest, '90c5351dea1f3bb2f3c2b593d838755440bd31a7e2aa1eff299e95d3d9ad556d');
  assert.equal(v35.status, 'ACCEPTED');
  assert.equal(v36.schema_version, 36);
  assert.equal(v36.status, 'ACCEPTED');
  assert.deepEqual(v36.supersedes, {
    path: 'docs/architecture/process-ownership-v35.json',
    sha256: digest,
  });
  assert.deepEqual(v36.accepted_adrs, v35.accepted_adrs);
});

test('v36 changes only status-addon package evidence and the final five invariants', () => {
  assert.deepEqual(v36.source_boundaries, v35.source_boundaries);
  assert.deepEqual(
    v36.native_helpers.filter(({ id }) => id !== 'service-management-status-addon'),
    v35.native_helpers.filter(({ id }) => id !== 'service-management-status-addon'),
  );

  const before = v35.native_helpers.find(({ id }) => id === 'service-management-status-addon');
  const after = v36.native_helpers.find(({ id }) => id === 'service-management-status-addon');
  const evidenceFields = new Set([
    'runtime',
    'implementation_state',
    'authority',
    'bounded_node_api_symbols_observed',
    'implemented_files',
    'v34_bounded_node_api_symbol_record_discrepancy_acknowledged',
    'v34_bounded_node_api_symbol_recorded_value',
    'v34_bounded_node_api_symbol_observed_value',
    'v34_source_snapshot_discrepancy_acknowledged',
    'static_package_candidate_authority',
    'static_package_build_helper_observed',
    'static_package_script_change_observed',
    'static_package_build_observed',
    'static_package_addon_copy_observed',
    'static_package_addon_signature_observed',
    'static_package_outer_signature_observed',
    'static_package_designated_requirements_observed',
    'static_package_exact_layout_observed',
    'static_package_package_script_invocation_observed',
    'static_package_signing_identity_lookup_observed',
    'static_package_team_identifier_observed',
    'static_package_addon_identifier_observed',
    'static_package_outer_identifier_observed',
    'static_package_architecture_observed',
    'static_package_minimum_macos_observed',
    'static_package_service_management_link_observed',
    'static_package_forbidden_framework_observed',
    'static_package_node_api_initializer_exports_observed',
    'static_package_adjacent_node_abi_observed',
    'static_package_attempt_count',
    'static_package_complete_evidence_run_count',
    'static_package_discarded_attempts',
    'static_package_output_path',
    'static_package_addon_sha256',
    'static_package_named_service_sha256',
    'static_package_launch_agent_plist_sha256',
    'static_package_outer_executable_sha256',
    'static_package_info_plist_sha256',
    'static_package_app_asar_sha256',
    'static_package_addon_cdhash',
    'static_package_named_service_cdhash',
    'static_package_outer_cdhash',
    'static_package_implemented_files',
    'static_package_guard_remediations',
  ]);
  assert.deepEqual(
    Object.fromEntries(Object.entries(after).filter(([key]) => !evidenceFields.has(key))),
    Object.fromEntries(Object.entries(before).filter(([key]) => !evidenceFields.has(key))),
  );
  assert.equal(v36.invariants.length, v35.invariants.length);
  assert.deepEqual(v36.invariants.slice(0, -5), v35.invariants.slice(0, -5));
});

test('v36 hash-binds exact implementation and successor-aware guard postimages', async () => {
  const addon = v36.native_helpers.find(({ id }) => id === 'service-management-status-addon');
  const v37Addon = v37.native_helpers.find(
    ({ id }) => id === 'service-management-status-addon',
  );
  assert.equal(v37.status, 'ACCEPTED');
  assert.ok(v37Addon);
  const v37PackageScript = v37Addon.physical_proof_implemented_files.find(
    ({ path }) => path === 'scripts/package.mjs',
  );
  assert.ok(v37PackageScript);
  const v37GovernanceFiles = new Map(
    v37.governance_maintenance_files.map((file) => [file.path, successors.expected(file.path, file.sha256)]),
  );
  assert.deepEqual(
    addon.static_package_implemented_files.map(({ path }) => path),
    addon.static_package_proposed_files,
  );
  assert.equal(addon.static_package_guard_remediations.length, 23);
  for (const file of [
    ...addon.static_package_implemented_files,
    ...addon.static_package_guard_remediations,
  ]) {
    const observedHash = await hashFile(file.path);
    if (observedHash === file.sha256) {
      continue;
    }
    const successorHash = v37GovernanceFiles.get(file.path);
    if (successorHash !== undefined) {
      assert.equal(observedHash, successorHash, file.path);
      continue;
    }
    assert.equal(file.path, 'scripts/package.mjs');
    assert.equal(observedHash, successors.expected(file.path, v37PackageScript.sha256));
  }
});

test('v36 records exact signed static package and inspection evidence', () => {
  const addon = v36.native_helpers.find(({ id }) => id === 'service-management-status-addon');
  assert.equal(addon.runtime, 'SIGNED_STATIC_PACKAGE_NO_LOAD');
  assert.equal(addon.implementation_state, 'ACTIVE_SIGNED_STATIC_PACKAGE_NO_LOAD');
  assert.equal(
    addon.authority,
    'IMPLEMENTED_OWNER_GATED_SIGNED_STATIC_TEST_PACKAGE_ONLY',
  );
  assert.equal(addon.static_package_candidate_authority, addon.authority);
  for (const field of [
    'static_package_build_helper_observed',
    'static_package_script_change_observed',
    'static_package_build_observed',
    'static_package_addon_copy_observed',
    'static_package_addon_signature_observed',
    'static_package_outer_signature_observed',
    'static_package_designated_requirements_observed',
    'static_package_exact_layout_observed',
    'static_package_package_script_invocation_observed',
    'static_package_service_management_link_observed',
    'static_package_node_api_initializer_exports_observed',
  ]) {
    assert.equal(addon[field], true, field);
  }
  assert.equal(addon.static_package_team_identifier_observed, '3RD3TADLRY');
  assert.equal(
    addon.static_package_addon_identifier_observed,
    'com.socialeap.dosai.service-management-status-addon',
  );
  assert.equal(addon.static_package_outer_identifier_observed, 'com.socialeap.dosai');
  assert.equal(addon.static_package_architecture_observed, 'arm64');
  assert.equal(addon.static_package_minimum_macos_observed, '15.0');
  assert.equal(addon.static_package_attempt_count, 2);
  assert.equal(addon.static_package_complete_evidence_run_count, 1);
  assert.equal(addon.static_package_discarded_attempts.length, 1);
  assert.equal(
    addon.static_package_discarded_attempts[0].kind,
    'OVERBROAD_NODE_API_SYMBOL_CLASSIFICATION',
  );
  assert.equal(addon.static_package_discarded_attempts[0].module_load_observed, false);
  assert.deepEqual(addon.bounded_node_api_symbols_observed, [
    'napi_create_function',
    'napi_create_string_utf8',
    'napi_get_cb_info',
    'napi_set_named_property',
  ]);
  assert.equal(addon.v34_bounded_node_api_symbol_record_discrepancy_acknowledged, true);
  assert.equal(addon.v34_source_snapshot_discrepancy_acknowledged, true);
});

test('v36 preserves every runtime, lifecycle, and adjacent-effect denial', () => {
  const addon = v36.native_helpers.find(({ id }) => id === 'service-management-status-addon');
  for (const field of [
    'application_reachable',
    'native_module_load_authority',
    'invocation_authority',
    'service_management_runtime_call_authority',
    'registration_authority',
    'unregistration_authority',
    'open_system_settings_authority',
    'launchctl_authority',
    'service_launch_authority',
    'application_connection_authority',
    'renderer_exposure_authority',
    'generic_native_dispatch_authority',
    'process_launch_authority',
    'filesystem_authority',
    'network_authority',
    'xpc_authority',
    'journal_authority',
    'reconciliation_authority',
    'vm_authority',
    'execution_authority',
    'production_authority',
    'static_package_addon_load_observed',
    'static_package_addon_invocation_observed',
    'static_package_status_call_observed',
    'static_package_app_invocation_observed',
    'static_package_service_invocation_observed',
    'static_package_registration_observed',
    'static_package_unregistration_observed',
    'static_package_open_system_settings_observed',
    'static_package_launch_observed',
    'static_package_application_connection_observed',
    'static_package_forbidden_framework_observed',
    'static_package_adjacent_node_abi_observed',
  ]) {
    assert.equal(addon[field], false, field);
  }
});
