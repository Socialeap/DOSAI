import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

import { parseStrictJson } from '../../tools/dosai-acceptance/src/strict-json.mjs';

const root = resolve(import.meta.dirname, '../..');
const recordPath = 'docs/architecture/process-ownership-v46.json';
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
    'privacy_remediation',
    'protocol',
    'runtime_reachability',
    'runtime_status',
    'schema_version',
    'scope',
    'status',
  ].sort());
  assert.equal(record.schema_version, 46);
  assert.equal(record.status, 'IMPLEMENTED_STANDING_AUTHORIZATION_SOURCE_ONLY');
  assert.equal(record.scope, 'P3_SERVICE_LIFECYCLE_INJECTION_ONLY_CORE');
  assert.equal(
    record.implementation_authorization,
    'OWNER_STANDING_AUTHORIZATION_MINOR_SOURCE_BUILD_TEST_COMMIT_2026_09_20',
  );
  assert.equal(record.runtime_status, 'NO_GO');
  assert.deepEqual(record.accepted_source_baseline, {
    path: 'docs/architecture/process-ownership-v45.json',
    sha256: '3fd999d46397a5a0b6d09e7bec06a2c0f2f1b47038a128a4f587d72b50ba0121',
  });
  assert.deepEqual(record.privacy_remediation, {
    personal_signing_subject_retained: false,
    signing_selector_retained: true,
    team_identifier_retained: true,
    certificate_fingerprint_retained: true,
    sanitized_evidence: [
      {
        path: 'docs/development/p3-v44-signed-app-status-proof-evidence.md',
        sha256: '67b83f6b27f2ac103592d144031f840fb7b6efa86646ba6ced971f394fc8624d',
      },
      {
        path: 'docs/development/p3-v45-signed-app-status-proof-evidence.md',
        sha256: 'f2fbee51a39b312237a7c2f7e2023312cf133c9f451c814e593c0aff50acab1d',
      },
    ],
  });
  assert.deepEqual(record.implementation_files, [
    {
      path: 'src/main/execution/service-management-lifecycle-core.ts',
      sha256: 'f4baaa90c804eb1b5c1351b329b62423aeea4a29acf569f764dddae22ec75be7',
    },
    {
      path: 'tests/security/p3-service-management-lifecycle-core.test.mjs',
      sha256: '34a84971186e8b73cad6d51408dfb2a0c684294e198ed714ed27671017f8636f',
    },
  ]);
  assert.deepEqual(record.runtime_reachability, {
    electron_main_import: false,
    preload_import: false,
    renderer_import: false,
    package_script_import: false,
    native_binding_present: false,
    normal_build_inclusion: false,
    proof_package_inclusion: false,
  });
  assert.deepEqual(record.authority, {
    package_or_signing: false,
    app_launch: false,
    native_module_load: false,
    status_call: false,
    service_management: false,
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
  });
  assert.deepEqual(record.protocol, {
    single_use: true,
    required_initial_status: 'NOT_REGISTERED',
    register_attempt_limit: 1,
    unregister_attempt_limit: 1,
    operation_argument_count: 0,
    clean_terminal_status: 'NOT_REGISTERED',
    retry_allowed: false,
    unknown_status_fails_closed: true,
  });
  return record;
}

async function assertReference(reference, readBytes = read) {
  assert.deepEqual(Object.keys(reference).sort(), ['path', 'sha256']);
  assert.match(reference.sha256, /^[0-9a-f]{64}$/);
  assert.equal(sha256(await readBytes(reference.path)), reference.sha256, reference.path);
}

test('v46 binds the exact injection-only lifecycle core and sanitized evidence', async () => {
  const record = await loadRecord();
  await assertReference(record.accepted_source_baseline);
  for (const reference of record.implementation_files) await assertReference(reference);
  for (const reference of record.privacy_remediation.sanitized_evidence) {
    await assertReference(reference);
    const source = (await read(reference.path)).toString('utf8');
    assert.doesNotMatch(source, /Apple Development:[^\n`]*@/);
  }
});

test('v46 lifecycle core is unreachable from every application and package entrypoint', async () => {
  for (const path of [
    'src/main/index.ts',
    'src/preload/index.ts',
    'src/renderer/App.tsx',
    'scripts/build.mjs',
    'scripts/package.mjs',
  ]) {
    assert.equal(
      (await read(path)).toString('utf8').includes('service-management-lifecycle-core'),
      false,
      path,
    );
  }
});

test('v46 rejects lineage, limits, reachability, authority, and runtime expansion', async () => {
  const pristine = await loadRecord();
  for (const change of [
    record => { record.accepted_source_baseline.sha256 = '0'.repeat(64); },
    record => { record.protocol.register_attempt_limit = 2; },
    record => { record.protocol.unregister_attempt_limit = 2; },
    record => { record.protocol.retry_allowed = true; },
    record => { record.runtime_reachability.electron_main_import = true; },
    record => { record.runtime_reachability.native_binding_present = true; },
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
