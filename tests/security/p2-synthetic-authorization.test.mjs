import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

import { createSoftwareCheckpointAuthorityForTesting } from '../../native-helpers/audit/checkpoint.ts';
import * as authorizationModule from '../../native-helpers/grants/synthetic-authorization.ts';
import {
  SyntheticAuthorizationFailure,
  createSyntheticAuthorizationProofServiceForTesting,
  digestContractForSyntheticAuthorizationProof,
} from '../../native-helpers/grants/synthetic-authorization.ts';
import { createSchemaValidator } from '../../tools/dosai-acceptance/src/schema-validator.mjs';

const root = resolve(import.meta.dirname, '../..');
const validator = await createSchemaValidator(root, [
  'docs/architecture/schemas/v1/common.schema.json',
  'docs/architecture/schemas/v1/resource-precondition.schema.json',
  'docs/architecture/schemas/v1/operation.schema.json',
  'docs/architecture/schemas/v1/action-plan.schema.json',
  'docs/architecture/schemas/v1/policy-decision.schema.json',
  'docs/architecture/schemas/v1/execution-grant.schema.json',
  'docs/architecture/schemas/v1/local-owner-approval.schema.json',
]);

const ids = Object.freeze({
  actor: 'dosai.synthetic.actor',
  owner: 'dosai.local.owner',
  message: '2ebf8d42-d65e-4542-af98-f5d5cbfc3745',
  operation: '3f8580d9-a025-42cb-b9a7-0d8cd0a5b5ea',
  plan: '8ca7b0d5-519c-4ee5-9a4f-3375c2cc9857',
  precondition: '17f92f34-289a-4b67-bb31-20fbd8587ddc',
  resource: '8d57be14-a788-4725-b626-a3a4cb85a333',
  session: '7aab7f4b-ce9d-4565-88c1-820cdf399539',
  trace: '8464cca6-5260-48e2-b6a4-fdbd817084b4',
});
const initialTime = Date.parse('2026-07-31T21:10:00.000Z');
const evidenceRequirements = Object.freeze([
  'AUDIT_DURABLE_ACK',
  'FRESH_LOCAL_APPROVAL',
  'POLICY_DECISION',
  'SIGNED_CHECKPOINT',
]);

function validates(schemaId, value) {
  return validator.getSchema(schemaId)?.(value) === true;
}

function envelope(schemaId, createdAt, producer = 'dosai.contracts') {
  return {
    schema_id: schemaId,
    schema_version: 1,
    message_id: randomUUID(),
    created_at: createdAt,
    producer,
    producer_generation: '1',
    trace_id: ids.trace,
    data_class: 'D5',
  };
}

function buildContracts({
  now = initialTime,
  actorId = ids.actor,
  sessionId = ids.session,
  resourceId = ids.resource,
  resourceGeneration = '7',
  environment = 'STAGING',
  effectProfile = 'MUTATE_LOCAL',
  expectedEffects = ['LOCAL_MUTATION'],
  minimumTier = 'RED',
  approvalRequirement = 'FRESH_LOCAL',
  effectiveCapabilities = ['policy.preflight'],
  evidence = evidenceRequirements,
} = {}) {
  const createdAt = new Date(now).toISOString();
  const operation = {
    ...envelope('urn:dosai:schema:operation:1', createdAt),
    operation_id: ids.operation,
    operation_kind: 'SYNTHETIC_POLICY_PROBE',
    actor: { actor_id: actorId, actor_generation: '4', session_id: sessionId },
    target: {
      resource_id: resourceId,
      resource_kind: 'SYNTHETIC_RESOURCE',
      environment,
      generation: resourceGeneration,
    },
    requested_capabilities: ['policy.preflight'],
    effect_profile: effectProfile,
    expected_effects: expectedEffects,
    limits: { deadline_ms: 5000, max_output_bytes: 4096 },
  };
  const precondition = {
    ...envelope('urn:dosai:schema:resource-precondition:1', createdAt),
    precondition_id: ids.precondition,
    resource_id: resourceId,
    resource_kind: 'SYNTHETIC_RESOURCE',
    condition: { kind: 'GENERATION_MATCH', expected_generation: resourceGeneration },
  };
  const operationDigest = digestContractForSyntheticAuthorizationProof(
    operation.schema_id,
    operation,
    validates,
  );
  const preconditionDigest = digestContractForSyntheticAuthorizationProof(
    precondition.schema_id,
    precondition,
    validates,
  );
  const plan = {
    ...envelope('urn:dosai:schema:action-plan:1', createdAt),
    plan_id: ids.plan,
    operation_id: ids.operation,
    operation_digest: operationDigest,
    actor_id: actorId,
    session_id: sessionId,
    target: structuredClone(operation.target),
    resource_preconditions: [{
      precondition_id: ids.precondition,
      precondition_digest: preconditionDigest,
    }],
    policy_version: 'dosai.policy.v1',
    minimum_tier: minimumTier,
    effective_capabilities: effectiveCapabilities,
    approval_requirement: approvalRequirement,
    predicted_effects: expectedEffects,
    evidence_requirements: evidence,
    expires_at: new Date(now + 300_000).toISOString(),
  };
  const policyContext = {
    policyAvailable: true,
    actorId,
    actorGeneration: '4',
    sessionId,
    resourceId,
    resourceGeneration,
    actorCapabilities: ['policy.preflight'],
    ownerCapabilities: ['policy.preflight'],
    policyCapabilities: ['policy.preflight'],
    capabilityEnvelopeActive: false,
    capabilityEnvelopeCapabilities: [],
  };
  return { operation, preconditions: [precondition], plan, policyContext };
}

function serviceHarness(ownerId = ids.owner) {
  let currentTime = initialTime;
  const service = createSyntheticAuthorizationProofServiceForTesting({
    ownerId,
    validate: validates,
    clock: () => new Date(currentTime),
  });
  return {
    service,
    setTime(value) {
      currentTime = value;
    },
  };
}

async function auditFixture() {
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'dosai-grant-proof-')));
  const databasePath = join(directory, 'audit.sqlite3');
  return { directory, databasePath };
}

function failure(code) {
  return (error) => {
    assert.ok(error instanceof SyntheticAuthorizationFailure);
    assert.equal(error.code, code);
    assert.equal(error.effectState, 'NO_EFFECT');
    return true;
  };
}

function authorizationInput(contracts, approval, audit, overrides = {}) {
  return {
    ...contracts,
    approval,
    auditDatabasePath: audit.databasePath,
    checkpointAuthority: createSoftwareCheckpointAuthorityForTesting(),
    requiredAssurance: 'SIGNED_LOCAL_SOFTWARE',
    ...overrides,
  };
}

async function issueLease(harness = serviceHarness(), contracts = buildContracts()) {
  const audit = await auditFixture();
  const approval = harness.service.createOwnerApproval(contracts.plan);
  const lease = harness.service.authorize(authorizationInput(contracts, approval, audit));
  return { ...harness, contracts, audit, approval, lease };
}

async function cleanupAudit(audit) {
  await rm(audit.directory, { recursive: true, force: true });
}

test('grant proof module exposes no effect or general-purpose authority', () => {
  assert.deepEqual(Object.keys(authorizationModule).sort(), [
    'SyntheticAuthorizationFailure',
    'createSyntheticAuthorizationProofServiceForTesting',
    'digestContractForSyntheticAuthorizationProof',
  ]);
  const { service } = serviceHarness();
  assert.deepEqual(Object.keys(service).sort(), [
    'authorize',
    'consume',
    'createOwnerApproval',
    'emergencyStop',
  ]);
  assert.equal('execute' in service, false);
  assert.equal('spawn' in service, false);
  assert.ok(Object.isFrozen(service));
});

test('exact Red approval, durable audit, signed assurance, and one-use grant yield no effect', async () => {
  const fixture = await issueLease();
  try {
    assert.equal(fixture.lease.assurance.state, 'SIGNED_LOCAL_SOFTWARE');
    assert.equal(fixture.lease.grant.audit_ack_sequence, '2');
    assert.equal(fixture.lease.grant.issuer_id, 'dosai.grants.synthetic-proof');
    assert.equal(fixture.lease.grant.data_class, 'D5');
    assert.equal('opaque_token' in fixture.lease.grant, false);

    const tokenHex = Buffer.from(fixture.lease.opaqueToken).toString('hex');
    const verdict = fixture.service.consume({ lease: fixture.lease, ...fixture.contracts });
    assert.deepEqual(verdict, {
      result: 'PROOF_ACCEPTED',
      effectState: 'NO_EFFECT',
      executionPermitted: false,
      grantId: fixture.lease.grant.grant_id,
      effectiveCapabilities: ['policy.preflight'],
    });
    assert.ok(fixture.lease.opaqueToken.every((byte) => byte === 0));
    assert.throws(
      () => fixture.service.consume({ lease: fixture.lease, ...fixture.contracts }),
      failure('DOSAI_AUTH_REPLAY_0001'),
    );
    const databaseBytes = await readFile(fixture.audit.databasePath);
    assert.equal(databaseBytes.includes(Buffer.from(tokenHex, 'utf8')), false);
  } finally {
    await cleanupAudit(fixture.audit);
  }
});

test('changed target, precondition, evidence, or session burns the grant and cannot be retried', async (t) => {
  const preconditionDrift = buildContracts();
  preconditionDrift.preconditions[0] = {
    ...preconditionDrift.preconditions[0],
    condition: { kind: 'GENERATION_MATCH', expected_generation: '8' },
  };
  preconditionDrift.plan = {
    ...preconditionDrift.plan,
    resource_preconditions: [{
      precondition_id: ids.precondition,
      precondition_digest: digestContractForSyntheticAuthorizationProof(
        preconditionDrift.preconditions[0].schema_id,
        preconditionDrift.preconditions[0],
        validates,
      ),
    }],
  };
  const cases = [
    ['target', buildContracts({ resourceId: '9b3669ad-18d5-487f-b033-51a0b14913ba' })],
    ['precondition', preconditionDrift],
    ['evidence', buildContracts({ evidence: [...evidenceRequirements, 'EXTRA_EVIDENCE'] })],
    ['session', buildContracts({ sessionId: '7747565d-359f-437e-9662-f90d47f83238' })],
  ];
  for (const [name, changed] of cases) {
    await t.test(name, async () => {
      const fixture = await issueLease();
      try {
        assert.throws(
          () => fixture.service.consume({ lease: fixture.lease, ...changed }),
          (error) => error instanceof SyntheticAuthorizationFailure &&
            ['DOSAI_AUTH_BINDING_0001', 'DOSAI_AUTH_GRANT_0001'].includes(error.code),
        );
        assert.throws(
          () => fixture.service.consume({ lease: fixture.lease, ...fixture.contracts }),
          failure('DOSAI_AUTH_REPLAY_0001'),
        );
      } finally {
        await cleanupAudit(fixture.audit);
      }
    });
  }
});

test('forged, stale, replayed, self-approved, and Black approvals fail closed', async (t) => {
  await t.test('forged', async () => {
    const harness = serviceHarness();
    const contracts = buildContracts();
    const approval = harness.service.createOwnerApproval(contracts.plan);
    const audit = await auditFixture();
    try {
      assert.throws(
        () => harness.service.authorize(authorizationInput(
          contracts,
          structuredClone(approval),
          audit,
        )),
        failure('DOSAI_AUTH_APPROVAL_0001'),
      );
    } finally {
      await cleanupAudit(audit);
    }
  });

  await t.test('stale', async () => {
    const harness = serviceHarness();
    const contracts = buildContracts();
    const approval = harness.service.createOwnerApproval(contracts.plan);
    harness.setTime(initialTime + 60_001);
    const audit = await auditFixture();
    try {
      assert.throws(
        () => harness.service.authorize(authorizationInput(contracts, approval, audit)),
        failure('DOSAI_AUTH_EXPIRED_0001'),
      );
    } finally {
      await cleanupAudit(audit);
    }
  });

  await t.test('replayed', async () => {
    const fixture = await issueLease();
    const secondAudit = await auditFixture();
    try {
      assert.throws(
        () => fixture.service.authorize(authorizationInput(
          fixture.contracts,
          fixture.approval,
          secondAudit,
        )),
        failure('DOSAI_AUTH_REPLAY_0001'),
      );
    } finally {
      await cleanupAudit(fixture.audit);
      await cleanupAudit(secondAudit);
    }
  });

  await t.test('self-approved', () => {
    const { service } = serviceHarness(ids.actor);
    assert.throws(
      () => service.createOwnerApproval(buildContracts().plan),
      failure('DOSAI_AUTH_APPROVAL_0001'),
    );
  });

  await t.test('Black', () => {
    const { service } = serviceHarness();
    const contracts = buildContracts({
      environment: 'PRODUCTION',
      minimumTier: 'BLACK',
      approvalRequirement: 'PROHIBITED',
      effectiveCapabilities: [],
    });
    assert.throws(
      () => service.createOwnerApproval(contracts.plan),
      failure('DOSAI_AUTH_APPROVAL_0001'),
    );
  });
});

test('schema, policy, audit, key, and assurance failures mint no usable grant', async (t) => {
  await t.test('schema', async () => {
    const harness = serviceHarness();
    const contracts = buildContracts();
    const approval = harness.service.createOwnerApproval(contracts.plan);
    const audit = await auditFixture();
    try {
      assert.throws(
        () => harness.service.authorize(authorizationInput(
          { ...contracts, operation: { ...contracts.operation, command: 'echo unsafe' } },
          approval,
          audit,
        )),
        /DOSAI_SCHEMA_0001/,
      );
    } finally {
      await cleanupAudit(audit);
    }
  });

  await t.test('policy unavailable', async () => {
    const harness = serviceHarness();
    const contracts = buildContracts();
    const approval = harness.service.createOwnerApproval(contracts.plan);
    const audit = await auditFixture();
    try {
      assert.throws(
        () => harness.service.authorize(authorizationInput({
          ...contracts,
          policyContext: { ...contracts.policyContext, policyAvailable: false },
        }, approval, audit)),
        failure('DOSAI_AUTH_POLICY_0001'),
      );
    } finally {
      await cleanupAudit(audit);
    }
  });

  await t.test('capability withdrawn', async () => {
    const harness = serviceHarness();
    const contracts = buildContracts();
    const approval = harness.service.createOwnerApproval(contracts.plan);
    const audit = await auditFixture();
    try {
      assert.throws(
        () => harness.service.authorize(authorizationInput({
          ...contracts,
          policyContext: { ...contracts.policyContext, ownerCapabilities: [] },
        }, approval, audit)),
        failure('DOSAI_AUTH_POLICY_0001'),
      );
    } finally {
      await cleanupAudit(audit);
    }
  });

  await t.test('audit unavailable', () => {
    const harness = serviceHarness();
    const contracts = buildContracts();
    const approval = harness.service.createOwnerApproval(contracts.plan);
    assert.throws(
      () => harness.service.authorize(authorizationInput(contracts, approval, {
        databasePath: '/unavailable/audit.sqlite3',
      })),
      failure('DOSAI_AUTH_AUDIT_0001'),
    );
  });

  await t.test('audit persistence path', async () => {
    const harness = serviceHarness();
    const contracts = buildContracts();
    const approval = harness.service.createOwnerApproval(contracts.plan);
    const audit = await auditFixture();
    try {
      assert.throws(
        () => harness.service.authorize(authorizationInput(contracts, approval, audit, {
          auditDatabasePath: join(audit.directory, 'missing', 'audit.sqlite3'),
        })),
        failure('DOSAI_AUTH_AUDIT_0001'),
      );
    } finally {
      await cleanupAudit(audit);
    }
  });

  await t.test('key unavailable', async () => {
    const harness = serviceHarness();
    const contracts = buildContracts();
    const approval = harness.service.createOwnerApproval(contracts.plan);
    const audit = await auditFixture();
    try {
      assert.throws(
        () => harness.service.authorize(authorizationInput(contracts, approval, audit, {
          checkpointAuthority: null,
        })),
        failure('DOSAI_AUTH_KEY_0001'),
      );
    } finally {
      await cleanupAudit(audit);
    }
  });

  await t.test('forged checkpoint authority', async () => {
    const harness = serviceHarness();
    const contracts = buildContracts();
    const approval = harness.service.createOwnerApproval(contracts.plan);
    const audit = await auditFixture();
    try {
      assert.throws(
        () => harness.service.authorize(authorizationInput(contracts, approval, audit, {
          checkpointAuthority: structuredClone(createSoftwareCheckpointAuthorityForTesting()),
        })),
        failure('DOSAI_AUTH_KEY_0001'),
      );
    } finally {
      await cleanupAudit(audit);
    }
  });

  await t.test('anchor unavailable', async () => {
    const harness = serviceHarness();
    const contracts = buildContracts();
    const approval = harness.service.createOwnerApproval(contracts.plan);
    const audit = await auditFixture();
    try {
      assert.throws(
        () => harness.service.authorize(authorizationInput(contracts, approval, audit, {
          requiredAssurance: 'ANCHORED',
        })),
        failure('DOSAI_AUTH_ASSURANCE_0001'),
      );
    } finally {
      await cleanupAudit(audit);
    }
  });
});

test('forged, token-mutated, expired, and cross-service grants fail closed', async (t) => {
  await t.test('forged clone', async () => {
    const fixture = await issueLease();
    try {
      assert.throws(
        () => fixture.service.consume({
          lease: structuredClone(fixture.lease),
          ...fixture.contracts,
        }),
        failure('DOSAI_AUTH_GRANT_0001'),
      );
    } finally {
      await cleanupAudit(fixture.audit);
    }
  });

  await t.test('token mutation', async () => {
    const fixture = await issueLease();
    try {
      fixture.lease.opaqueToken[0] ^= 0xff;
      assert.throws(
        () => fixture.service.consume({ lease: fixture.lease, ...fixture.contracts }),
        failure('DOSAI_AUTH_GRANT_0001'),
      );
      assert.throws(
        () => fixture.service.consume({ lease: fixture.lease, ...fixture.contracts }),
        failure('DOSAI_AUTH_REPLAY_0001'),
      );
    } finally {
      await cleanupAudit(fixture.audit);
    }
  });

  await t.test('expired', async () => {
    const fixture = await issueLease();
    try {
      fixture.setTime(initialTime + 60_001);
      assert.throws(
        () => fixture.service.consume({ lease: fixture.lease, ...fixture.contracts }),
        failure('DOSAI_AUTH_EXPIRED_0001'),
      );
    } finally {
      await cleanupAudit(fixture.audit);
    }
  });

  await t.test('cross-service', async () => {
    const fixture = await issueLease();
    try {
      const other = serviceHarness().service;
      assert.throws(
        () => other.consume({ lease: fixture.lease, ...fixture.contracts }),
        failure('DOSAI_AUTH_GRANT_0001'),
      );
    } finally {
      await cleanupAudit(fixture.audit);
    }
  });
});

test('emergency stop is idempotent, audit-independent, and prevents new authorization', () => {
  const harness = serviceHarness();
  const first = harness.service.emergencyStop();
  const second = harness.service.emergencyStop();
  assert.deepEqual(first, {
    state: 'STOPPED',
    effectState: 'NO_EFFECT',
    executionPermitted: false,
    stopGeneration: '1',
  });
  assert.deepEqual(second, first);
  assert.throws(
    () => harness.service.createOwnerApproval(buildContracts().plan),
    failure('DOSAI_AUTH_STOP_0001'),
  );
});

test('emergency stop invalidates an outstanding grant before revalidation', async () => {
  const fixture = await issueLease();
  try {
    fixture.service.emergencyStop();
    assert.throws(
      () => fixture.service.consume({ lease: fixture.lease, ...fixture.contracts }),
      failure('DOSAI_AUTH_STOP_0001'),
    );
    assert.throws(
      () => fixture.service.consume({ lease: fixture.lease, ...fixture.contracts }),
      failure('DOSAI_AUTH_REPLAY_0001'),
    );
  } finally {
    await cleanupAudit(fixture.audit);
  }
});

test('hostile option accessors are rejected without invocation', () => {
  let invoked = false;
  const candidate = {};
  Object.defineProperty(candidate, 'ownerId', {
    enumerable: true,
    get() {
      invoked = true;
      return ids.owner;
    },
  });
  assert.throws(
    () => createSyntheticAuthorizationProofServiceForTesting(candidate),
    failure('DOSAI_AUTH_PRECONDITION_0001'),
  );
  assert.equal(invoked, false);
});
