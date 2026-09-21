import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

import { parseStrictJson } from '../../tools/dosai-acceptance/src/strict-json.mjs';

const root = resolve(import.meta.dirname, '../..');
const record = parseStrictJson(await readFile(resolve(
  root,
  'docs/architecture/p3-v50-service-management-lifecycle-physical-proof-gate-v4.json',
)));
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

test('v50 gate v4 binds the failed gate-v3 result and reuse-only verifier bytes', async () => {
  assert.equal(record.record_version, 4);
  assert.equal(record.status, 'AWAITING_OWNER_REAUTHORIZATION');
  for (const binding of [
    { path: record.supersedes.path, sha256: record.supersedes.sha256 },
    { path: record.supersedes.result_path, sha256: record.supersedes.result_sha256 },
    {
      path: record.subjects.verifier_record_path,
      sha256: record.subjects.verifier_record_sha256,
    },
    { path: record.subjects.preflight_path, sha256: record.subjects.preflight_sha256 },
    {
      path: record.subjects.preserved_package_verifier_path,
      sha256: record.subjects.preserved_package_verifier_sha256,
    },
    {
      path: record.subjects.staged_package_verifier_path,
      sha256: record.subjects.staged_package_verifier_sha256,
    },
    {
      path: record.subjects.staged_launcher_path,
      sha256: record.subjects.staged_launcher_sha256,
    },
  ]) {
    assert.equal(sha256(await readFile(resolve(root, binding.path))), binding.sha256, binding.path);
  }
  assert.ok(Object.values(record.authorities).every(value => value === false));
});

test('v50 gate v4 reuses the package and binds the exact parent permission and one attempt', () => {
  assert.equal(record.fixed_attempt.package_builds, 0);
  assert.equal(record.fixed_attempt.test_signing_operations, 0);
  assert.equal(record.fixed_attempt.reuse_preserved_package, true);
  assert.equal(
    record.fixed_staging.required_filesystem_permission_root,
    '/Users/shakoure/Library/Application Support/DOSAI/TestProofs',
  );
  assert.equal(record.fixed_staging.parent_creation_attempt_limit, 1);
  assert.equal(record.fixed_staging.application_copy_attempt_limit, 1);
  assert.equal(record.fixed_staging.staged_package_verification_limit, 1);
  assert.equal(record.fixed_attempt.app_launches, 1);
  assert.equal(record.fixed_attempt.register_attempt_limit, 1);
  assert.equal(record.fixed_attempt.unregister_attempt_limit, 1);
  assert.equal(record.fixed_attempt.timeout_ms, 15000);
  assert.equal(record.fixed_attempt.retry_allowed, false);
  assert.equal(record.failure_containment.automatic_recovery_launch, false);
});
