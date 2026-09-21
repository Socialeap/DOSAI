import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

import { loadLifecycleCompositionSuccessor } from './p3-lifecycle-composition-successor.mjs';

const root = resolve(import.meta.dirname, '../..');
const recordPath = 'docs/architecture/process-ownership-v49.json';
const read = path => readFile(resolve(root, path));
const pristine = JSON.parse(await read(recordPath));
const altered = change => {
  const candidate = structuredClone(pristine);
  change(candidate);
  return path => path === recordPath ? Buffer.from(JSON.stringify(candidate)) : read(path);
};

test('v49 binds only the dormant lifecycle build, package, and runner composition', async () => {
  const successor = await loadLifecycleCompositionSuccessor(root);
  for (const file of pristine.modified_files) {
    assert.equal(
      successor.expected(file.path, file.pre_sha256),
      successor.expected(file.path, file.post_sha256),
    );
  }
  assert.equal(successor.expected('src/main/index.ts', 'unchanged'), 'unchanged');
  assert.deepEqual(pristine.composition, {
    build_mode: 'service-management-lifecycle-proof',
    package_argument: '--signed-app-service-management-lifecycle-proof-fixture',
    addon_name: 'dosai-service-management-lifecycle.node',
    addon_identifier: 'com.socialeap.dosai.service-management-lifecycle-addon',
    result_prefix: 'DOSAI_SERVICE_MANAGEMENT_LIFECYCLE_PROOF_V1:',
    proof_executable: 'out/DOSAI-darwin-arm64/DOSAI.app/Contents/MacOS/DOSAI',
    child_argument_count: 0,
    timeout_ms: 15000,
    retry_allowed: false,
  });
  assert.deepEqual(pristine.failure_containment, {
    initial_status_required: 'NOT_REGISTERED',
    in_process_cleanup_attempt_limit: 1,
    clean_terminal_status: 'NOT_REGISTERED',
    missing_receipt_action: 'STOP_NO_RETRY_OWNER_RECOVERY_REQUIRED',
    uncertain_receipt_action: 'STOP_NO_RETRY_OWNER_RECOVERY_REQUIRED',
    automatic_recovery_launch: false,
  });
  assert.ok(Object.values(pristine.authority).every(value => value === false));
});

test('v49 rejects changed paths, lineage, limits, authority, status, and malformed records', async () => {
  for (const change of [
    record => record.modified_files.push(record.modified_files[0]),
    record => { record.modified_files[0].path = 'src/main/index.ts'; },
    record => { record.modified_files[0].post_sha256 = 'a'.repeat(64); },
    record => { record.new_files[0].path = 'src/main/index.ts'; },
    record => { record.accepted_source_baseline.sha256 = 'a'.repeat(64); },
    record => { record.composition.child_argument_count = 1; },
    record => { record.composition.timeout_ms = 30000; },
    record => { record.composition.retry_allowed = true; },
    record => { record.failure_containment.in_process_cleanup_attempt_limit = 2; },
    record => { record.failure_containment.automatic_recovery_launch = true; },
    record => { record.authority.package_build = true; },
    record => { record.authority.registration = true; },
    record => { record.authority.physical_attempt = true; },
    record => { record.status = 'ACCEPTED_RUNTIME'; },
    record => { record.runtime_status = 'GO'; },
    record => { record.unexpected = true; },
  ]) await assert.rejects(loadLifecycleCompositionSuccessor(root, altered(change)));

  for (const source of ['{', '{"schema_version":49,"schema_version":49}', 'x'.repeat(131073)]) {
    await assert.rejects(loadLifecycleCompositionSuccessor(root, path => (
      path === recordPath ? Buffer.from(source) : read(path)
    )));
  }
});

test('v49 rejects drift in every modified and new file', async () => {
  const targets = [...pristine.modified_files, ...pristine.new_files].map(file => file.path);
  for (const target of targets) {
    await assert.rejects(loadLifecycleCompositionSuccessor(root, async path => {
      const bytes = await read(path);
      return path === target ? Buffer.concat([bytes, Buffer.from('\n// drift\n')]) : bytes;
    }));
  }
});
