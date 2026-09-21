import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import { loadLifecycleCompositionSuccessor } from './p3-lifecycle-composition-successor.mjs';

const root = resolve(import.meta.dirname, '../..');
const lifecycleSuccessor = await loadLifecycleCompositionSuccessor(root);
const v34Path = resolve(root, 'docs/architecture/process-ownership-v34.json');
const v34Bytes = await readFile(v34Path);
const v34 = JSON.parse(v34Bytes);
const v35 = JSON.parse(
  await readFile(resolve(root, 'docs/architecture/process-ownership-v35.json'), 'utf8'),
);
const v36 = JSON.parse(
  await readFile(resolve(root, 'docs/architecture/process-ownership-v36.json'), 'utf8'),
);
const v37 = JSON.parse(
  await readFile(resolve(root, 'docs/architecture/process-ownership-v37.json'), 'utf8'),
);

const hashFile = async (path) =>
  createHash('sha256').update(await readFile(resolve(root, path))).digest('hex');

test('accepted process ownership v35 is hash-bound to immutable accepted v34', () => {
  const digest = createHash('sha256').update(v34Bytes).digest('hex');
  assert.equal(digest, 'fd1468eb7b0780740ccad4f75a476439338780dd367a732750ba80fdec653aea');
  assert.equal(v34.status, 'ACCEPTED');
  assert.equal(v35.schema_version, 35);
  assert.equal(v35.status, 'ACCEPTED');
  assert.deepEqual(v35.supersedes, {
    path: 'docs/architecture/process-ownership-v34.json',
    sha256: digest,
  });
  assert.deepEqual(v35.accepted_adrs, v34.accepted_adrs);
});

test('v35 changes only the status-addon package proposal and five invariants', () => {
  assert.deepEqual(v35.source_boundaries, v34.source_boundaries);
  assert.deepEqual(
    v35.native_helpers.filter(({ id }) => id !== 'service-management-status-addon'),
    v34.native_helpers.filter(({ id }) => id !== 'service-management-status-addon'),
  );
  const before = v34.native_helpers.find(({ id }) => id === 'service-management-status-addon');
  const after = v35.native_helpers.find(({ id }) => id === 'service-management-status-addon');
  const proposalFields = new Set([
    'static_package_candidate_authority',
    'static_package_build_helper_authority',
    'static_package_script_change_authority',
    'static_package_test_authority',
    'static_package_signing_authority',
    'static_package_required_identity_selector',
    'static_package_required_team_identifier',
    'owner_authorized_static_package_addon_signing',
    'owner_authorized_static_package_outer_signing_for_addon',
    'static_package_mode_argument',
    'static_package_outer_app_identifier',
    'static_package_addon_identifier',
    'static_package_addon_name',
    'static_package_addon_relative_path',
    'static_package_named_service_relative_path',
    'static_package_launch_agent_relative_path',
    'static_package_output_scope',
    'static_package_target',
    'static_package_language_standard',
    'static_package_tools',
    'static_package_build_helper_observed',
    'static_package_script_change_observed',
    'static_package_build_observed',
    'static_package_addon_copy_observed',
    'static_package_addon_signature_observed',
    'static_package_outer_signature_observed',
    'static_package_designated_requirements_observed',
    'static_package_exact_layout_observed',
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
    'static_package_proposed_files',
    'static_package_immutable_inputs',
    'static_package_retained_baseline',
  ]);
  assert.deepEqual(
    Object.fromEntries(Object.entries(after).filter(([key]) => !proposalFields.has(key))),
    before,
  );
  assert.equal(v35.invariants.length, v34.invariants.length + 5);
  assert.deepEqual(v35.invariants.slice(0, -5), v34.invariants);
});

test('v35 fixes one complete static package contract with exact owner-authorized test signing', () => {
  const addon = v35.native_helpers.find(({ id }) => id === 'service-management-status-addon');
  assert.equal(
    addon.static_package_candidate_authority,
    'ACCEPTED_OWNER_GATED_SIGNED_STATIC_TEST_PACKAGE_ONLY',
  );
  for (const field of [
    'static_package_build_helper_authority',
    'static_package_script_change_authority',
    'static_package_test_authority',
  ]) {
    assert.equal(addon[field], true, field);
  }
  assert.equal(addon.static_package_signing_authority, 'OWNER_AUTHORIZED_TEST_ONLY');
  assert.equal(addon.owner_authorized_static_package_addon_signing, true);
  assert.equal(addon.owner_authorized_static_package_outer_signing_for_addon, true);
  assert.equal(
    addon.static_package_mode_argument,
    '--static-named-service-launch-agent-status-addon-fixture',
  );
  assert.equal(addon.static_package_outer_app_identifier, 'com.socialeap.dosai');
  assert.equal(
    addon.static_package_addon_identifier,
    'com.socialeap.dosai.service-management-status-addon',
  );
  assert.equal(addon.static_package_addon_name, 'dosai-service-management-status.node');
  assert.equal(
    addon.static_package_addon_relative_path,
    'Contents/Resources/dosai-service-management-status.node',
  );
  assert.equal(addon.static_package_target, 'arm64-apple-macos15.0');
  assert.equal(addon.static_package_language_standard, 'c++20');
  assert.deepEqual(addon.static_package_tools, [
    '/usr/bin/xcrun',
    '/usr/bin/codesign',
    '/usr/bin/lipo',
    '/usr/bin/otool',
    '/usr/bin/nm',
  ]);
});

test('v35 binds accepted inputs while v36 binds the exact signed package successor', async () => {
  const addon = v35.native_helpers.find(({ id }) => id === 'service-management-status-addon');
  const successor = v36.native_helpers.find(({ id }) => id === 'service-management-status-addon');
  const successorFiles = new Map([
    ...successor.static_package_implemented_files,
    ...successor.static_package_guard_remediations,
    ...v37.native_helpers.find(({ id }) => id === 'service-management-status-addon')
      .physical_proof_implemented_files,
    ...v37.governance_maintenance_files,
  ].map((file) => [file.path, file.sha256]));
  for (const file of addon.static_package_immutable_inputs) {
    assert.equal(
      await hashFile(file.path),
      lifecycleSuccessor.expected(file.path, successorFiles.get(file.path) ?? file.sha256),
      file.path,
    );
  }
  assert.deepEqual(addon.static_package_proposed_files, [
    'scripts/service-management-status-addon.mjs',
    'scripts/package.mjs',
    'tests/security/p3-service-management-status-addon-packaging-candidate.test.mjs',
  ]);
  assert.deepEqual(
    successor.static_package_implemented_files.map(({ path }) => path),
    addon.static_package_proposed_files,
  );

  const baseline = addon.static_package_retained_baseline;
  assert.equal(
    await hashFile(
      `${baseline.app_path}/Contents/Library/LaunchServices/com.socialeap.dosai.execution-service-fixture`,
    ),
    successor.static_package_named_service_sha256,
  );
  assert.equal(
    await hashFile(
      `${baseline.app_path}/Contents/Library/LaunchAgents/com.socialeap.dosai.execution-service-fixture.plist`,
    ),
    baseline.launch_agent_plist_sha256,
  );
  assert.equal(
    await hashFile(`${baseline.app_path}/Contents/MacOS/DOSAI`),
    successor.static_package_outer_executable_sha256,
  );
  assert.equal(
    await hashFile(`${baseline.app_path}/Contents/Info.plist`),
    baseline.info_plist_sha256,
  );
  assert.equal(
    await hashFile(`${baseline.app_path}/Contents/Resources/app.asar`),
    baseline.app_asar_sha256,
  );
  assert.equal(baseline.status_addon_present, false);
  assert.equal(
    await hashFile(`${baseline.app_path}/Contents/Resources/dosai-service-management-status.node`),
    successor.static_package_addon_sha256,
  );
});

test('v35 preserves every runtime, lifecycle, and external-effect denial', () => {
  const addon = v35.native_helpers.find(({ id }) => id === 'service-management-status-addon');
  for (const field of [
    'application_reachable',
    'native_module_load_authority',
    'signing_authority',
    'packaging_authority',
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
    'static_package_build_helper_observed',
    'static_package_script_change_observed',
    'static_package_build_observed',
    'static_package_addon_copy_observed',
    'static_package_addon_signature_observed',
    'static_package_outer_signature_observed',
    'static_package_designated_requirements_observed',
    'static_package_exact_layout_observed',
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
  ]) {
    assert.equal(addon[field], false, field);
  }
});
