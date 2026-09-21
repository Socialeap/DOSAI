import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import { loadLifecycleCompositionSuccessor } from './p3-lifecycle-composition-successor.mjs';

const root = resolve(import.meta.dirname, '../..');
const lifecycleSuccessor = await loadLifecycleCompositionSuccessor(root);
const v31Path = resolve(root, 'docs/architecture/process-ownership-v31.json');
const v31Bytes = await readFile(v31Path);
const v31 = JSON.parse(v31Bytes);
const v32 = JSON.parse(
  await readFile(resolve(root, 'docs/architecture/process-ownership-v32.json'), 'utf8'),
);
const v34 = JSON.parse(
  await readFile(resolve(root, 'docs/architecture/process-ownership-v34.json'), 'utf8'),
);
const v36 = JSON.parse(
  await readFile(resolve(root, 'docs/architecture/process-ownership-v36.json'), 'utf8'),
);
const v37 = JSON.parse(
  await readFile(resolve(root, 'docs/architecture/process-ownership-v37.json'), 'utf8'),
);

const hashFile = async (path) =>
  createHash('sha256').update(await readFile(resolve(root, path))).digest('hex');

test('accepted process ownership v32 is hash-bound to immutable accepted v31', () => {
  const digest = createHash('sha256').update(v31Bytes).digest('hex');
  assert.equal(digest, '0472c00fa8bcfb733cde7a3c65327323943dd5dc4b84c18857468dcff8985de1');
  assert.equal(v31.status, 'ACCEPTED');
  assert.equal(v32.schema_version, 32);
  assert.equal(v32.status, 'ACCEPTED');
  assert.deepEqual(v32.supersedes, {
    path: 'docs/architecture/process-ownership-v31.json',
    sha256: digest,
  });
  assert.deepEqual(v32.accepted_adrs, v31.accepted_adrs);
});

test('v32 changes only Main and native-addon implementation evidence plus invariants', () => {
  const beforeMain = v31.source_boundaries.find(({ id }) => id === 'main');
  const afterMain = v32.source_boundaries.find(({ id }) => id === 'main');
  const mainEvidenceFields = new Set([
    'service_management_status_adapter_authority',
    'service_management_status_adapter_source_observed',
    'service_management_status_adapter_injected_binding_only_observed',
    'service_management_status_adapter_zero_argument_call_observed',
    'service_management_status_adapter_exact_output_admission_observed',
    'service_management_status_adapter_unknown_and_error_fail_closed_observed',
    'service_management_status_adapter_accessor_safe_observed',
    'service_management_status_adapter_native_module_load_observed',
    'service_management_status_adapter_runtime_status_observed',
    'service_management_status_adapter_implemented_files',
  ]);
  assert.deepEqual(
    v32.source_boundaries.filter(({ id }) => id !== 'main'),
    v31.source_boundaries.filter(({ id }) => id !== 'main'),
  );
  assert.deepEqual(
    Object.fromEntries(Object.entries(afterMain).filter(([key]) => !mainEvidenceFields.has(key))),
    Object.fromEntries(Object.entries(beforeMain).filter(([key]) => !mainEvidenceFields.has(key))),
  );

  const beforeAddon = v31.native_helpers.find(
    ({ id }) => id === 'service-management-status-addon',
  );
  const afterAddon = v32.native_helpers.find(
    ({ id }) => id === 'service-management-status-addon',
  );
  const addonEvidenceFields = new Set([
    'runtime',
    'implementation_state',
    'authority',
    'source_observed',
    'node_api_single_export_observed',
    'fixed_plist_mapping_observed',
    'unknown_and_exception_fail_closed_observed',
    'zero_argument_rejection_observed',
    'lifecycle_api_absence_observed',
    'native_compile_observed',
    'native_link_observed',
    'executable_output_observed',
    'native_module_load_observed',
    'service_management_runtime_call_observed',
    'runtime_status_observed',
    'registration_observed',
    'unregistration_observed',
    'open_system_settings_observed',
    'service_launch_observed',
    'application_connection_observed',
    'implemented_files',
    'guard_remediations',
  ]);
  assert.deepEqual(
    v32.native_helpers.filter(({ id }) => id !== 'service-management-status-addon'),
    v31.native_helpers.filter(({ id }) => id !== 'service-management-status-addon'),
  );
  assert.deepEqual(
    Object.fromEntries(Object.entries(afterAddon).filter(([key]) => !addonEvidenceFields.has(key))),
    Object.fromEntries(Object.entries(beforeAddon).filter(([key]) => !addonEvidenceFields.has(key))),
  );

  assert.equal(v32.invariants.length, v31.invariants.length);
  assert.deepEqual(v32.invariants.slice(0, -5), v31.invariants.slice(0, -5));
});

test('v32 binds the source-only native and injection-only Main implementation with an exact v34 source successor', async () => {
  const main = v32.source_boundaries.find(({ id }) => id === 'main');
  assert.equal(
    main.service_management_status_adapter_authority,
    'IMPLEMENTED_SOURCE_ONLY_INJECTED_ZERO_INPUT_OBSERVATION_ADAPTER',
  );
  for (const field of [
    'service_management_status_adapter_source_observed',
    'service_management_status_adapter_injected_binding_only_observed',
    'service_management_status_adapter_zero_argument_call_observed',
    'service_management_status_adapter_exact_output_admission_observed',
    'service_management_status_adapter_unknown_and_error_fail_closed_observed',
    'service_management_status_adapter_accessor_safe_observed',
  ]) {
    assert.equal(main[field], true, field);
  }
  assert.equal(main.service_management_status_adapter_native_module_load_observed, false);
  assert.equal(main.service_management_status_adapter_runtime_status_observed, false);
  assert.deepEqual(
    main.service_management_status_adapter_implemented_files.map(({ path }) => path),
    main.service_management_status_adapter_proposed_files,
  );

  const addon = v32.native_helpers.find(({ id }) => id === 'service-management-status-addon');
  assert.equal(addon.runtime, 'NOT_COMPILED_SOURCE_ONLY');
  assert.equal(addon.implementation_state, 'ACTIVE_SOURCE_ONLY');
  assert.equal(
    addon.authority,
    'IMPLEMENTED_SOURCE_ONLY_FIXED_STATUS_OBSERVATION_NO_BUILD_OR_RUNTIME',
  );
  for (const field of [
    'source_observed',
    'node_api_single_export_observed',
    'fixed_plist_mapping_observed',
    'unknown_and_exception_fail_closed_observed',
    'zero_argument_rejection_observed',
    'lifecycle_api_absence_observed',
  ]) {
    assert.equal(addon[field], true, field);
  }
  assert.deepEqual(addon.implemented_files.map(({ path }) => path), addon.proposed_files);
  assert.equal(addon.guard_remediations.length, 2);
  const v34Addon = v34.native_helpers.find(
    ({ id }) => id === 'service-management-status-addon',
  );
  const successorFiles = new Map(
    v34Addon.compile_proof_implemented_files.map((file) => [file.path, file.sha256]),
  );
  const successorGuards = new Map(
    [
      ...v34Addon.compile_proof_guard_remediations,
      ...v36.native_helpers.find(({ id }) => id === 'service-management-status-addon')
        .static_package_guard_remediations,
      ...v37.native_helpers.find(({ id }) => id === 'service-management-status-addon')
        .physical_proof_implemented_files,
      ...v37.governance_maintenance_files,
    ].map((file) => [file.path, file.sha256]),
  );
  for (const file of addon.implemented_files) {
    const currentDigest = await hashFile(file.path);
    const successorDigest = successorFiles.get(file.path);
    if (successorDigest) {
      assert.notEqual(currentDigest, file.sha256, file.path);
      assert.equal(
        currentDigest,
        lifecycleSuccessor.expected(file.path, successorDigest),
        file.path,
      );
    } else {
      assert.equal(
        currentDigest,
        lifecycleSuccessor.expected(file.path, file.sha256),
        file.path,
      );
    }
  }
  for (const file of addon.guard_remediations) {
    assert.equal(
      await hashFile(file.path),
      lifecycleSuccessor.expected(file.path, successorGuards.get(file.path) ?? file.sha256),
      file.path,
    );
  }
});

test('v32 preserves every build, runtime, lifecycle, and adjacent authority denial', () => {
  const main = v32.source_boundaries.find(({ id }) => id === 'main');
  assert.equal(main.service_management_status_adapter_application_reachable, false);
  assert.equal(main.service_management_status_adapter_native_module_load_authority, false);
  assert.equal(main.service_management_status_adapter_renderer_exposure_authority, false);

  const addon = v32.native_helpers.find(({ id }) => id === 'service-management-status-addon');
  for (const field of [
    'application_reachable',
    'native_module_load_authority',
    'native_compile_authority',
    'native_link_authority',
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
    'node_api_header_acquisition_authority',
    'dependency_change_authority',
  ]) {
    assert.equal(addon[field], false, field);
  }
  for (const field of [
    'native_compile_observed',
    'native_link_observed',
    'executable_output_observed',
    'native_module_load_observed',
    'service_management_runtime_call_observed',
    'runtime_status_observed',
    'registration_observed',
    'unregistration_observed',
    'open_system_settings_observed',
    'service_launch_observed',
    'application_connection_observed',
  ]) {
    assert.equal(addon[field], false, field);
  }
});

test('v32 preserves every accepted immutable adapter input', async () => {
  const before = v31.native_helpers.find(({ id }) => id === 'service-management-status-addon');
  const after = v32.native_helpers.find(({ id }) => id === 'service-management-status-addon');
  assert.deepEqual(after.immutable_inputs, before.immutable_inputs);
  const successorFiles = new Map(
    [
      ...v36.native_helpers.find(({ id }) => id === 'service-management-status-addon')
        .static_package_implemented_files,
      ...v37.native_helpers.find(({ id }) => id === 'service-management-status-addon')
        .physical_proof_implemented_files,
    ]
      .map((file) => [file.path, file.sha256]),
  );
  for (const file of after.immutable_inputs) {
    assert.equal(
      await hashFile(file.path),
      lifecycleSuccessor.expected(file.path, successorFiles.get(file.path) ?? file.sha256),
      file.path,
    );
  }
});
