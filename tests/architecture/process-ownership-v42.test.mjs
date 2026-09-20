import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

import { loadGuardSuccessors } from './p3-guard-successor.mjs';

const root = resolve(import.meta.dirname, '../..');
const successors = await loadGuardSuccessors(root);
const v42Path = resolve(root, 'docs/architecture/process-ownership-v42.json');
const v42 = JSON.parse(await readFile(v42Path, 'utf8'));

const digest = async (path) =>
  createHash('sha256').update(await readFile(resolve(root, path))).digest('hex');

test('proposed process ownership v42 binds accepted v41 and all seven exact historical guard records', async () => {
  assert.equal(v42.schema_version, 42);
  assert.equal(v42.status, 'PROPOSED_FOR_OWNER_REVIEW');
  assert.equal(v42.full_manifest_replacement, false);
  assert.deepEqual(v42.supersedes, {
    path: 'docs/architecture/process-ownership-v41.json',
    sha256: await digest('docs/architecture/process-ownership-v41.json'),
  });
  for (const baseline of v42.governed_baselines) {
    assert.equal(await digest(baseline.path), baseline.sha256, baseline.path);
  }
  const v41 = JSON.parse(await readFile(resolve(root, 'docs/architecture/process-ownership-v41.json'), 'utf8'));
  assert.equal(v41.status, 'ACCEPTED');
  assert.deepEqual(v41.implemented_files, [{
    path: 'tests/architecture/process-ownership-v20.test.mjs',
    sha256: '91f4e30d01f03bd19d203341107cded4c5cccb4f0512453e58de826f6f8721f7',
  }]);
});

test('v42 preserves its seven-file proposal while v43 binds the directed guard repair', async () => {
  assert.deepEqual(v42.proposed_implementation_files, v42.required_contract.historical_guard_targets);
  for (const file of v42.preimplementation_files) {
    assert.equal(await digest(file.path), successors.expected(file.path, file.sha256), file.path);
  }
});

test('v42 requires one exact accepted successor and denies every runtime-adjacent authority', () => {
  assert.equal(v42.required_contract.authorized_successor_record, 'docs/architecture/process-ownership-v41.json');
  assert.equal(v42.required_contract.authorized_successor_path, 'tests/architecture/process-ownership-v20.test.mjs');
  assert.equal(v42.required_contract.authorized_successor_sha256, '91f4e30d01f03bd19d203341107cded4c5cccb4f0512453e58de826f6f8721f7');
  assert.equal(v42.required_contract.successor_record_status, 'ACCEPTED');
  assert.equal(v42.required_adversarial_cases.length, 4);
  assert.ok(v42.required_adversarial_cases.includes('ALL_SEVEN_GUARDS_REJECT_A_DIFFERENT_V20_GUARD_DIGEST'));
  assert.ok(Object.values(v42.authority).every((value) => value === false));
  assert.equal(v42.implementation_authorization, 'OWNER_ACCEPTANCE_REQUIRED');
});
