import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

import { parseStrictJson } from '../../tools/dosai-acceptance/src/strict-json.mjs';

const root = resolve(import.meta.dirname, '../..');
const record = parseStrictJson(await readFile(resolve(
  root,
  'docs/architecture/p3-v50-service-management-lifecycle-physical-proof-gate-v2.json',
)));
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

test('v50 gate v2 binds the stable-path launcher source commit and exact bytes', async () => {
  assert.equal(record.record_version, 2);
  assert.equal(record.status, 'AWAITING_OWNER_AUTHORIZATION');
  assert.equal(record.subject.commit, 'bcb69f9c7662b9b507ab1ce01c2956bf8a47d2bc');
  assert.equal(
    sha256(await readFile(resolve(root, record.supersedes.path))),
    record.supersedes.sha256,
  );
  for (const [pathKey, hashKey] of [
    ['process_ownership_path', 'process_ownership_sha256'],
    ['staged_launcher_record_path', 'staged_launcher_record_sha256'],
    ['staged_launcher_path', 'staged_launcher_sha256'],
  ]) {
    assert.equal(
      sha256(await readFile(resolve(root, record.subject[pathKey]))),
      record.subject[hashKey],
      pathKey,
    );
  }
  assert.ok(Object.values(record.authorities).every(value => value === false));
});

test('v50 gate v2 launches only the fixed staged app once with existing containment', () => {
  assert.equal(
    record.fixed_attempt.stable_test_application_path,
    '/Users/shakoure/Library/Application Support/DOSAI/TestProofs/v50/DOSAI.app',
  );
  assert.equal(
    record.fixed_attempt.stable_test_executable_path,
    '/Users/shakoure/Library/Application Support/DOSAI/TestProofs/v50/DOSAI.app/Contents/MacOS/DOSAI',
  );
  assert.equal(
    record.fixed_attempt.runner_path,
    'scripts/service-management-lifecycle-staged-proof.mjs',
  );
  assert.equal(record.fixed_attempt.app_launches, 1);
  assert.equal(record.fixed_attempt.app_arguments, 0);
  assert.equal(record.fixed_attempt.register_attempt_limit, 1);
  assert.equal(record.fixed_attempt.unregister_attempt_limit, 1);
  assert.equal(record.fixed_attempt.timeout_ms, 15000);
  assert.equal(record.fixed_attempt.retry_allowed, false);
  assert.equal(record.failure_containment.automatic_recovery_launch, false);
  assert.equal(record.failure_containment.further_runtime_action_requires_new_owner_authorization, true);
});
