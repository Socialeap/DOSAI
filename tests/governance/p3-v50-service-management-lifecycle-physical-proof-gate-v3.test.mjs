import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

import { parseStrictJson } from '../../tools/dosai-acceptance/src/strict-json.mjs';

const root = resolve(import.meta.dirname, '../..');
const record = parseStrictJson(await readFile(resolve(
  root,
  'docs/architecture/p3-v50-service-management-lifecycle-physical-proof-gate-v3.json',
)));
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

test('v50 gate v3 binds the consumed gate-v2 result and governed preflight bytes', async () => {
  assert.equal(record.record_version, 3);
  assert.equal(record.status, 'AWAITING_OWNER_REAUTHORIZATION');
  assert.equal(record.subjects.package_source_commit, 'bcb69f9c7662b9b507ab1ce01c2956bf8a47d2bc');
  for (const binding of [
    { path: record.supersedes.path, sha256: record.supersedes.sha256 },
    { path: record.supersedes.result_path, sha256: record.supersedes.result_sha256 },
    {
      path: record.subjects.preflight_record_path,
      sha256: record.subjects.preflight_record_sha256,
    },
    { path: record.subjects.preflight_path, sha256: record.subjects.preflight_sha256 },
    {
      path: record.subjects.staged_launcher_path,
      sha256: record.subjects.staged_launcher_sha256,
    },
  ]) {
    assert.equal(sha256(await readFile(resolve(root, binding.path))), binding.sha256, binding.path);
  }
  assert.ok(Object.values(record.authorities).every(value => value === false));
});

test('v50 gate v3 permits one read-only preflight before one unchanged physical attempt', () => {
  assert.deepEqual(record.governed_preflight, {
    execution_limit: 1,
    arguments: 0,
    read_only: true,
    network_allowed: false,
    required_result: 'PASS',
    required_subject_commit: 'bcb69f9c7662b9b507ab1ce01c2956bf8a47d2bc',
    stop_before_build_on_non_pass: true,
    retry_allowed: false,
  });
  assert.equal(record.fixed_attempt.app_launches, 1);
  assert.equal(record.fixed_attempt.app_arguments, 0);
  assert.equal(record.fixed_attempt.register_attempt_limit, 1);
  assert.equal(record.fixed_attempt.unregister_attempt_limit, 1);
  assert.equal(record.fixed_attempt.timeout_ms, 15000);
  assert.equal(record.fixed_attempt.retry_allowed, false);
  assert.equal(record.failure_containment.automatic_recovery_launch, false);
  assert.equal(
    record.next_gate,
    'EXACT_OWNER_REAUTHORIZATION_REQUIRED_BEFORE_PREFLIGHT_OR_ANY_PHYSICAL_ACTION',
  );
});
