import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

import { parseStrictJson } from '../../tools/dosai-acceptance/src/strict-json.mjs';

const root = resolve(import.meta.dirname, '../..');
const recordPath = 'docs/architecture/process-ownership-v47.json';
const read = path => readFile(resolve(root, path));
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

async function loadRecord(readBytes = read) {
  const bytes = await readBytes(recordPath);
  assert.ok(bytes.byteLength <= 65_536);
  const record = parseStrictJson(bytes);
  assert.deepEqual(Object.keys(record).sort(), [
    'accepted_source_baseline',
    'authority',
    'implementation_authorization',
    'implementation_files',
    'native_adapter',
    'runtime_reachability',
    'runtime_status',
    'schema_version',
    'scope',
    'source_only_validation',
    'status',
  ].sort());
  assert.equal(record.schema_version, 47);
  assert.equal(record.status, 'IMPLEMENTED_OWNER_AUTHORIZED_SOURCE_ONLY');
  assert.equal(record.scope, 'P3_NATIVE_SERVICE_MANAGEMENT_LIFECYCLE_ADAPTER_SOURCE_ONLY');
  assert.equal(
    record.implementation_authorization,
    'OWNER_AUTHORIZED_BOUNDED_SOURCE_ONLY_NATIVE_LIFECYCLE_ADAPTER_2026_09_20',
  );
  assert.equal(record.runtime_status, 'NO_GO');
  assert.deepEqual(record.accepted_source_baseline, {
    path: 'docs/architecture/process-ownership-v46.json',
    sha256: '91266548de2d85e8610e74c4837686691283ef2b2972d2ad84c48201156d06dc',
  });
  assert.deepEqual(record.native_adapter, {
    owner_root: 'src/main/execution',
    fixed_plist_name: 'com.socialeap.dosai.execution-service-fixture.plist',
    exports: ['observe', 'register', 'unregister'],
    operation_argument_count: 0,
    register_call_site_limit: 1,
    unregister_call_site_limit: 1,
    retry_allowed: false,
    error_details_exported: false,
    unknown_status_fails_closed: true,
  });
  assert.deepEqual(record.implementation_files.map(({ path }) => path), [
    'src/main/execution/service-management-lifecycle-adapter.mm',
    'tests/security/p3-service-management-lifecycle-adapter.test.mjs',
  ]);
  assert.deepEqual(record.source_only_validation, {
    header_contract: {
      path: 'docs/architecture/process-ownership-v33.json',
      sha256: '33163e6dac6729534aeac63b2b7ddc565c646093d4e271751ba4a98a1d8d46ae',
    },
    node_version: 'v24.18.0',
    node_api_version: 8,
    target: 'arm64-apple-macos15.0',
    compiler_mode: 'SYNTAX_ONLY',
    linked_output: false,
    executable_output: false,
    native_module_loaded: false,
    service_management_invoked: false,
  });
  assert.deepEqual(record.runtime_reachability, {
    native_binding_source_present: true,
    native_binding_output_present: false,
    electron_main_import: false,
    preload_import: false,
    renderer_import: false,
    build_script_import: false,
    package_script_import: false,
    normal_build_inclusion: false,
    proof_package_inclusion: false,
  });
  assert.deepEqual(record.authority, {
    package_build: false,
    signing: false,
    app_launch: false,
    native_module_load: false,
    status_call: false,
    service_management_runtime_call: false,
    registration: false,
    unregistration: false,
    service_launch: false,
    xpc_connection: false,
    process_control: false,
    vm_control: false,
    filesystem_access: false,
    network_access: false,
    journal_change: false,
    production_use: false,
    physical_attempt: false,
    external_builder_provisioning: false,
  });
  return record;
}

async function assertReference(reference, readBytes = read) {
  assert.deepEqual(Object.keys(reference).sort(), ['path', 'sha256']);
  assert.match(reference.sha256, /^[0-9a-f]{64}$/);
  assert.equal(sha256(await readBytes(reference.path)), reference.sha256, reference.path);
}

test('v47 binds the exact source-only native lifecycle adapter and validation contract', async () => {
  const record = await loadRecord();
  await assertReference(record.accepted_source_baseline);
  await assertReference(record.source_only_validation.header_contract);
  for (const reference of record.implementation_files) await assertReference(reference);
});

test('v47 native lifecycle adapter remains unreachable from application and packaging', async () => {
  const marker = 'service-management-lifecycle-adapter';
  for (const path of [
    'src/main/index.ts',
    'src/preload/index.ts',
    'src/renderer/App.tsx',
    'scripts/build.mjs',
    'scripts/package.mjs',
    'scripts/service-management-status-addon.mjs',
  ]) assert.equal((await read(path)).toString('utf8').includes(marker), false, path);
});

test('v47 rejects identity, path, validation, reachability, authority, and runtime expansion', async () => {
  const pristine = await loadRecord();
  for (const change of [
    record => { record.accepted_source_baseline.sha256 = '0'.repeat(64); },
    record => { record.native_adapter.fixed_plist_name = 'different.plist'; },
    record => { record.native_adapter.register_call_site_limit = 2; },
    record => { record.native_adapter.retry_allowed = true; },
    record => { record.implementation_files[0].path = 'src/main/index.ts'; },
    record => { record.source_only_validation.compiler_mode = 'LINKED_BUNDLE'; },
    record => { record.source_only_validation.linked_output = true; },
    record => { record.runtime_reachability.electron_main_import = true; },
    record => { record.runtime_reachability.proof_package_inclusion = true; },
    record => { record.authority.registration = true; },
    record => { record.authority.physical_attempt = true; },
    record => { record.runtime_status = 'GO'; },
    record => { record.unexpected = true; },
  ]) {
    const altered = structuredClone(pristine);
    change(altered);
    await assert.rejects(loadRecord(async path => (
      path === recordPath ? Buffer.from(JSON.stringify(altered)) : read(path)
    )));
  }
});
