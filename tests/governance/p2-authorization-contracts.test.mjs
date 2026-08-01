import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import test from 'node:test';

import {
  P2_AUTHORIZATION_SCHEMA_IDS,
  admitContract,
} from '../../src/contracts/p2/contracts.ts';
import { createSchemaValidator, requireValid } from '../../tools/dosai-acceptance/src/schema-validator.mjs';

const root = resolve(import.meta.dirname, '../..');
const schemaId = 'urn:dosai:schema:local-owner-approval:1';
const schemaPaths = [
  'docs/architecture/schemas/v1/common.schema.json',
  'docs/architecture/schemas/v1/local-owner-approval.schema.json',
];
const validator = await createSchemaValidator(root, schemaPaths);

const approval = Object.freeze({
  schema_id: schemaId,
  schema_version: 1,
  message_id: '0ae369fa-78bd-49cf-8e26-fd3882340d18',
  created_at: '2026-07-31T21:00:00.000Z',
  producer: 'dosai.owner-approval',
  producer_generation: '1',
  trace_id: '3a7c965d-d898-4d58-98c0-cb44f154a623',
  data_class: 'D1',
  approval_id: '957eef14-52fa-4af1-a385-d551556d1ccc',
  plan_id: '0872a205-7b0e-49c6-80fc-1cbb0d63cde2',
  plan_digest: { algorithm: 'SHA-256', value: 'a'.repeat(64) },
  operation_digest: { algorithm: 'SHA-256', value: 'b'.repeat(64) },
  actor_id: 'dosai.synthetic.actor',
  session_id: '3ce5fc80-4191-4a49-93ff-d18b21e51e51',
  owner_id: 'dosai.local.owner',
  approval_decision: 'APPROVE',
  approval_method: 'LOCAL_OWNER_CONFIRMATION_TEST_ONLY',
  owner_presence_nonce: '7a345523-7971-4b2f-b08d-54d511bb3f58',
  approved_at: '2026-07-31T21:00:00.000Z',
  expires_at: '2026-07-31T21:01:00.000Z',
});

function validates(id, value) {
  return validator.getSchema(id)?.(value) === true;
}

test('accepted registry v9 is additive and preserves accepted v8 bytes', async () => {
  const [v8Bytes, v8, v9] = await Promise.all([
    readFile(join(root, 'docs/architecture/schema-registry-v8.json')),
    readFile(join(root, 'docs/architecture/schema-registry-v8.json'), 'utf8').then(JSON.parse),
    readFile(join(root, 'docs/architecture/schema-registry-v9.json'), 'utf8').then(JSON.parse),
  ]);
  assert.equal(
    createHash('sha256').update(v8Bytes).digest('hex'),
    'd98a4b0fe1739ae4924c67f7549134235c2bc28144849eaed89799c091ba8fcf',
  );
  assert.equal(v9.registry_id, 'urn:dosai:schema-registry:9');
  assert.equal(v9.registry_version, 9);
  assert.equal(v9.supersedes, v8.registry_id);
  assert.equal(v9.status, 'ACCEPTED');

  const v8Schemas = new Map(v8.schemas.map((schema) => [schema.name, schema]));
  const changed = v9.schemas
    .filter((schema) => JSON.stringify(v8Schemas.get(schema.name)) !== JSON.stringify(schema))
    .map(({ name }) => name);
  assert.deepEqual(changed, ['local-owner-approval']);
});

test('fresh local owner approval is strict D1 control data with a bounded window', () => {
  assert.deepEqual(P2_AUTHORIZATION_SCHEMA_IDS, [schemaId]);
  requireValid(validator, schemaId, approval);
  const admitted = admitContract(schemaId, approval, validates);
  assert.equal(admitted.data_class, 'D1');
  assert.equal(Object.isFrozen(admitted), true);
  assert.equal(Object.isFrozen(admitted.plan_digest), true);

  for (const mutation of [
    { ...approval, data_class: 'D5' },
    { ...approval, approval_decision: 'DENY' },
    { ...approval, approval_method: 'REMOTE' },
    { ...approval, opaque_token: 'secret' },
    { ...approval, expires_at: '2026-07-31T21:01:00.001Z' },
    { ...approval, created_at: '2026-07-31T20:59:59.999Z' },
  ]) {
    assert.throws(() => admitContract(schemaId, mutation, validates));
  }
});

test('approval admission rejects accessors without invoking them', () => {
  let invoked = false;
  const candidate = {};
  Object.defineProperty(candidate, 'schema_id', {
    enumerable: true,
    get() {
      invoked = true;
      return schemaId;
    },
  });
  assert.throws(() => admitContract(schemaId, candidate, validates), /DOSAI_SCHEMA_0001/);
  assert.equal(invoked, false);
});
