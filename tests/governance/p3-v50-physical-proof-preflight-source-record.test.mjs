import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

import { parseStrictJson } from '../../tools/dosai-acceptance/src/strict-json.mjs';

const root = resolve(import.meta.dirname, '../..');
const record = parseStrictJson(await readFile(resolve(
  root,
  'docs/architecture/p3-v50-physical-proof-preflight-source-record.json',
)));
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

test('v50 preflight source record binds the consumed attempt and exact repair bytes', async () => {
  assert.equal(record.status, 'IMPLEMENTED_SOURCE_ONLY_NOT_EXECUTED');
  assert.equal(record.implementation_commit, '9401876829d0854f14aa22fb1963661436d0dcad');
  assert.equal(record.failed_attempt.attempt_consumed, true);
  assert.equal(record.failed_attempt.retry_performed, false);
  for (const binding of [
    {
      path: record.failed_attempt.gate_path,
      sha256: record.failed_attempt.gate_sha256,
    },
    {
      path: record.failed_attempt.result_path,
      sha256: record.failed_attempt.result_sha256,
    },
    ...record.source_files,
  ]) {
    assert.equal(sha256(await readFile(resolve(root, binding.path))), binding.sha256, binding.path);
  }
});

test('v50 preflight source record grants no physical or execution authority', () => {
  assert.equal(record.contract.arguments_allowed, false);
  assert.equal(record.contract.network_allowed, false);
  assert.equal(record.contract.write_allowed, false);
  assert.equal(record.contract.application_launch_allowed, false);
  assert.equal(record.contract.service_management_allowed, false);
  assert.ok(Object.values(record.observed_effects).every(value => value === 0));
  assert.ok(Object.values(record.authorities).every(value => value === false));
  assert.equal(
    record.next_gate,
    'REBIND_ONE_NEW_EXACT_PHYSICAL_PROOF_PACKET_BEFORE_OWNER_REAUTHORIZATION',
  );
});
