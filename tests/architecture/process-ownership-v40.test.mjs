import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '../..');
const v40Path = resolve(root, 'docs/architecture/process-ownership-v40.json');
const v40 = JSON.parse(await readFile(v40Path, 'utf8'));

const digest = async (path) =>
  createHash('sha256').update(await readFile(resolve(root, path))).digest('hex');

test('accepted process ownership v40 binds accepted v39 and the exact historical v12 guard', async () => {
  assert.equal(v40.schema_version, 40);
  assert.equal(v40.status, 'ACCEPTED');
  assert.equal(v40.full_manifest_replacement, false);
  assert.deepEqual(v40.supersedes, {
    path: 'docs/architecture/process-ownership-v39.json',
    sha256: await digest('docs/architecture/process-ownership-v39.json'),
  });
  for (const baseline of v40.governed_baselines) {
    assert.equal(await digest(baseline.path), baseline.sha256, baseline.path);
  }
  const v39 = JSON.parse(await readFile(resolve(root, 'docs/architecture/process-ownership-v39.json'), 'utf8'));
  assert.equal(v39.status, 'ACCEPTED');
  assert.deepEqual(v39.preimplementation_files.find((file) => file.path === 'src/main/execution/watchdog-control-client.ts'), {
    path: 'src/main/execution/watchdog-control-client.ts',
    sha256: 'bcbc9f508398a8df67812401d82d3686d6fe4cbaf8fca70427755535f2943007',
  });
  assert.deepEqual(v39.implemented_files.find((file) => file.path === 'src/main/execution/watchdog-control-client.ts'), {
    path: 'src/main/execution/watchdog-control-client.ts',
    sha256: '40c961fc8e8fccde77488b38b430fa237cd99c10a47f035684c8de36b0fc49aa',
  });
});

test('v40 preserves the v12 preimage and hash-binds only its accepted successor-guard postimage', async () => {
  assert.deepEqual(v40.proposed_implementation_files, [
    'tests/architecture/process-ownership-v12.test.mjs',
  ]);
  assert.deepEqual(v40.preimplementation_files, [
    {
      path: 'tests/architecture/process-ownership-v12.test.mjs',
      sha256: '75425ed2de0c96a7d1881833dd8b5affc68e4f825097def356d6a76d68aa8a09',
    },
  ]);
  assert.deepEqual(v40.implemented_files.map((file) => file.path), v40.proposed_implementation_files);
  for (const file of v40.implemented_files) {
    assert.equal(await digest(file.path), file.sha256, file.path);
  }
});

test('v40 requires one exact accepted successor and denies every runtime-adjacent authority', () => {
  assert.deepEqual(v40.required_contract, {
    historical_guard_target: 'tests/architecture/process-ownership-v12.test.mjs',
    historical_governance_record: 'docs/architecture/process-ownership-v12.json',
    authorized_successor_record: 'docs/architecture/process-ownership-v39.json',
    authorized_successor_path: 'src/main/execution/watchdog-control-client.ts',
    successor_record_status: 'ACCEPTED',
    successor_postimage_must_match: true,
    non_successor_v12_bound_files_must_remain_hash_exact: true,
    unrecorded_successor_digest_rejected: true,
  });
  assert.equal(v40.required_adversarial_cases.length, 4);
  assert.ok(v40.required_adversarial_cases.includes('V12_GUARD_REJECTS_A_DIFFERENT_CLIENT_DIGEST'));
  assert.ok(Object.values(v40.authority).every((value) => value === false));
  assert.equal(v40.implementation_authorization, 'OWNER_ACCEPTED_HISTORICAL_GUARD_TEST_ONLY');
  assert.equal(v40.implementation_outcome, 'IMPLEMENTED_NO_RUNTIME_AUTHORITY');
});
