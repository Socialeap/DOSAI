import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

import { parseStrictJson } from '../../tools/dosai-acceptance/src/strict-json.mjs';

const root = resolve(import.meta.dirname, '../..');
const recordPath = 'docs/architecture/process-ownership-v48.json';
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
    'inert_validation',
    'proof_protocol',
    'runtime_reachability',
    'runtime_status',
    'schema_version',
    'scope',
    'status',
  ].sort());
  assert.equal(record.schema_version, 48);
  assert.equal(record.status, 'IMPLEMENTED_STANDING_AUTHORIZATION_SOURCE_ONLY');
  assert.equal(record.scope, 'P3_SERVICE_MANAGEMENT_LIFECYCLE_PROOF_ENTRY_INERT_ONLY');
  assert.equal(
    record.implementation_authorization,
    'OWNER_STANDING_AUTHORIZATION_MINOR_SOURCE_BUILD_TEST_COMMIT_2026_09_20',
  );
  assert.equal(record.runtime_status, 'NO_GO');
  assert.deepEqual(record.accepted_source_baseline, {
    path: 'docs/architecture/process-ownership-v47.json',
    sha256: '549499f2c2af2aaf5f223c6ea6587e6dd1f42ef8d0714f1ba02a9dba3a5c6de9',
  });
  assert.deepEqual(record.proof_protocol, {
    result_prefix: 'DOSAI_SERVICE_MANAGEMENT_LIFECYCLE_PROOF_V1:',
    fixed_addon_name: 'dosai-service-management-lifecycle.node',
    addon_load_attempt_limit: 1,
    lifecycle_exercise_limit: 1,
    output_count: 1,
    operation_argument_count: 0,
    observe_attempt_limit: 3,
    register_attempt_limit: 1,
    unregister_attempt_limit: 1,
    retry_allowed: false,
    distinct_entry_failures: [
      'NATIVE_ADDON_LOAD_FAILED',
      'NATIVE_CALL_CONTRACT_FAILED',
      'ELECTRON_READINESS_FAILED',
    ],
    receipt_fields: [
      'result',
      'before',
      'after_register',
      'after_unregister',
      'observe_attempts',
      'register_attempts',
      'unregister_attempts',
      'observe_completions',
      'register_completions',
      'unregister_completions',
      'consumed',
    ],
    error_details_exported: false,
  });
  assert.deepEqual(record.implementation_files.map(({ path }) => path), [
    'src/main/execution/service-management-lifecycle-proof-entry.ts',
    'tests/security/p3-service-management-lifecycle-proof-entry.test.mjs',
  ]);
  assert.deepEqual(record.inert_validation, {
    bundle_format: 'COMMONJS_TEST_ONLY',
    native_addon_replaced_by_in_memory_fixture: true,
    clean_sequence_observed: true,
    dirty_precondition_rejected: true,
    clean_registration_rejection_observed: true,
    single_cleanup_attempt_observed: true,
    uncertain_cleanup_fails_closed: true,
    native_call_failure_distinguished: true,
    load_failure_distinguished: true,
    binding_failure_distinguished: true,
    electron_readiness_failure_distinguished: true,
    native_module_loaded: false,
    service_management_invoked: false,
  });
  assert.deepEqual(record.runtime_reachability, {
    proof_entry_source_present: true,
    normal_main_entry_changed: false,
    build_mode_present: false,
    package_mode_present: false,
    native_addon_builder_present: false,
    audit_runner_present: false,
    normal_build_inclusion: false,
    proof_package_inclusion: false,
    production_reachability: false,
  });
  assert.ok(Object.values(record.authority).every(value => value === false));
  return record;
}

async function assertReference(reference, readBytes = read) {
  assert.deepEqual(Object.keys(reference).sort(), ['path', 'sha256']);
  assert.match(reference.sha256, /^[0-9a-f]{64}$/);
  assert.equal(sha256(await readBytes(reference.path)), reference.sha256, reference.path);
}

test('v48 binds the exact inert lifecycle proof entry and test over v47', async () => {
  const record = await loadRecord();
  await assertReference(record.accepted_source_baseline);
  for (const reference of record.implementation_files) await assertReference(reference);
});

test('v48 lifecycle proof entry remains absent from all build and package selectors', async () => {
  for (const path of [
    'src/main/index.ts',
    'src/preload/index.ts',
    'src/renderer/App.tsx',
    'scripts/build.mjs',
    'scripts/package.mjs',
    'vite.main.config.ts',
  ]) {
    assert.equal(
      (await read(path)).toString('utf8').includes('service-management-lifecycle-proof-entry'),
      false,
      path,
    );
  }
});

test('v48 rejects lineage, limits, reachability, authority, and runtime expansion', async () => {
  const pristine = await loadRecord();
  for (const change of [
    record => { record.accepted_source_baseline.sha256 = '0'.repeat(64); },
    record => { record.proof_protocol.fixed_addon_name = 'different.node'; },
    record => { record.proof_protocol.addon_load_attempt_limit = 2; },
    record => { record.proof_protocol.lifecycle_exercise_limit = 2; },
    record => { record.proof_protocol.register_attempt_limit = 2; },
    record => { record.proof_protocol.unregister_attempt_limit = 2; },
    record => { record.proof_protocol.retry_allowed = true; },
    record => { record.implementation_files[0].path = 'src/main/index.ts'; },
    record => { record.inert_validation.native_module_loaded = true; },
    record => { record.inert_validation.service_management_invoked = true; },
    record => { record.runtime_reachability.build_mode_present = true; },
    record => { record.runtime_reachability.package_mode_present = true; },
    record => { record.runtime_reachability.production_reachability = true; },
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
