import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import test from 'node:test';

import { admitContract } from '../../src/contracts/p2/contracts.ts';
import {
  POLICY_TIERS,
  admitSyntheticPolicyContext,
  evaluateSyntheticPolicy,
} from '../../src/policy/synthetic-policy.ts';
import { createSchemaValidator } from '../../tools/dosai-acceptance/src/schema-validator.mjs';

const root = resolve(import.meta.dirname, '../..');
const operationSchemaId = 'urn:dosai:schema:operation:1';
const validator = await createSchemaValidator(root, [
  'docs/architecture/schemas/v1/common.schema.json',
  'docs/architecture/schemas/v1/operation.schema.json',
]);

const identities = Object.freeze({
  message: '49090bd8-5abf-4587-8e09-32ba0c7cf130',
  operation: 'e6c3b91b-02f8-4496-93a8-f241c02b1d4a',
  resource: 'a65f2e3f-55d4-46f6-a17f-379cf754132a',
  session: 'a4061877-2a4e-4405-8995-22f26f422f63',
  trace: '438af969-c871-4842-b450-b1a693747347',
});

const baseOperation = Object.freeze({
  schema_id: operationSchemaId,
  schema_version: 1,
  message_id: identities.message,
  created_at: '2026-07-31T22:37:14.000Z',
  producer: 'dosai.synthetic.client',
  producer_generation: '1',
  trace_id: identities.trace,
  data_class: 'D5',
  operation_id: identities.operation,
  operation_kind: 'SYNTHETIC_POLICY_PROBE',
  actor: {
    actor_id: 'dosai.synthetic.actor',
    actor_generation: '3',
    session_id: identities.session,
  },
  target: {
    resource_id: identities.resource,
    resource_kind: 'SYNTHETIC_RESOURCE',
    environment: 'LOCAL_TEST',
    generation: '8',
  },
  requested_capabilities: ['policy.preflight'],
  effect_profile: 'NONE',
  expected_effects: ['NONE'],
  limits: { deadline_ms: 5000, max_output_bytes: 4096 },
});

const baseContext = Object.freeze({
  policyAvailable: true,
  actorId: 'dosai.synthetic.actor',
  actorGeneration: '3',
  sessionId: identities.session,
  resourceId: identities.resource,
  resourceGeneration: '8',
  actorCapabilities: ['policy.preflight'],
  ownerCapabilities: ['policy.preflight'],
  policyCapabilities: ['policy.preflight'],
  capabilityEnvelopeActive: true,
  capabilityEnvelopeCapabilities: ['policy.preflight'],
});

function validates(schemaId, value) {
  return validator.getSchema(schemaId)?.(value) === true;
}

function operation(overrides = {}) {
  const candidate = {
    ...structuredClone(baseOperation),
    ...overrides,
    actor: { ...baseOperation.actor, ...overrides.actor },
    target: { ...baseOperation.target, ...overrides.target },
    limits: { ...baseOperation.limits, ...overrides.limits },
  };
  return admitContract(operationSchemaId, candidate, validates);
}

test('exact synthetic profiles classify Green, Yellow, Red, and Black', () => {
  const green = evaluateSyntheticPolicy(operation(), baseContext, validates);
  assert.deepEqual(
    [green.minimumTier, green.enforcedTier, green.outcome, green.approvalRequirement],
    ['GREEN', 'GREEN', 'AUTO_ALLOW', 'NONE'],
  );

  const yellow = evaluateSyntheticPolicy(operation({
    target: { environment: 'LOCAL_DEVELOPMENT' },
  }), baseContext, validates);
  assert.deepEqual(
    [yellow.minimumTier, yellow.enforcedTier, yellow.outcome, yellow.approvalRequirement],
    ['YELLOW', 'YELLOW', 'ENVELOPE_ALLOW', 'CAPABILITY_ENVELOPE'],
  );

  const red = evaluateSyntheticPolicy(operation({
    effect_profile: 'MUTATE_REMOTE',
    expected_effects: ['REMOTE_MUTATION'],
  }), baseContext, validates);
  assert.deepEqual(
    [red.minimumTier, red.enforcedTier, red.outcome, red.approvalRequirement],
    ['RED', 'RED', 'OWNER_REVIEW_REQUIRED', 'FRESH_LOCAL'],
  );

  const black = evaluateSyntheticPolicy(operation({
    target: { environment: 'PRODUCTION' },
  }), baseContext, validates);
  assert.deepEqual(
    [black.minimumTier, black.enforcedTier, black.outcome, black.approvalRequirement],
    ['BLACK', 'BLACK', 'DENY', 'PROHIBITED'],
  );
});

test('effect and environment floors combine monotonically without downgrade input', () => {
  const rank = new Map(POLICY_TIERS.map((tier, index) => [tier, index]));
  const cases = [
    [{ effect_profile: 'NONE', expected_effects: ['NONE'] }, 'GREEN'],
    [{ effect_profile: 'READ_LOCAL', expected_effects: ['LOCAL_READ'] }, 'GREEN'],
    [{ effect_profile: 'MUTATE_LOCAL', expected_effects: ['LOCAL_MUTATION'] }, 'YELLOW'],
    [{ effect_profile: 'MUTATE_REMOTE', expected_effects: ['REMOTE_MUTATION'] }, 'RED'],
    [{ effect_profile: 'PROHIBITED', expected_effects: ['UNKNOWN'] }, 'BLACK'],
    [{ target: { environment: 'STAGING' } }, 'RED'],
    [{ target: { environment: 'PRODUCTION' } }, 'BLACK'],
  ];

  for (const [overrides, expected] of cases) {
    const result = evaluateSyntheticPolicy(operation(overrides), baseContext, validates);
    assert.equal(result.minimumTier, expected);
    assert.ok(rank.get(result.enforcedTier) >= rank.get(result.minimumTier));
  }

  assert.throws(() => operation({ claimed_tier: 'GREEN' }), /DOSAI_SCHEMA_0001/);
  assert.throws(() => operation({ minimum_tier: 'GREEN' }), /DOSAI_SCHEMA_0001/);
});

test('policy outage, identity drift, and capability expansion fail Black', () => {
  const unavailable = evaluateSyntheticPolicy(operation(), {
    ...baseContext,
    policyAvailable: false,
  }, validates);
  assert.deepEqual([unavailable.enforcedTier, unavailable.outcome, unavailable.reasonCodes], [
    'BLACK',
    'DENY',
    ['POLICY_UNAVAILABLE'],
  ]);

  const identity = evaluateSyntheticPolicy(operation(), {
    ...baseContext,
    resourceGeneration: '9',
  }, validates);
  assert.deepEqual([identity.enforcedTier, identity.outcome, identity.reasonCodes], [
    'BLACK',
    'DENY',
    ['POLICY_IDENTITY_MISMATCH'],
  ]);

  const expansion = evaluateSyntheticPolicy(operation(), {
    ...baseContext,
    ownerCapabilities: [],
  }, validates);
  assert.deepEqual([expansion.enforcedTier, expansion.outcome, expansion.reasonCodes], [
    'BLACK',
    'DENY',
    ['CAPABILITY_EXPANSION_REJECTED'],
  ]);

  const unknown = evaluateSyntheticPolicy(operation({
    requested_capabilities: ['process.command_readonly'],
  }), {
    ...baseContext,
    actorCapabilities: ['process.command_readonly'],
    ownerCapabilities: ['process.command_readonly'],
    policyCapabilities: ['process.command_readonly'],
  }, validates);
  assert.deepEqual([unknown.enforcedTier, unknown.outcome, unknown.reasonCodes], [
    'BLACK',
    'DENY',
    ['UNKNOWN_CAPABILITY'],
  ]);
});

test('policy context admission is exact, detached, frozen, and accessor-safe', () => {
  const source = structuredClone(baseContext);
  const admitted = admitSyntheticPolicyContext(source);
  source.actorCapabilities.push('process.command_readonly');
  assert.deepEqual(admitted.actorCapabilities, ['policy.preflight']);
  assert.equal(Object.isFrozen(admitted), true);
  assert.equal(Object.isFrozen(admitted.actorCapabilities), true);

  const extra = evaluateSyntheticPolicy(operation(), { ...baseContext, extra: true }, validates);
  assert.deepEqual(extra.reasonCodes, ['POLICY_CONTEXT_REJECTED']);

  let getterRead = false;
  const accessor = structuredClone(baseContext);
  Object.defineProperty(accessor, 'actorId', {
    enumerable: true,
    get() {
      getterRead = true;
      return baseContext.actorId;
    },
  });
  const rejected = evaluateSyntheticPolicy(operation(), accessor, validates);
  assert.deepEqual(rejected.reasonCodes, ['POLICY_CONTEXT_REJECTED']);
  assert.equal(getterRead, false);

  let elementRead = false;
  const capabilityArray = ['policy.preflight'];
  Object.defineProperty(capabilityArray, '0', {
    enumerable: true,
    get() {
      elementRead = true;
      return 'policy.preflight';
    },
  });
  const arrayRejected = evaluateSyntheticPolicy(operation(), {
    ...baseContext,
    actorCapabilities: capabilityArray,
  }, validates);
  assert.deepEqual(arrayRejected.reasonCodes, ['POLICY_CONTEXT_REJECTED']);
  assert.equal(elementRead, false);
});

test('Yellow requires an active envelope containing every effective capability', () => {
  const yellow = operation({ target: { environment: 'LOCAL_DEVELOPMENT' } });
  for (const context of [
    { ...baseContext, capabilityEnvelopeActive: false },
    { ...baseContext, capabilityEnvelopeCapabilities: [] },
  ]) {
    const result = evaluateSyntheticPolicy(yellow, context, validates);
    assert.deepEqual(
      [result.minimumTier, result.enforcedTier, result.outcome, result.effectiveCapabilities],
      ['YELLOW', 'YELLOW', 'DENY', []],
    );
    assert.deepEqual(result.reasonCodes, ['CAPABILITY_ENVELOPE_REQUIRED']);
  }
});

test('malformed and command-shaped operation objects never enter policy evaluation', () => {
  assert.throws(() => operation({ command: 'npm test' }), /DOSAI_SCHEMA_0001/);
  assert.throws(() => operation({ operation_kind: 'SHELL_COMMAND' }), /DOSAI_SCHEMA_0001/);
  assert.throws(() => operation({ expected_effects: undefined }), /DOSAI_SCHEMA_0001/);
  assert.throws(() => operation({ requested_capabilities: [
    'policy.preflight',
    'policy.preflight',
  ] }), /DOSAI_SCHEMA_0001/);

  for (const candidate of [
    { ...structuredClone(baseOperation), command: 'npm test' },
    { ...structuredClone(baseOperation), schema_id: 'urn:dosai:schema:operation:999' },
  ]) {
    const result = evaluateSyntheticPolicy(candidate, baseContext, validates);
    assert.deepEqual([result.enforcedTier, result.outcome, result.reasonCodes], [
      'BLACK',
      'DENY',
      ['OPERATION_CONTRACT_REJECTED'],
    ]);
  }
});

test('policy output is deterministic, deeply immutable, and carries no grant', () => {
  const admitted = operation();
  const first = evaluateSyntheticPolicy(admitted, baseContext, validates);
  const second = evaluateSyntheticPolicy(admitted, baseContext, validates);
  assert.deepEqual(first, second);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.effectiveCapabilities), true);
  assert.equal(Object.isFrozen(first.reasonCodes), true);
  assert.equal('grant' in first, false);
  assert.equal('execution' in first, false);
});
