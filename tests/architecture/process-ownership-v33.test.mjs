import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { access, readFile, realpath } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '../..');
const v32Path = resolve(root, 'docs/architecture/process-ownership-v32.json');
const v32Bytes = await readFile(v32Path);
const v32 = JSON.parse(v32Bytes);
const v33 = JSON.parse(
  await readFile(resolve(root, 'docs/architecture/process-ownership-v33.json'), 'utf8'),
);
const v34 = JSON.parse(
  await readFile(resolve(root, 'docs/architecture/process-ownership-v34.json'), 'utf8'),
);

const hashFile = async (path) =>
  createHash('sha256').update(await readFile(resolve(root, path))).digest('hex');

test('accepted process ownership v33 is hash-bound to immutable accepted v32', () => {
  const digest = createHash('sha256').update(v32Bytes).digest('hex');
  assert.equal(digest, '04ec42d538427cce3bd1ed0b2209dc5e8a94a5d5b35f02a564041936c2f9e23b');
  assert.equal(v32.status, 'ACCEPTED');
  assert.equal(v33.schema_version, 33);
  assert.equal(v33.status, 'ACCEPTED');
  assert.deepEqual(v33.supersedes, {
    path: 'docs/architecture/process-ownership-v32.json',
    sha256: digest,
  });
  assert.deepEqual(v33.accepted_adrs, v32.accepted_adrs);
});

test('v33 changes only the addon compile proposal and governing invariants', () => {
  assert.deepEqual(v33.source_boundaries, v32.source_boundaries);
  assert.deepEqual(
    v33.native_helpers.filter(({ id }) => id !== 'service-management-status-addon'),
    v32.native_helpers.filter(({ id }) => id !== 'service-management-status-addon'),
  );
  const before = v32.native_helpers.find(({ id }) => id === 'service-management-status-addon');
  const after = v33.native_helpers.find(({ id }) => id === 'service-management-status-addon');
  const proposalFields = new Set([
    'authority',
    'native_compile_authority',
    'native_link_authority',
    'node_api_header_source_selected',
    'electron_header_download_authority',
    'electron_rebuild_dependency_authority',
    'node_gyp_dependency_authority',
    'node_api_header_source_kind',
    'node_api_header_source_version',
    'node_api_header_source_archive_sha256',
    'node_api_header_root_resolution',
    'node_api_header_files',
    'electron_version',
    'electron_embedded_node_version',
    'electron_native_abi',
    'node_api_version',
    'node_api_version_source_define_required',
    'node_api_c_abi_only_authority',
    'node_cpp_v8_libuv_header_authority',
    'compile_proof_target',
    'compile_proof_language_standard',
    'compile_proof_service_management_framework_link_authority',
    'compile_proof_fixed_source_authority',
    'compile_proof_temporary_filesystem_authority',
    'compile_proof_network_authority',
    'compile_proof_module_load_authority',
    'compile_proof_invocation_authority',
    'temporary_unsigned_bundle_output_authority',
    'temporary_unsigned_bundle_persistence_authority',
    'adhoc_signature_suppression_required',
    'adhoc_signature_suppression_linker_flag',
    'compile_proof_tools',
    'compile_proof_proposed_files',
    'compile_proof_immutable_inputs',
  ]);
  assert.deepEqual(
    Object.fromEntries(Object.entries(after).filter(([key]) => !proposalFields.has(key))),
    Object.fromEntries(Object.entries(before).filter(([key]) => !proposalFields.has(key))),
  );
  assert.deepEqual(v33.invariants.slice(0, -10), v32.invariants.slice(0, -5));
  assert.equal(v33.invariants.length, v32.invariants.length + 5);
});

test('v33 selects only the exact governed Node 24.18.0 C Node-API headers', async () => {
  const addon = v33.native_helpers.find(({ id }) => id === 'service-management-status-addon');
  assert.equal(process.version, 'v24.18.0');
  assert.equal(addon.node_api_header_source_selected, true);
  assert.equal(addon.node_api_header_source_version, '24.18.0');
  assert.equal(addon.electron_version, '43.2.0');
  assert.equal(addon.electron_embedded_node_version, '24.18.0');
  assert.equal(addon.electron_native_abi, 148);
  assert.equal(addon.node_api_version, 8);
  assert.equal(
    addon.node_api_header_source_archive_sha256,
    'e1a97e14c99c803e96c7339403282ea05a499c32f8d83defe9ef5ec66f979ed1',
  );
  assert.deepEqual(addon.node_api_header_files.map(({ name }) => name), [
    'node_api.h',
    'node_api_types.h',
    'js_native_api.h',
    'js_native_api_types.h',
  ]);
  const canonicalExecutable = await realpath(process.execPath);
  assert.equal(
    basename(canonicalExecutable),
    'node',
    'DOSAI_STATUS_ADDON_CANONICAL_NODE_LAYOUT_0001: process.execPath must resolve to bin/node',
  );
  assert.equal(
    basename(dirname(canonicalExecutable)),
    'bin',
    'DOSAI_STATUS_ADDON_CANONICAL_NODE_LAYOUT_0001: the canonical Node binary must be inside bin',
  );
  const headerRoot = join(dirname(dirname(canonicalExecutable)), 'include/node');
  try {
    await access(headerRoot);
  } catch {
    assert.fail(
      'DOSAI_STATUS_ADDON_CANONICAL_NODE_LAYOUT_0001: the canonical Node install must provide sibling include/node headers',
    );
  }
  for (const header of addon.node_api_header_files) {
    const digest = createHash('sha256')
      .update(await readFile(join(headerRoot, header.name)))
      .digest('hex');
    assert.equal(digest, header.sha256, header.name);
  }

  const electronPackage = JSON.parse(
    await readFile(resolve(root, 'node_modules/electron/package.json'), 'utf8'),
  );
  assert.equal(electronPackage.version, addon.electron_version);
  assert.equal(
    (await readFile(resolve(root, 'node_modules/electron/dist/version'), 'utf8')).trim(),
    addon.electron_version,
  );
  assert.equal(
    Number((await readFile(resolve(root, 'node_modules/electron/abi_version'), 'utf8')).trim()),
    addon.electron_native_abi,
  );
});

test('v33 permits only a temporary unsigned compile proof and no runtime effect', () => {
  const addon = v33.native_helpers.find(({ id }) => id === 'service-management-status-addon');
  assert.equal(
    addon.authority,
    'PROPOSED_PINNED_NODE_API_V8_TEMPORARY_UNSIGNED_COMPILE_PROOF',
  );
  for (const field of [
    'native_compile_authority',
    'native_link_authority',
    'node_api_c_abi_only_authority',
    'compile_proof_service_management_framework_link_authority',
    'compile_proof_fixed_source_authority',
    'compile_proof_temporary_filesystem_authority',
    'temporary_unsigned_bundle_output_authority',
    'adhoc_signature_suppression_required',
  ]) {
    assert.equal(addon[field], true, field);
  }
  assert.deepEqual(addon.compile_proof_tools, [
    '/usr/bin/xcrun',
    '/usr/bin/lipo',
    '/usr/bin/otool',
    '/usr/bin/nm',
  ]);
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
  ]) {
    assert.equal(addon[field], false, field);
  }
});

test('v33 hash-locks preimages while v34 binds the exact compile implementation successor', async () => {
  const addon = v33.native_helpers.find(({ id }) => id === 'service-management-status-addon');
  const successor = v34.native_helpers.find(
    ({ id }) => id === 'service-management-status-addon',
  );
  assert.deepEqual(addon.compile_proof_proposed_files, [
    'native-helpers/service-management-status-addon/service-management-status-addon.mm',
    'tests/security/p3-service-management-status-addon-compile-candidate.test.mjs',
  ]);
  assert.equal(addon.compile_proof_immutable_inputs.length, 8);
  const successorFiles = new Map(
    successor.compile_proof_implemented_files.map((file) => [file.path, file.sha256]),
  );
  for (const file of addon.compile_proof_immutable_inputs) {
    const currentDigest = await hashFile(file.path);
    const successorDigest = successorFiles.get(file.path);
    if (successorDigest) {
      assert.notEqual(currentDigest, file.sha256, file.path);
      assert.equal(currentDigest, successorDigest, file.path);
    } else {
      assert.equal(currentDigest, file.sha256, file.path);
    }
  }
  const source = await readFile(
    resolve(root, 'native-helpers/service-management-status-addon/service-management-status-addon.mm'),
    'utf8',
  );
  assert.match(source, /^#define NAPI_VERSION 8$/m);
  assert.deepEqual(
    successor.compile_proof_implemented_files.map(({ path }) => path),
    addon.compile_proof_proposed_files,
  );
  for (const file of successor.compile_proof_implemented_files) {
    assert.equal(await hashFile(file.path), file.sha256, file.path);
  }
});
