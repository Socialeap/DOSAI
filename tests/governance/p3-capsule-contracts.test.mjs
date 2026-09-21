import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

import {
  admitCapsuleRequest,
  admitFixedSafeTestCapsuleRequest,
} from '../../src/contracts/p3/contracts.ts';
import { admitCapsuleRegistryDocument } from '../../src/contracts/p3/persistence.ts';
import { CapsuleSupervisor } from '../../src/main/execution/capsule-supervisor.ts';
import { createSchemaValidator } from '../../tools/dosai-acceptance/src/schema-validator.mjs';

const root = resolve(import.meta.dirname, '../..');
const validator = await createSchemaValidator(root, [
  'docs/architecture/schemas/v1/common.schema.json',
  'docs/architecture/schemas/v1/capsule-request.schema.json',
  'docs/architecture/schemas/v1/capsule-registry.schema.json',
]);

function request(overrides = {}) {
  return {
    schema_id: 'urn:dosai:schema:capsule-request:1',
    schema_version: 1,
    capsule_id: randomUUID(),
    operation_id: randomUUID(),
    generation: '1',
    operation_kind: 'SAFE_TEST',
    executable: '/usr/bin/printf',
    arguments: ['DOSAI_SAFE_TEST_OK'],
    environment: {},
    limits: { wall_time_ms: 1000, max_output_bytes: 18 },
    authorization: 'NO_EFFECT_TEST_ONLY',
    ...overrides,
  };
}

test('accepted registry v11 adds only the two P3 contracts over accepted v10', async () => {
  const v10 = JSON.parse(await readFile(resolve(root, 'docs/architecture/schema-registry-v10.json')));
  const v11 = JSON.parse(await readFile(resolve(root, 'docs/architecture/schema-registry-v11.json')));
  assert.equal(v11.status, 'ACCEPTED');
  assert.equal(v11.supersedes, v10.registry_id);
  assert.equal(v11.registry_version, 11);
  assert.deepEqual(
    v11.schemas.filter(({ name }) => !['capsule-request', 'capsule-registry'].includes(name)),
    v10.schemas,
  );
  assert.deepEqual(
    v11.schemas.filter(({ owner_phase }) => owner_phase === 'P3').map(({ name, state }) => ({ name, state })),
    [
      { name: 'capsule-request', state: 'DEFINED' },
      { name: 'capsule-registry', state: 'DEFINED' },
    ],
  );
});

test('P3 JSON Schemas and runtime admission agree on valid and hostile requests', () => {
  const valid = request();
  assert.equal(validator.getSchema('urn:dosai:schema:capsule-request:1')(valid), true);
  assert.deepEqual(structuredClone(admitCapsuleRequest(valid)), valid);
  assert.deepEqual(structuredClone(admitFixedSafeTestCapsuleRequest(valid)), valid);

  const hostile = [
    request({ executable: '/bin/sh' }),
    request({ environment: { PATH: '/usr/bin' } }),
    request({ authorization: 'EXECUTION_ALLOWED' }),
    { ...request(), extra: true },
  ];
  for (const candidate of hostile) {
    assert.equal(validator.getSchema('urn:dosai:schema:capsule-request:1')(candidate), false);
    assert.throws(() => admitCapsuleRequest(candidate));
  }
});

test('fixed safe-test admission rejects schema-valid argument and authority expansion', () => {
  const schemaValidButUnapproved = [
    request({ arguments: ['%s', 'CALLER_CONTROLLED'] }),
    request({ environment: { LANG: 'C' } }),
    request({ limits: { wall_time_ms: 2000, max_output_bytes: 18 } }),
    request({ limits: { wall_time_ms: 1000, max_output_bytes: 19 } }),
    request({ executable: '/usr/bin/sleep', arguments: ['2'], limits: { wall_time_ms: 1000, max_output_bytes: 0 } }),
  ];
  for (const candidate of schemaValidButUnapproved) {
    assert.equal(validator.getSchema('urn:dosai:schema:capsule-request:1')(candidate), true);
    assert.throws(
      () => admitFixedSafeTestCapsuleRequest(candidate),
      /DOSAI_CAPSULE_PROFILE_0001/,
    );
    assert.throws(() => new CapsuleSupervisor().register(candidate, 100), /DOSAI_CAPSULE_PROFILE_0001/);
  }
});

test('registry schema validates durable state while runtime enforces relational invariants', () => {
  const supervisor = new CapsuleSupervisor();
  const candidate = request();
  supervisor.register(candidate, 100);
  const registry = supervisor.exportRegistry('1', '1', 101);
  assert.equal(validator.getSchema('urn:dosai:schema:capsule-registry:1')(registry), true);
  assert.deepEqual(admitCapsuleRegistryDocument(registry), registry);

  const wrongDeadline = structuredClone(registry);
  wrongDeadline.records[0].deadline_at_ms += 1;
  assert.equal(validator.getSchema('urn:dosai:schema:capsule-registry:1')(wrongDeadline), true);
  assert.throws(() => admitCapsuleRegistryDocument(wrongDeadline), /DOSAI_CAPSULE_REGISTRY_SCHEMA_0001/);

  const duplicate = { ...registry, records: [registry.records[0], registry.records[0]] };
  assert.equal(validator.getSchema('urn:dosai:schema:capsule-registry:1')(duplicate), true);
  assert.throws(() => admitCapsuleRegistryDocument(duplicate), /DOSAI_CAPSULE_REGISTRY_SCHEMA_0001/);

  const unapprovedProfile = structuredClone(registry);
  unapprovedProfile.records[0].request.arguments = ['%s', 'CALLER_CONTROLLED'];
  assert.equal(validator.getSchema('urn:dosai:schema:capsule-registry:1')(unapprovedProfile), true);
  assert.throws(
    () => admitCapsuleRegistryDocument(unapprovedProfile),
    /DOSAI_CAPSULE_PROFILE_0001/,
  );
});
