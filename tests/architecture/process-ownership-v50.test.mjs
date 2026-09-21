import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

import { loadLifecycleFirstRegistrationSuccessor } from './p3-lifecycle-first-registration-successor.mjs';

const root = resolve(import.meta.dirname, '../..');
const recordPath = 'docs/architecture/process-ownership-v50.json';
const read = path => readFile(resolve(root, path));
const pristine = JSON.parse(await read(recordPath));
const altered = change => {
  const candidate = structuredClone(pristine);
  change(candidate);
  return path => path === recordPath ? Buffer.from(JSON.stringify(candidate)) : read(path);
};

test('v50 binds only the authorized first-seen precondition correction', async () => {
  const successor = await loadLifecycleFirstRegistrationSuccessor(root);
  for (const file of pristine.modified_files) {
    assert.equal(successor.expected(file.path, file.pre_sha256), file.post_sha256);
  }
  assert.equal(successor.expected('src/main/index.ts', 'unchanged'), 'unchanged');
  assert.deepEqual(pristine.source_validation, {
    first_seen_not_found_tested: true,
    dirty_active_statuses_refused: true,
    register_true_ambiguous_post_status_cleanup_tested: true,
    register_false_not_found_cannot_succeed: true,
    final_not_found_cannot_succeed: true,
    operation_counts_remain_bounded: true,
    normal_main_unchanged: true,
    package_built: false,
    signing_invoked: false,
    app_launched: false,
    native_module_loaded: false,
    service_management_invoked: false,
  });
});

test('v50 rejects authority, limit, status, lineage, and postimage expansion', async () => {
  for (const change of [
    record => { record.accepted_source_baseline.sha256 = 'a'.repeat(64); },
    record => { record.proposal_input.sha256 = 'a'.repeat(64); },
    record => { record.protocol.eligible_initial_statuses.push('ENABLED'); },
    record => { record.protocol.register_attempt_limit = 2; },
    record => { record.protocol.unregister_attempt_limit = 2; },
    record => { record.protocol.retry_allowed = true; },
    record => { record.modified_files[0].path = 'src/main/index.ts'; },
    record => { record.modified_files[0].post_sha256 = 'a'.repeat(64); },
    record => { record.authority.registration = true; },
    record => { record.authority.app_launch = true; },
    record => { record.runtime_status = 'GO'; },
    record => { record.unexpected = true; },
  ]) await assert.rejects(loadLifecycleFirstRegistrationSuccessor(root, altered(change)));

  for (const source of ['{', '{"schema_version":50,"schema_version":50}']) {
    await assert.rejects(loadLifecycleFirstRegistrationSuccessor(root, path => (
      path === recordPath ? Buffer.from(source) : read(path)
    )));
  }
});

test('v50 leaves application and normal package entrypoints unchanged', async () => {
  for (const path of [
    'src/main/index.ts',
    'src/preload/index.ts',
    'src/renderer/App.tsx',
  ]) {
    assert.equal(
      (await read(path)).toString('utf8').includes('service-management-lifecycle-core'),
      false,
      path,
    );
  }
  assert.equal(pristine.authority.package_build, false);
  assert.equal(pristine.authority.service_management_runtime_call, false);
  assert.equal(pristine.authority.workflow_dispatch, false);
  assert.equal(pristine.authority.pull_request_merge, false);
});
