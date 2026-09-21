import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import { loadLifecycleCompositionSuccessor } from './p3-lifecycle-composition-successor.mjs';

const root = resolve(import.meta.dirname, '../..');
const lifecycleSuccessor = await loadLifecycleCompositionSuccessor(root);
const v33Path = resolve(root, 'docs/architecture/process-ownership-v33.json');
const v33Bytes = await readFile(v33Path);
const v33 = JSON.parse(v33Bytes);
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

test('accepted process ownership v34 is hash-bound to immutable accepted v33', () => {
  const digest = createHash('sha256').update(v33Bytes).digest('hex');
  assert.equal(digest, '33163e6dac6729534aeac63b2b7ddc565c646093d4e271751ba4a98a1d8d46ae');
  assert.equal(v33.status, 'ACCEPTED');
  assert.equal(v34.schema_version, 34);
  assert.equal(v34.status, 'ACCEPTED');
  assert.deepEqual(v34.supersedes, {
    path: 'docs/architecture/process-ownership-v33.json',
    sha256: digest,
  });
  assert.deepEqual(v34.accepted_adrs, v33.accepted_adrs);
});

test('v34 changes only exact addon compile evidence and the final five invariants', () => {
  assert.deepEqual(v34.source_boundaries, v33.source_boundaries);
  assert.deepEqual(
    v34.native_helpers.filter(({ id }) => id !== 'service-management-status-addon'),
    v33.native_helpers.filter(({ id }) => id !== 'service-management-status-addon'),
  );

  const before = v33.native_helpers.find(({ id }) => id === 'service-management-status-addon');
  const after = v34.native_helpers.find(({ id }) => id === 'service-management-status-addon');
  const evidenceFields = new Set([
    'runtime',
    'implementation_state',
    'authority',
    'node_api_header_root_resolution',
    'node_api_header_hashes_observed',
    'canonical_node_layout_enforced_observed',
    'shim_missing_headers_rejected_observed',
    'node_api_version_source_observed',
    'native_compile_observed',
    'native_link_observed',
    'temporary_unsigned_bundle_output_observed',
    'temporary_unsigned_bundle_persisted_observed',
    'target_architecture_observed',
    'minimum_macos_observed',
    'service_management_framework_link_observed',
    'forbidden_framework_link_observed',
    'node_api_initializer_exports_observed',
    'bounded_node_api_symbols_observed',
    'adjacent_node_abi_symbols_observed',
    'adhoc_signature_observed',
    'compile_proof_attempt_count',
    'compile_proof_complete_evidence_run_count',
    'compile_proof_discarded_attempts',
    'compile_proof_implemented_files',
    'compile_proof_guard_remediations',
  ]);
  assert.deepEqual(
    Object.fromEntries(Object.entries(after).filter(([key]) => !evidenceFields.has(key))),
    Object.fromEntries(Object.entries(before).filter(([key]) => !evidenceFields.has(key))),
  );
  assert.equal(v34.invariants.length, v33.invariants.length);
  assert.deepEqual(v34.invariants.slice(0, -5), v33.invariants.slice(0, -5));
});

test('v34 hash-binds the exact compile implementation and successor-aware guards', async () => {
  const addon = v34.native_helpers.find(({ id }) => id === 'service-management-status-addon');
  assert.deepEqual(
    addon.compile_proof_implemented_files.map(({ path }) => path),
    addon.compile_proof_proposed_files,
  );
  assert.deepEqual(
    addon.compile_proof_guard_remediations.map(({ path }) => path),
    [
      'tests/architecture/process-ownership-v31.test.mjs',
      'tests/architecture/process-ownership-v32.test.mjs',
      'tests/architecture/process-ownership-v33.test.mjs',
    ],
  );
  const successorFiles = new Map(
    [
      ...v36.native_helpers.find(({ id }) => id === 'service-management-status-addon')
        .static_package_guard_remediations,
      ...v37.governance_maintenance_files,
    ]
      .map((file) => [file.path, file.sha256]),
  );
  for (const file of [
    ...addon.compile_proof_implemented_files,
    ...addon.compile_proof_guard_remediations,
  ]) {
    assert.equal(
      await hashFile(file.path),
      lifecycleSuccessor.expected(file.path, successorFiles.get(file.path) ?? file.sha256),
      file.path,
    );
  }
});

test('v34 records the bounded compile, inspection, cleanup, and discarded-attempt evidence', () => {
  const addon = v34.native_helpers.find(({ id }) => id === 'service-management-status-addon');
  assert.equal(addon.runtime, 'COMPILE_PROVEN_SOURCE_ONLY');
  assert.equal(addon.implementation_state, 'ACTIVE_COMPILE_PROVEN_SOURCE_ONLY');
  assert.equal(
    addon.authority,
    'IMPLEMENTED_PINNED_NODE_API_V8_TEMPORARY_UNSIGNED_COMPILE_PROOF',
  );
  for (const field of [
    'node_api_header_hashes_observed',
    'canonical_node_layout_enforced_observed',
    'shim_missing_headers_rejected_observed',
    'native_compile_observed',
    'native_link_observed',
    'temporary_unsigned_bundle_output_observed',
    'service_management_framework_link_observed',
    'node_api_initializer_exports_observed',
  ]) {
    assert.equal(addon[field], true, field);
  }
  assert.equal(addon.node_api_version_source_observed, 8);
  assert.equal(addon.target_architecture_observed, 'arm64');
  assert.equal(addon.minimum_macos_observed, '15.0');
  assert.deepEqual(addon.bounded_node_api_symbols_observed, [
    'napi_create_string_utf8',
    'napi_create_function',
    'napi_set_named_property',
    'napi_get_undefined',
  ]);
  for (const field of [
    'temporary_unsigned_bundle_persisted_observed',
    'forbidden_framework_link_observed',
    'adjacent_node_abi_symbols_observed',
    'adhoc_signature_observed',
  ]) {
    assert.equal(addon[field], false, field);
  }
  assert.equal(addon.compile_proof_attempt_count, 2);
  assert.equal(addon.compile_proof_complete_evidence_run_count, 1);
  assert.equal(addon.compile_proof_discarded_attempts.length, 1);
  assert.equal(
    addon.compile_proof_discarded_attempts[0].kind,
    'OVERBROAD_STATIC_INCLUDE_ASSERTION',
  );
  assert.equal(addon.compile_proof_discarded_attempts[0].runtime_effects_observed, false);
  assert.equal(addon.compile_proof_discarded_attempts[0].bundle_persisted_observed, false);
});

test('v34 preserves preimages and every runtime, lifecycle, and adjacent denial', async () => {
  const before = v33.native_helpers.find(({ id }) => id === 'service-management-status-addon');
  const after = v34.native_helpers.find(({ id }) => id === 'service-management-status-addon');
  const successorFiles = new Map(
    after.compile_proof_implemented_files.map((file) => [file.path, file.sha256]),
  );
  for (const file of before.compile_proof_immutable_inputs) {
    const digest = await hashFile(file.path);
    const successorDigest = successorFiles.get(file.path);
    assert.equal(digest, successorDigest ?? file.sha256, file.path);
  }
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
    'node_api_header_acquisition_authority',
    'dependency_change_authority',
    'electron_header_download_authority',
    'electron_rebuild_dependency_authority',
    'node_gyp_dependency_authority',
    'node_cpp_v8_libuv_header_authority',
    'compile_proof_network_authority',
    'compile_proof_module_load_authority',
    'compile_proof_invocation_authority',
    'temporary_unsigned_bundle_persistence_authority',
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
    assert.equal(after[field], false, field);
  }
});
