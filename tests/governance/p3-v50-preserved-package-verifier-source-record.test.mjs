import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

import { parseStrictJson } from '../../tools/dosai-acceptance/src/strict-json.mjs';

const root = resolve(import.meta.dirname, '../..');
const record = parseStrictJson(await readFile(resolve(
  root,
  'docs/architecture/p3-v50-preserved-package-verifier-source-record.json',
)));
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

test('v50 preserved-package verifier record binds the exact failure and source bytes', async () => {
  assert.equal(record.status, 'IMPLEMENTED_SOURCE_ONLY_NOT_EXECUTED');
  assert.equal(record.implementation_commit, 'd1f28d12d31e9b506607c8dafbfc56ce9da02f91');
  assert.equal(
    sha256(await readFile(resolve(root, record.bound_failure.path))),
    record.bound_failure.sha256,
  );
  for (const binding of record.source_files) {
    assert.equal(sha256(await readFile(resolve(root, binding.path))), binding.sha256, binding.path);
  }
});

test('v50 preserved-package verifier record grants no physical authority', () => {
  assert.equal(record.contract.preserved_wrapper_arguments, 0);
  assert.equal(record.contract.staged_wrapper_arguments, 0);
  assert.equal(record.contract.network_allowed, false);
  assert.equal(record.contract.write_allowed, false);
  assert.equal(record.contract.signing_allowed, false);
  assert.equal(record.contract.application_launch_allowed, false);
  assert.ok(Object.values(record.observed_effects).every(value => value === 0));
  assert.ok(Object.values(record.authorities).every(value => value === false));
  assert.equal(
    record.next_gate,
    'BIND_REUSE_ONLY_GATE_WITH_EXACT_PARENT_WRITE_PERMISSION_BEFORE_OWNER_REAUTHORIZATION',
  );
});
