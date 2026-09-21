import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '../..');
const recordPath = 'docs/architecture/p3-linux-builder-v2-acceptance-record.json';
const expectedAuthorities = Object.freeze({
  package_index_read: false,
  package_download: false,
  signature_verification: false,
  image_preparation: false,
  image_pull: false,
  source_acquisition: false,
  guest_compilation: false,
  guest_execution: false,
  vm_operation: false,
  network_access: false,
  production_use: false,
});

async function loadRecord() {
  return JSON.parse(await readFile(resolve(root, recordPath), 'utf8'));
}

async function hashFile(path) {
  return createHash('sha256').update(await readFile(resolve(root, path))).digest('hex');
}

function assertAcceptedRecord(record) {
  assert.equal(record.record_type, 'P3_LINUX_BUILDER_V2_ACCEPTANCE');
  assert.equal(record.record_version, 1);
  assert.equal(record.status, 'ACCEPTED');
  assert.deepEqual(record.decision, {
    path: 'docs/decisions/0018-native-linux-independent-builders.md',
    status: 'ACCEPTED',
  });
  assert.deepEqual(record.accepted_preconditions, [{
    path: 'docs/development/p3-builder-acceptance-boundary-evidence.md',
    sha256: 'e71203f68dbb47296fafef0ba7b8a9199ed188766587e4a02c59f45d8a63fe79',
  }]);
  assert.deepEqual(record.declaration, {
    v16_status_remains: 'PROPOSED_FOR_OWNER_REVIEW',
    v2_contract_status: 'DECLARATION_ONLY',
    owner_acceptance_recorded: true,
    authority_change: 'NONE',
  });
  assert.deepEqual(record.authorities, expectedAuthorities);
  assert.equal(
    record.follow_on_gate,
    'SEPARATE_OWNER_ACCEPTED_READ_ONLY_RESOLUTION_PROPOSAL_REQUIRED',
  );
}

test('accepted P3 builder v2 record binds the exact declaration without authority', async () => {
  const record = await loadRecord();
  assertAcceptedRecord(record);
  for (const precondition of record.accepted_preconditions) {
    assert.equal(await hashFile(precondition.path), precondition.sha256, precondition.path);
  }
  for (const input of record.accepted_inputs) {
    assert.equal(await hashFile(input.path), input.sha256, input.path);
  }
});

test('accepted P3 builder v2 record rejects status regression and every authority expansion', async () => {
  const record = await loadRecord();
  const regressed = structuredClone(record);
  regressed.status = 'PROPOSED_FOR_OWNER_REVIEW';
  assert.throws(() => assertAcceptedRecord(regressed), assert.AssertionError);

  for (const authority of Object.keys(expectedAuthorities)) {
    const expanded = structuredClone(record);
    expanded.authorities[authority] = true;
    assert.throws(() => assertAcceptedRecord(expanded), assert.AssertionError, authority);
  }
});

test('P3 builder v2 acceptance record rejects a changed input digest', async () => {
  const record = await loadRecord();
  record.accepted_inputs[1].sha256 = '0'.repeat(64);
  await assert.rejects(
    async () => {
      for (const input of record.accepted_inputs) {
        assert.equal(await hashFile(input.path), input.sha256, input.path);
      }
    },
    assert.AssertionError,
  );
});
