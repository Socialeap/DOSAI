import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '../..');
const v41Path = resolve(root, 'docs/architecture/process-ownership-v41.json');
const v41 = JSON.parse(await readFile(v41Path, 'utf8'));

const digest = async (path) =>
  createHash('sha256').update(await readFile(resolve(root, path))).digest('hex');

test('accepted process ownership v41 binds accepted v40 and the exact historical v20 guard', async () => {
  assert.equal(v41.schema_version, 41);
  assert.equal(v41.status, 'ACCEPTED');
  assert.equal(v41.full_manifest_replacement, false);
  assert.deepEqual(v41.supersedes, {
    path: 'docs/architecture/process-ownership-v40.json',
    sha256: await digest('docs/architecture/process-ownership-v40.json'),
  });
  for (const baseline of v41.governed_baselines) {
    assert.equal(await digest(baseline.path), baseline.sha256, baseline.path);
  }
  const v40 = JSON.parse(await readFile(resolve(root, 'docs/architecture/process-ownership-v40.json'), 'utf8'));
  assert.equal(v40.status, 'ACCEPTED');
  assert.deepEqual(v40.implemented_files, [{
    path: 'tests/architecture/process-ownership-v12.test.mjs',
    sha256: '24bec2421182f813765c6daadf903e5ea7394ebcec4a65d1d7efc7f8b3158030',
  }]);
});

test('v41 preserves the v20 preimage and hash-binds only its accepted successor-guard postimage', async () => {
  assert.deepEqual(v41.proposed_implementation_files, [
    'tests/architecture/process-ownership-v20.test.mjs',
  ]);
  assert.deepEqual(v41.preimplementation_files, [{
    path: 'tests/architecture/process-ownership-v20.test.mjs',
    sha256: '66c4751173bfbb2bff376c36551bcf5978c87270ed70fde2714f0105ed885156',
  }]);
  assert.deepEqual(v41.implemented_files.map((file) => file.path), v41.proposed_implementation_files);
  for (const file of v41.implemented_files) {
    assert.equal(await digest(file.path), file.sha256, file.path);
  }
});

test('v41 requires one exact accepted successor and denies every runtime-adjacent authority', () => {
  assert.deepEqual(v41.required_contract, {
    historical_guard_target: 'tests/architecture/process-ownership-v20.test.mjs',
    historical_governance_record: 'docs/architecture/process-ownership-v20.json',
    authorized_successor_record: 'docs/architecture/process-ownership-v40.json',
    authorized_successor_path: 'tests/architecture/process-ownership-v12.test.mjs',
    successor_record_status: 'ACCEPTED',
    successor_postimage_must_match: true,
    non_successor_v20_guard_files_must_remain_hash_exact: true,
    unrecorded_successor_digest_rejected: true,
  });
  assert.equal(v41.required_adversarial_cases.length, 4);
  assert.ok(v41.required_adversarial_cases.includes('V20_GUARD_REJECTS_A_DIFFERENT_V12_GUARD_DIGEST'));
  assert.ok(Object.values(v41.authority).every((value) => value === false));
  assert.equal(v41.implementation_authorization, 'OWNER_ACCEPTED_SECOND_HISTORICAL_GUARD_TEST_ONLY');
  assert.equal(v41.implementation_outcome, 'IMPLEMENTED_NO_RUNTIME_AUTHORITY');
});
