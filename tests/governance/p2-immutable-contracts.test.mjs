import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import test from 'node:test';

import {
  OPERATION_STATES,
  P2_SCHEMA_IDS,
  admitContract,
  assertBoundedWindow,
  canonicalContractJson,
  isLifecycleTransitionAllowed,
} from '../../src/contracts/p2/contracts.ts';
import { createSchemaValidator, requireValid } from '../../tools/dosai-acceptance/src/schema-validator.mjs';

const root = resolve(import.meta.dirname, '../..');
const commonSchema = 'docs/architecture/schemas/v1/common.schema.json';
const schemaPaths = [
  'docs/architecture/schemas/v1/resource-precondition.schema.json',
  'docs/architecture/schemas/v1/operation.schema.json',
  'docs/architecture/schemas/v1/action-plan.schema.json',
  'docs/architecture/schemas/v1/policy-decision.schema.json',
  'docs/architecture/schemas/v1/execution-grant.schema.json',
  'docs/architecture/schemas/v1/operation-lifecycle.schema.json',
];
const validator = await createSchemaValidator(root, [commonSchema, ...schemaPaths]);

const ids = Object.freeze({
  actor: 'dosai.synthetic.actor',
  decision: '76485c46-0478-427c-a165-c86f07fa2158',
  grant: '59ce7a65-bb5f-4b0d-84af-e5f74e14d857',
  message: 'e609683b-d3af-4790-8afe-4d6281a32e68',
  nonce: 'ed986308-e6fe-4de9-88b6-810d90d7f86d',
  operation: '25f628e3-e181-49f3-878c-eeaeaa871076',
  plan: '0872a205-7b0e-49c6-80fc-1cbb0d63cde2',
  precondition: '65487b1e-9a47-4330-91da-4ed55b367b09',
  resource: '92adcc3e-f3c8-4df7-a8bf-bb9b85047acd',
  session: '3ce5fc80-4191-4a49-93ff-d18b21e51e51',
  trace: '3a7c965d-d898-4d58-98c0-cb44f154a623',
  transition: '58ec70b4-abd5-4d6b-bbb6-b8eca11014fa',
});
const digest = Object.freeze({ algorithm: 'SHA-256', value: 'a'.repeat(64) });
const lifecycleTriggers = Object.freeze({
  REQUESTED: 'REQUEST_ADMITTED',
  PLANNED: 'PLAN_CREATED',
  REJECTED: 'SCHEMA_REJECTED',
  AWAITING_APPROVAL: 'APPROVAL_REQUIRED',
  AUTHORIZED: 'POLICY_ALLOWED',
  DENIED: 'POLICY_DENIED',
  GRANT_ISSUED: 'GRANT_CREATED',
  EXECUTING: 'EFFECT_STARTED',
  SUCCEEDED: 'EFFECT_SUCCEEDED',
  FAILED: 'EFFECT_FAILED',
  CANCELLED: 'OWNER_CANCELLED',
  EXPIRED: 'DEADLINE_EXPIRED',
  UNKNOWN: 'OUTCOME_UNKNOWN',
});

function envelope(schemaId, producer = 'dosai.contracts') {
  return {
    schema_id: schemaId,
    schema_version: 1,
    message_id: ids.message,
    created_at: '2026-07-31T22:23:38.000Z',
    producer,
    producer_generation: '1',
    trace_id: ids.trace,
    data_class: 'D5',
  };
}

const fixtures = Object.freeze({
  'urn:dosai:schema:resource-precondition:1': {
    ...envelope('urn:dosai:schema:resource-precondition:1'),
    precondition_id: ids.precondition,
    resource_id: ids.resource,
    resource_kind: 'SYNTHETIC_RESOURCE',
    condition: { kind: 'GENERATION_MATCH', expected_generation: '7' },
  },
  'urn:dosai:schema:operation:1': {
    ...envelope('urn:dosai:schema:operation:1'),
    operation_id: ids.operation,
    operation_kind: 'SYNTHETIC_POLICY_PROBE',
    actor: { actor_id: ids.actor, actor_generation: '4', session_id: ids.session },
    target: {
      resource_id: ids.resource,
      resource_kind: 'SYNTHETIC_RESOURCE',
      environment: 'LOCAL_TEST',
      generation: '7',
    },
    requested_capabilities: ['policy.preflight'],
    effect_profile: 'MUTATE_LOCAL',
    expected_effects: ['LOCAL_MUTATION'],
    limits: { deadline_ms: 5000, max_output_bytes: 4096 },
  },
  'urn:dosai:schema:action-plan:1': {
    ...envelope('urn:dosai:schema:action-plan:1'),
    plan_id: ids.plan,
    operation_id: ids.operation,
    operation_digest: digest,
    actor_id: ids.actor,
    session_id: ids.session,
    target: {
      resource_id: ids.resource,
      resource_kind: 'SYNTHETIC_RESOURCE',
      environment: 'LOCAL_TEST',
      generation: '7',
    },
    resource_preconditions: [{ precondition_id: ids.precondition, precondition_digest: digest }],
    policy_version: 'dosai.policy.v1',
    minimum_tier: 'RED',
    effective_capabilities: ['policy.preflight'],
    approval_requirement: 'FRESH_LOCAL',
    predicted_effects: ['LOCAL_MUTATION'],
    evidence_requirements: ['POLICY_DECISION'],
    expires_at: '2026-07-31T22:28:38.000Z',
  },
  'urn:dosai:schema:policy-decision:1': {
    ...envelope('urn:dosai:schema:policy-decision:1', 'dosai.policy'),
    decision_id: ids.decision,
    plan_id: ids.plan,
    plan_digest: digest,
    policy_version: 'dosai.policy.v1',
    minimum_tier: 'RED',
    enforced_tier: 'RED',
    result: 'ALLOW',
    reason_codes: ['OWNER_APPROVAL_REQUIRED'],
    effective_capabilities: ['policy.preflight'],
    approval_requirement: 'FRESH_LOCAL',
    grant_eligible: true,
  },
  'urn:dosai:schema:execution-grant:1': {
    ...envelope('urn:dosai:schema:execution-grant:1', 'dosai.grants'),
    grant_id: ids.grant,
    opaque_token_hash: digest,
    operation_digest: digest,
    plan_digest: digest,
    policy_decision_digest: digest,
    actor_id: ids.actor,
    session_id: ids.session,
    effective_capabilities: ['policy.preflight'],
    policy_version: 'dosai.policy.v1',
    issuer_id: 'dosai.grants',
    nonce: ids.nonce,
    issued_at: '2026-07-31T22:23:38.000Z',
    expires_at: '2026-07-31T22:28:38.000Z',
    audit_ack_sequence: '42',
    grant_state: 'ISSUED',
    use_limit: 1,
  },
  'urn:dosai:schema:operation-lifecycle:1': {
    ...envelope('urn:dosai:schema:operation-lifecycle:1'),
    transition_id: ids.transition,
    operation_id: ids.operation,
    transition_sequence: '0',
    previous_state: null,
    current_state: 'REQUESTED',
    trigger: 'REQUEST_ADMITTED',
    effect_state: 'NO_EFFECT',
  },
});

function validates(schemaId, value) {
  return validator.getSchema(schemaId)?.(value) === true;
}

test('accepted registry v6 defines only the six P2.1 contracts', async () => {
  const [v5, v6] = await Promise.all([
    readFile(join(root, 'docs/architecture/schema-registry-v5.json'), 'utf8').then(JSON.parse),
    readFile(join(root, 'docs/architecture/schema-registry-v6.json'), 'utf8').then(JSON.parse),
  ]);
  assert.equal(v6.registry_id, 'urn:dosai:schema-registry:6');
  assert.equal(v6.supersedes, v5.registry_id);
  assert.equal(v6.status, 'ACCEPTED');

  const v5Schemas = new Map(v5.schemas.map((schema) => [schema.name, schema]));
  const changed = [];
  for (const schema of v6.schemas) {
    const predecessor = v5Schemas.get(schema.name);
    if (predecessor === undefined || JSON.stringify(predecessor) !== JSON.stringify(schema)) {
      changed.push(schema.name);
    }
  }
  assert.deepEqual(changed, [
    'resource-precondition',
    'operation',
    'action-plan',
    'policy-decision',
    'execution-grant',
    'operation-lifecycle',
  ]);
});

test('all accepted P2.1 fixtures validate under strict registered schemas', () => {
  assert.deepEqual(Object.keys(fixtures), [...P2_SCHEMA_IDS]);
  for (const [schemaId, fixture] of Object.entries(fixtures)) {
    requireValid(validator, schemaId, fixture);
  }
});

test('contracts reject generic commands, extras, unknown operations, and unsafe grants', () => {
  const operation = fixtures['urn:dosai:schema:operation:1'];
  assert.equal(validates(operation.schema_id, { ...operation, command: 'rm -rf .' }), false);
  assert.equal(validates(operation.schema_id, { ...operation, operation_kind: 'SHELL_COMMAND' }), false);
  assert.equal(validates(operation.schema_id, {
    ...operation,
    effect_profile: 'NONE',
    expected_effects: ['LOCAL_MUTATION'],
  }), false);
  assert.equal(validates(operation.schema_id, {
    ...operation,
    effect_profile: 'READ_LOCAL',
    expected_effects: ['REMOTE_MUTATION'],
  }), false);

  const plan = fixtures['urn:dosai:schema:action-plan:1'];
  assert.equal(validates(plan.schema_id, {
    ...plan,
    resource_preconditions: [plan.resource_preconditions[0], plan.resource_preconditions[0]],
  }), false);

  const blackDecision = {
    ...fixtures['urn:dosai:schema:policy-decision:1'],
    enforced_tier: 'BLACK',
    result: 'ALLOW',
  };
  assert.equal(validates(blackDecision.schema_id, blackDecision), false);
  assert.equal(validates(blackDecision.schema_id, {
    ...fixtures['urn:dosai:schema:policy-decision:1'],
    minimum_tier: 'RED',
    enforced_tier: 'GREEN',
    approval_requirement: 'NONE',
  }), false);

  const grant = fixtures['urn:dosai:schema:execution-grant:1'];
  assert.equal(validates(grant.schema_id, { ...grant, opaque_token: 'secret' }), false);
  assert.equal(validates(grant.schema_id, { ...grant, use_limit: 2 }), false);
});

test('admission clones, deeply freezes, and canonically orders validated data', () => {
  const source = structuredClone(fixtures['urn:dosai:schema:operation:1']);
  const admitted = admitContract(source.schema_id, source, validates);
  source.target.environment = 'PRODUCTION';

  assert.equal(admitted.target.environment, 'LOCAL_TEST');
  assert.equal(Object.isFrozen(admitted), true);
  assert.equal(Object.isFrozen(admitted.target), true);
  assert.equal(Object.isFrozen(admitted.requested_capabilities), true);
  assert.match(canonicalContractJson(admitted), /^\{"actor":/);
  assert.equal(canonicalContractJson(admitted).includes('\n'), false);

  let getterRead = false;
  const accessor = {};
  Object.defineProperty(accessor, 'schema_id', {
    enumerable: true,
    get() {
      getterRead = true;
      return source.schema_id;
    },
  });
  assert.throws(() => admitContract(source.schema_id, accessor, validates), /DOSAI_SCHEMA_0001/);
  assert.equal(getterRead, false);
  assert.throws(
    () => admitContract(source.schema_id, { ...source, unsafe: -0 }, validates),
    /DOSAI_SCHEMA_0001/,
  );
});

test('lifecycle implementation and schema admit exactly the same transitions', () => {
  const lifecycle = fixtures['urn:dosai:schema:operation-lifecycle:1'];
  const previousStates = [null, ...OPERATION_STATES];
  for (const previous of previousStates) {
    for (const current of OPERATION_STATES) {
      const candidate = {
        ...lifecycle,
        previous_state: previous,
        current_state: current,
        trigger: lifecycleTriggers[current],
      };
      assert.equal(
        validates(lifecycle.schema_id, candidate),
        isLifecycleTransitionAllowed(previous, current),
        `${previous ?? 'null'} -> ${current}`,
      );
    }
  }
  assert.equal(validates(lifecycle.schema_id, { ...lifecycle, trigger: 'EFFECT_SUCCEEDED' }), false);
});

test('grant and plan windows are positive and bounded', () => {
  assert.doesNotThrow(() => assertBoundedWindow(
    '2026-07-31T22:23:38.000Z',
    '2026-07-31T22:28:38.000Z',
  ));
  assert.throws(() => assertBoundedWindow(
    '2026-07-31T22:23:38.000Z',
    '2026-07-31T22:23:38.000Z',
  ), /DOSAI_PRECONDITION_0001/);
  assert.throws(() => assertBoundedWindow(
    '2026-07-31T22:23:38.000Z',
    '2026-07-31T22:28:38.001Z',
  ), /DOSAI_PRECONDITION_0001/);
  assert.throws(() => assertBoundedWindow(
    '2026-02-30T22:23:38.000Z',
    '2026-03-01T22:23:38.000Z',
  ), /DOSAI_PRECONDITION_0001/);

  const plan = fixtures['urn:dosai:schema:action-plan:1'];
  assert.throws(() => admitContract(plan.schema_id, {
    ...plan,
    expires_at: '2026-07-31T22:23:37.000Z',
  }, validates), /DOSAI_PRECONDITION_0001/);

  const grant = fixtures['urn:dosai:schema:execution-grant:1'];
  assert.throws(() => admitContract(grant.schema_id, {
    ...grant,
    created_at: '2026-07-31T22:23:39.000Z',
  }, validates), /DOSAI_PRECONDITION_0001/);
});
