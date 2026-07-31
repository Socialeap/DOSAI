import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import test from 'node:test';

import {
  CHECKPOINT_SCHEMA_IDS,
  admitAuditAnchorReceipt,
  admitAuditCheckpoint,
  auditAnchorReceiptDigest,
  auditCheckpointDigest,
  verifyAuditCheckpoint,
} from '../../native-helpers/audit/checkpoint-contracts.ts';
import { createSchemaValidator, requireValid } from '../../tools/dosai-acceptance/src/schema-validator.mjs';
import { checkpointFixture, receiptFixture } from '../support/p2-checkpoint-fixtures.mjs';

const root = resolve(import.meta.dirname, '../..');
const schemaPaths = [
  'docs/architecture/schemas/v1/common.schema.json',
  'docs/architecture/schemas/v1/audit-checkpoint.schema.json',
  'docs/architecture/schemas/v1/audit-anchor-receipt.schema.json',
];
const validator = await createSchemaValidator(root, schemaPaths);

test('accepted registry v8 defines only checkpoint and anchor receipt changes over accepted v7', async () => {
  const [v7Bytes, v7, v8] = await Promise.all([
    readFile(join(root, 'docs/architecture/schema-registry-v7.json')),
    readFile(join(root, 'docs/architecture/schema-registry-v7.json'), 'utf8').then(JSON.parse),
    readFile(join(root, 'docs/architecture/schema-registry-v8.json'), 'utf8').then(JSON.parse),
  ]);
  assert.equal(
    createHash('sha256').update(v7Bytes).digest('hex'),
    '6a41d62c2f22683573f211d4c6012ac17bad6fe08ba9a1443792e0adcb0e6ff7',
  );
  assert.equal(v8.registry_id, 'urn:dosai:schema-registry:8');
  assert.equal(v8.supersedes, v7.registry_id);
  assert.equal(v8.status, 'ACCEPTED');

  const previous = new Map(v7.schemas.map((schema) => [schema.name, schema]));
  const changed = v8.schemas
    .filter((schema) => JSON.stringify(previous.get(schema.name)) !== JSON.stringify(schema))
    .map(({ name }) => name);
  assert.deepEqual(changed, ['audit-checkpoint', 'audit-anchor-receipt']);
});

test('checkpoint and verified receipt schemas match strict runtime admission', async () => {
  const { checkpoint } = await checkpointFixture();
  const { receipt } = await receiptFixture(checkpoint);

  requireValid(validator, CHECKPOINT_SCHEMA_IDS.checkpoint, checkpoint);
  requireValid(validator, CHECKPOINT_SCHEMA_IDS.receipt, receipt);
  assert.deepEqual(admitAuditCheckpoint(checkpoint), checkpoint);
  assert.deepEqual(admitAuditAnchorReceipt(receipt), receipt);
  assert.deepEqual(verifyAuditCheckpoint(checkpoint), checkpoint);
  assert.match(auditCheckpointDigest(checkpoint).value, /^[0-9a-f]{64}$/);
  assert.match(auditAnchorReceiptDigest(receipt).value, /^[0-9a-f]{64}$/);
});

test('contracts reject assurance spoofing, malformed key transitions, and extra fields', async () => {
  const { checkpoint } = await checkpointFixture();
  const { receipt } = await receiptFixture(checkpoint);
  const invalidCheckpoints = [
    { ...checkpoint, assurance: 'ANCHORED' },
    { ...checkpoint, active_signing_key_id: 'f'.repeat(64) },
    { ...checkpoint, transition: { ...checkpoint.transition, kind: 'ROTATION' } },
    { ...checkpoint, signatures: [{ ...checkpoint.signatures[0], value_base64: 'AA==' }] },
  ];
  assert.equal(validator.getSchema(CHECKPOINT_SCHEMA_IDS.checkpoint)(invalidCheckpoints[0]), false);
  for (const candidate of invalidCheckpoints) {
    assert.throws(() => admitAuditCheckpoint(candidate), /DOSAI_CHECKPOINT_SCHEMA_0001/);
  }
  const relabeledProtection = {
    ...checkpoint,
    signing_keys: [{ ...checkpoint.signing_keys[0], protection: 'SECURE_ENCLAVE' }],
  };
  requireValid(validator, CHECKPOINT_SCHEMA_IDS.checkpoint, relabeledProtection);
  assert.throws(() => verifyAuditCheckpoint(relabeledProtection), /DOSAI_CHECKPOINT_SCHEMA_0001/);

  const invalidReceipts = [
    { ...receipt, assurance: 'ANCHORED' },
    { ...receipt, integrated_time: '123' },
    { ...receipt, log_key_id_base64: Buffer.alloc(31).toString('base64') },
    { ...receipt, inclusion_hashes_base64: [...receipt.inclusion_hashes_base64, 'not-base64'] },
  ];
  for (const candidate of invalidReceipts) {
    assert.equal(validator.getSchema(CHECKPOINT_SCHEMA_IDS.receipt)(candidate), false);
    assert.throws(() => admitAuditAnchorReceipt(candidate), /DOSAI_CHECKPOINT_SCHEMA_0001/);
  }
});

test('runtime admission is detached, frozen, and accessor-safe', async () => {
  const { checkpoint } = await checkpointFixture();
  const mutable = structuredClone(checkpoint);
  const admitted = admitAuditCheckpoint(mutable);
  mutable.transition.reason_code = 'OWNER_ROTATION';
  assert.equal(admitted.transition.reason_code, 'INITIAL_INSTALL');
  assert.ok(Object.isFrozen(admitted));
  assert.ok(Object.isFrozen(admitted.transition));
  assert.ok(Object.isFrozen(admitted.signing_keys));

  let getterCalls = 0;
  const hostile = { ...checkpoint };
  Object.defineProperty(hostile, 'signatures', {
    enumerable: true,
    get() {
      getterCalls += 1;
      return checkpoint.signatures;
    },
  });
  assert.throws(() => admitAuditCheckpoint(hostile), /DOSAI_CHECKPOINT_SCHEMA_0001/);
  assert.equal(getterCalls, 0);
});
