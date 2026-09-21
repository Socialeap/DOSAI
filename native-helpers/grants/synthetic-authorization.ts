import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';

import {
  admitContract,
  canonicalContractJson,
  type ContractValidator,
  type ImmutableContract,
  type JsonValue,
  type P2SchemaId,
} from '../../src/contracts/p2/contracts.ts';
import {
  POLICY_VERSION,
  evaluateSyntheticPolicy,
  type SyntheticPolicyContext,
  type SyntheticPolicyEvaluation,
} from '../../src/policy/synthetic-policy.ts';
import {
  CheckpointFailure,
  createSignedAuditCheckpoint,
  evaluateAuditAssurance,
  type AuditAssuranceReport,
  type AuditAssuranceState,
  type CheckpointSigningAuthority,
} from '../audit/checkpoint.ts';
import {
  AUDIT_DURABILITY_PROFILE,
  AUDIT_SCHEMA_IDS,
  type AuditAcknowledgement,
  type Digest,
} from '../audit/contracts.ts';
import {
  AuditJournalFailure,
  openAuditJournal,
  type JournalIdentity,
} from '../audit/journal.ts';

const APPROVAL_SCHEMA_ID = 'urn:dosai:schema:local-owner-approval:1' as const;
const OPERATION_SCHEMA_ID = 'urn:dosai:schema:operation:1' as const;
const PLAN_SCHEMA_ID = 'urn:dosai:schema:action-plan:1' as const;
const POLICY_DECISION_SCHEMA_ID = 'urn:dosai:schema:policy-decision:1' as const;
const PRECONDITION_SCHEMA_ID = 'urn:dosai:schema:resource-precondition:1' as const;
const GRANT_SCHEMA_ID = 'urn:dosai:schema:execution-grant:1' as const;
const CONTRACT_DIGEST_DOMAIN = 'DOSAI:SYNTHETIC_AUTHORIZATION_CONTRACT:V1\0';
const GRANT_LIFETIME_MS = 60_000;
const APPROVAL_LIFETIME_MS = 60_000;
const REQUIRED_PLAN_EVIDENCE = Object.freeze([
  'AUDIT_DURABLE_ACK',
  'FRESH_LOCAL_APPROVAL',
  'POLICY_DECISION',
  'SIGNED_CHECKPOINT',
] as const);

export type RequiredSyntheticAssurance =
  | 'SIGNED_LOCAL_SOFTWARE'
  | 'SIGNED_LOCAL_HARDWARE'
  | 'ANCHORED';

export type SyntheticAuthorizationFailureCode =
  | 'DOSAI_AUTH_APPROVAL_0001'
  | 'DOSAI_AUTH_ASSURANCE_0001'
  | 'DOSAI_AUTH_AUDIT_0001'
  | 'DOSAI_AUTH_BINDING_0001'
  | 'DOSAI_AUTH_EXPIRED_0001'
  | 'DOSAI_AUTH_GRANT_0001'
  | 'DOSAI_AUTH_KEY_0001'
  | 'DOSAI_AUTH_POLICY_0001'
  | 'DOSAI_AUTH_PRECONDITION_0001'
  | 'DOSAI_AUTH_REPLAY_0001'
  | 'DOSAI_AUTH_SCHEMA_0001'
  | 'DOSAI_AUTH_STOP_0001';

export class SyntheticAuthorizationFailure extends Error {
  readonly code: SyntheticAuthorizationFailureCode;
  readonly effectState = 'NO_EFFECT';

  constructor(code: SyntheticAuthorizationFailureCode) {
    super(code);
    this.name = 'SyntheticAuthorizationFailure';
    this.code = code;
  }
}

type AnyP2Contract = ImmutableContract<P2SchemaId>;
type OperationContract = ImmutableContract<typeof OPERATION_SCHEMA_ID>;
type PlanContract = ImmutableContract<typeof PLAN_SCHEMA_ID>;
type PreconditionContract = ImmutableContract<typeof PRECONDITION_SCHEMA_ID>;
type ApprovalContract = ImmutableContract<typeof APPROVAL_SCHEMA_ID>;
type PolicyDecisionContract = ImmutableContract<typeof POLICY_DECISION_SCHEMA_ID>;
type GrantContract = ImmutableContract<typeof GRANT_SCHEMA_ID>;

export type SyntheticOwnerApproval = Readonly<{
  approval: ApprovalContract;
  authority: 'EPHEMERAL_LOCAL_OWNER_TEST_FIXTURE';
}>;

export type SyntheticGrantLease = Readonly<{
  grant: GrantContract;
  opaqueToken: Uint8Array;
  assurance: AuditAssuranceReport;
  authority: 'SYNTHETIC_NO_EFFECT_TEST_ONLY';
}>;

export type SyntheticNoEffectVerdict = Readonly<{
  result: 'PROOF_ACCEPTED';
  effectState: 'NO_EFFECT';
  executionPermitted: false;
  grantId: string;
  effectiveCapabilities: readonly string[];
}>;

export type SyntheticEmergencyStopResult = Readonly<{
  state: 'STOPPED';
  effectState: 'NO_EFFECT';
  executionPermitted: false;
  stopGeneration: '1';
}>;

type ServiceOptions = Readonly<{
  ownerId: string;
  validate: ContractValidator;
  clock: () => Date;
}>;

type AuthorizeOptions = Readonly<{
  operation: unknown;
  preconditions: unknown;
  plan: unknown;
  approval: unknown;
  policyContext: unknown;
  auditDatabasePath: string;
  checkpointAuthority: CheckpointSigningAuthority | null;
  requiredAssurance: RequiredSyntheticAssurance;
}>;

type ConsumeOptions = Readonly<{
  lease: unknown;
  operation: unknown;
  preconditions: unknown;
  plan: unknown;
  policyContext: unknown;
}>;

type ApprovalState = {
  readonly approvalDigest: string;
  consumed: boolean;
};

type GrantState = {
  readonly operationDigest: string;
  readonly planDigest: string;
  readonly tokenHash: Buffer;
  consumed: boolean;
};

const producerPattern = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/;

function fail(code: SyntheticAuthorizationFailureCode): never {
  throw new SyntheticAuthorizationFailure(code);
}

function exactOptions(
  candidate: unknown,
  keys: readonly string[],
  code: SyntheticAuthorizationFailureCode = 'DOSAI_AUTH_PRECONDITION_0001',
): Readonly<Record<string, unknown>> {
  if (candidate === null || typeof candidate !== 'object' || Array.isArray(candidate)) {
    return fail(code);
  }
  const prototype = Object.getPrototypeOf(candidate);
  if (
    (prototype !== Object.prototype && prototype !== null) ||
    Object.getOwnPropertySymbols(candidate).length !== 0 ||
    Object.keys(candidate).sort().join('\0') !== [...keys].sort().join('\0')
  ) {
    return fail(code);
  }
  const values: Record<string, unknown> = Object.create(null);
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(candidate, key);
    if (descriptor === undefined || !descriptor.enumerable || !('value' in descriptor)) {
      return fail(code);
    }
    values[key] = descriptor.value;
  }
  return Object.freeze(values);
}

function record(value: JsonValue): Readonly<Record<string, JsonValue>> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Readonly<Record<string, JsonValue>>
    : fail('DOSAI_AUTH_SCHEMA_0001');
}

function stringField(value: Readonly<Record<string, JsonValue>>, key: string): string {
  return typeof value[key] === 'string'
    ? value[key] as string
    : fail('DOSAI_AUTH_SCHEMA_0001');
}

function stringArray(value: JsonValue | undefined): readonly string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
    ? value as readonly string[]
    : fail('DOSAI_AUTH_SCHEMA_0001');
}

function exactArray(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function exactDigest(left: JsonValue | undefined, right: Digest): boolean {
  const candidate = record(left ?? null);
  return candidate.algorithm === right.algorithm && candidate.value === right.value;
}

function exactJson(left: JsonValue | undefined, right: JsonValue | undefined): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function digestBytes(bytes: Uint8Array): Buffer {
  return createHash('sha256').update(bytes).digest();
}

function digestContract(contract: AnyP2Contract): Digest {
  return Object.freeze({
    algorithm: 'SHA-256',
    value: createHash('sha256')
      .update(CONTRACT_DIGEST_DOMAIN, 'utf8')
      .update(canonicalContractJson(contract), 'utf8')
      .digest('hex'),
  });
}

export function digestContractForSyntheticAuthorizationProof(
  schemaId: P2SchemaId,
  candidate: unknown,
  validate: ContractValidator,
): Digest {
  return digestContract(admitContract(schemaId, candidate, validate));
}

function exactTimestamp(clock: () => Date): string {
  let value;
  try {
    value = clock();
  } catch {
    return fail('DOSAI_AUTH_PRECONDITION_0001');
  }
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    return fail('DOSAI_AUTH_PRECONDITION_0001');
  }
  return value.toISOString();
}

function assertCurrentWindow(now: string, expiresAt: string): void {
  if (Date.parse(now) >= Date.parse(expiresAt)) {
    fail('DOSAI_AUTH_EXPIRED_0001');
  }
}

function admitPreconditions(
  candidate: unknown,
  validate: ContractValidator,
): readonly PreconditionContract[] {
  if (!Array.isArray(candidate) || candidate.length === 0 || candidate.length > 32) {
    return fail('DOSAI_AUTH_SCHEMA_0001');
  }
  return Object.freeze(candidate.map((precondition) =>
    admitContract(PRECONDITION_SCHEMA_ID, precondition, validate),
  ));
}

function requireRedPolicy(
  operation: OperationContract,
  policyContext: unknown,
  validate: ContractValidator,
): SyntheticPolicyEvaluation {
  const evaluation = evaluateSyntheticPolicy(operation, policyContext, validate);
  if (
    evaluation.policyVersion !== POLICY_VERSION ||
    evaluation.minimumTier !== 'RED' ||
    evaluation.enforcedTier !== 'RED' ||
    evaluation.outcome !== 'OWNER_REVIEW_REQUIRED' ||
    evaluation.approvalRequirement !== 'FRESH_LOCAL' ||
    evaluation.effectiveCapabilities.length === 0
  ) {
    return fail('DOSAI_AUTH_POLICY_0001');
  }
  return evaluation;
}

function assertPlanBinding(
  operation: OperationContract,
  preconditions: readonly PreconditionContract[],
  plan: PlanContract,
  evaluation: SyntheticPolicyEvaluation,
): void {
  const operationRecord = record(operation);
  const actor = record(operationRecord.actor ?? null);
  const target = record(operationRecord.target ?? null);
  const planRecord = record(plan);
  const references = planRecord.resource_preconditions;
  if (
    planRecord.operation_id !== operationRecord.operation_id ||
    !exactDigest(planRecord.operation_digest, digestContract(operation)) ||
    planRecord.actor_id !== actor.actor_id ||
    planRecord.session_id !== actor.session_id ||
    !exactJson(planRecord.target, operationRecord.target) ||
    planRecord.policy_version !== evaluation.policyVersion ||
    planRecord.minimum_tier !== evaluation.minimumTier ||
    planRecord.approval_requirement !== evaluation.approvalRequirement ||
    !exactArray(stringArray(planRecord.effective_capabilities), evaluation.effectiveCapabilities) ||
    !exactArray(stringArray(planRecord.predicted_effects), stringArray(operationRecord.expected_effects)) ||
    !exactArray(stringArray(planRecord.evidence_requirements), REQUIRED_PLAN_EVIDENCE) ||
    !Array.isArray(references) ||
    references.length !== preconditions.length
  ) {
    fail('DOSAI_AUTH_BINDING_0001');
  }

  for (let index = 0; index < preconditions.length; index += 1) {
    const precondition = preconditions[index] as PreconditionContract;
    const preconditionRecord = record(precondition);
    const reference = record(references[index] as JsonValue);
    const condition = record(preconditionRecord.condition ?? null);
    if (
      reference.precondition_id !== preconditionRecord.precondition_id ||
      !exactDigest(reference.precondition_digest, digestContract(precondition)) ||
      preconditionRecord.resource_id !== target.resource_id ||
      preconditionRecord.resource_kind !== target.resource_kind ||
      condition.kind !== 'GENERATION_MATCH' ||
      condition.expected_generation !== target.generation
    ) {
      fail('DOSAI_AUTH_BINDING_0001');
    }
  }
}

function assuranceMeets(
  required: RequiredSyntheticAssurance,
  actual: AuditAssuranceState,
): boolean {
  if (required === 'SIGNED_LOCAL_SOFTWARE') {
    return ['SIGNED_LOCAL_SOFTWARE', 'SIGNED_LOCAL_HARDWARE', 'ANCHORED'].includes(actual);
  }
  if (required === 'SIGNED_LOCAL_HARDWARE') {
    return ['SIGNED_LOCAL_HARDWARE', 'ANCHORED'].includes(actual);
  }
  return actual === 'ANCHORED';
}

function buildDecision(
  plan: PlanContract,
  evaluation: SyntheticPolicyEvaluation,
  now: string,
  validate: ContractValidator,
): PolicyDecisionContract {
  const planRecord = record(plan);
  return admitContract(POLICY_DECISION_SCHEMA_ID, {
    schema_id: POLICY_DECISION_SCHEMA_ID,
    schema_version: 1,
    message_id: randomUUID(),
    created_at: now,
    producer: 'dosai.policy',
    producer_generation: '1',
    trace_id: stringField(planRecord, 'trace_id'),
    data_class: 'D5',
    decision_id: randomUUID(),
    plan_id: stringField(planRecord, 'plan_id'),
    plan_digest: digestContract(plan),
    policy_version: evaluation.policyVersion,
    minimum_tier: evaluation.minimumTier,
    enforced_tier: evaluation.enforcedTier,
    result: 'ALLOW',
    reason_codes: ['FRESH_LOCAL_APPROVAL_VERIFIED'],
    effective_capabilities: evaluation.effectiveCapabilities,
    approval_requirement: evaluation.approvalRequirement,
    grant_eligible: true,
  }, validate);
}

function appendDecisionAudit(
  databasePath: unknown,
  authenticationToken: Uint8Array,
  decision: PolicyDecisionContract,
  now: string,
): Readonly<{
  acknowledgement: AuditAcknowledgement;
  identity: JournalIdentity;
}> {
  if (typeof databasePath !== 'string') {
    return fail('DOSAI_AUTH_AUDIT_0001');
  }
  const decisionRecord = record(decision);
  const proposal = {
    schema_id: AUDIT_SCHEMA_IDS.proposal,
    schema_version: 1,
    message_id: randomUUID(),
    created_at: now,
    producer: 'dosai.grants',
    producer_generation: '1',
    trace_id: stringField(decisionRecord, 'trace_id'),
    data_class: 'D1',
    event_kind: 'SYNTHETIC_AUDIT_PROBE',
    payload: {
      probe_id: stringField(decisionRecord, 'decision_id'),
      outcome: 'PASS',
      policy_decision_digest: digestContract(decision),
    },
  } as const;

  let writer;
  let acknowledgement;
  let identity;
  try {
    writer = openAuditJournal({
      databasePath,
      sources: [Object.freeze({
        sourceId: 'dosai.grants',
        sourceGeneration: '1',
        provenance: 'DETERMINISTIC_DERIVATION',
        wallClockUncertaintyMs: 5,
        authenticationToken,
      })],
    });
    if (writer.assurance !== 'LOCAL_DURABLE') {
      return fail('DOSAI_AUTH_AUDIT_0001');
    }
    const durability = writer.durabilityStatus;
    if (
      durability.journalMode !== 'DELETE' ||
      durability.synchronous !== 'EXTRA' ||
      !durability.fullFsync ||
      !durability.checkpointFullFsync ||
      durability.lockingMode !== 'EXCLUSIVE'
    ) {
      return fail('DOSAI_AUTH_AUDIT_0001');
    }
    identity = writer.identity;
    acknowledgement = writer.append('dosai.grants', authenticationToken, proposal);
    if (
      acknowledgement.assurance !== 'LOCAL_DURABLE' ||
      acknowledgement.durability !== AUDIT_DURABILITY_PROFILE ||
      acknowledgement.request_message_id !== proposal.message_id ||
      acknowledgement.journal_id !== identity.journalId ||
      acknowledgement.journal_epoch_id !== identity.journalEpochId ||
      writer.assurance !== 'LOCAL_DURABLE'
    ) {
      return fail('DOSAI_AUTH_AUDIT_0001');
    }
  } catch (error) {
    if (error instanceof SyntheticAuthorizationFailure) {
      throw error;
    }
    return fail('DOSAI_AUTH_AUDIT_0001');
  } finally {
    try {
      writer?.close();
    } catch {
      return fail('DOSAI_AUTH_AUDIT_0001');
    }
  }
  return Object.freeze({ acknowledgement, identity });
}

function establishAssurance(
  databasePath: unknown,
  identity: JournalIdentity,
  acknowledgement: AuditAcknowledgement,
  authority: CheckpointSigningAuthority | null,
  required: RequiredSyntheticAssurance,
): AuditAssuranceReport {
  if (authority === null) {
    return fail('DOSAI_AUTH_KEY_0001');
  }
  if (typeof databasePath !== 'string') {
    return fail('DOSAI_AUTH_PRECONDITION_0001');
  }
  let checkpoint;
  try {
    checkpoint = createSignedAuditCheckpoint({
      databasePath,
      expectedIdentity: identity,
      producerGeneration: '1',
      transition: { kind: 'GENESIS', reasonCode: 'INITIAL_INSTALL' },
      activeAuthority: authority,
      expectedPreviousCheckpointDigest: null,
      expectedPreviousAnchorReceiptDigest: null,
      requiredJournalHead: {
        sequence: acknowledgement.sequence,
        eventHash: acknowledgement.event_hash,
      },
    });
  } catch (error) {
    if (error instanceof AuditJournalFailure) {
      return fail('DOSAI_AUTH_AUDIT_0001');
    }
    if (
      error instanceof CheckpointFailure &&
      error.code !== 'DOSAI_CHECKPOINT_AUTHORITY_0001' &&
      error.code !== 'DOSAI_CHECKPOINT_SIGNATURE_0001'
    ) {
      return fail('DOSAI_AUTH_ASSURANCE_0001');
    }
    return fail('DOSAI_AUTH_KEY_0001');
  }
  let report;
  try {
    report = evaluateAuditAssurance({
      localDurableThroughSequence: checkpoint.sequence,
      journalBroken: false,
      checkpoint,
      maximumUnanchoredEvents: 64,
      trustedTimeRequired: false,
      trustedTimeAvailable: false,
    });
  } catch {
    return fail('DOSAI_AUTH_ASSURANCE_0001');
  }
  if (
    BigInt(report.localDurableThroughSequence) < BigInt(acknowledgement.sequence) ||
    report.signedThroughSequence === null ||
    BigInt(report.signedThroughSequence) < BigInt(acknowledgement.sequence) ||
    !assuranceMeets(required, report.state)
  ) {
    return fail('DOSAI_AUTH_ASSURANCE_0001');
  }
  return report;
}

export type SyntheticAuthorizationProofService = Readonly<{
  createOwnerApproval(planCandidate: unknown): SyntheticOwnerApproval;
  authorize(optionsCandidate: unknown): SyntheticGrantLease;
  consume(optionsCandidate: unknown): SyntheticNoEffectVerdict;
  emergencyStop(): SyntheticEmergencyStopResult;
}>;

export function createSyntheticAuthorizationProofServiceForTesting(
  optionsCandidate: unknown,
): SyntheticAuthorizationProofService {
  const options = exactOptions(optionsCandidate, ['clock', 'ownerId', 'validate']);
  const ownerId = options.ownerId;
  const validate = options.validate;
  const clock = options.clock;
  if (
    typeof ownerId !== 'string' ||
    !producerPattern.test(ownerId) ||
    typeof validate !== 'function' ||
    typeof clock !== 'function'
  ) {
    return fail('DOSAI_AUTH_PRECONDITION_0001');
  }
  const typedValidate = validate as ContractValidator;
  const typedClock = clock as () => Date;
  const approvals = new WeakMap<object, ApprovalState>();
  const grants = new WeakMap<object, GrantState>();
  const auditAuthenticationToken = new Uint8Array(randomBytes(32));
  let stopEngaged = false;

  function createOwnerApproval(planCandidate: unknown): SyntheticOwnerApproval {
    if (stopEngaged) {
      return fail('DOSAI_AUTH_STOP_0001');
    }
    const plan = admitContract(PLAN_SCHEMA_ID, planCandidate, typedValidate);
    const planRecord = record(plan);
    const actorId = stringField(planRecord, 'actor_id');
    const now = exactTimestamp(typedClock);
    if (
      planRecord.minimum_tier !== 'RED' ||
      planRecord.approval_requirement !== 'FRESH_LOCAL' ||
      ownerId === actorId
    ) {
      return fail('DOSAI_AUTH_APPROVAL_0001');
    }
    assertCurrentWindow(now, stringField(planRecord, 'expires_at'));
    const expiresAt = new Date(Math.min(
      Date.parse(now) + APPROVAL_LIFETIME_MS,
      Date.parse(stringField(planRecord, 'expires_at')),
    )).toISOString();
    const approval = admitContract(APPROVAL_SCHEMA_ID, {
      schema_id: APPROVAL_SCHEMA_ID,
      schema_version: 1,
      message_id: randomUUID(),
      created_at: now,
      producer: 'dosai.owner-approval',
      producer_generation: '1',
      trace_id: stringField(planRecord, 'trace_id'),
      data_class: 'D1',
      approval_id: randomUUID(),
      plan_id: stringField(planRecord, 'plan_id'),
      plan_digest: digestContract(plan),
      operation_digest: planRecord.operation_digest,
      actor_id: actorId,
      session_id: stringField(planRecord, 'session_id'),
      owner_id: ownerId,
      approval_decision: 'APPROVE',
      approval_method: 'LOCAL_OWNER_CONFIRMATION_TEST_ONLY',
      owner_presence_nonce: randomUUID(),
      approved_at: now,
      expires_at: expiresAt,
    }, typedValidate);
    const proof = Object.freeze({
      approval,
      authority: 'EPHEMERAL_LOCAL_OWNER_TEST_FIXTURE' as const,
    });
    approvals.set(proof, { approvalDigest: digestContract(approval).value, consumed: false });
    return proof;
  }

  function authorize(optionsValue: unknown): SyntheticGrantLease {
    if (stopEngaged) {
      return fail('DOSAI_AUTH_STOP_0001');
    }
    const input = exactOptions(optionsValue, [
      'approval',
      'auditDatabasePath',
      'checkpointAuthority',
      'operation',
      'plan',
      'policyContext',
      'preconditions',
      'requiredAssurance',
    ]);
    if (!['SIGNED_LOCAL_SOFTWARE', 'SIGNED_LOCAL_HARDWARE', 'ANCHORED'].includes(
      String(input.requiredAssurance),
    )) {
      return fail('DOSAI_AUTH_ASSURANCE_0001');
    }
    const now = exactTimestamp(typedClock);
    const operation = admitContract(OPERATION_SCHEMA_ID, input.operation, typedValidate);
    const preconditions = admitPreconditions(input.preconditions, typedValidate);
    const plan = admitContract(PLAN_SCHEMA_ID, input.plan, typedValidate);
    const evaluation = requireRedPolicy(operation, input.policyContext, typedValidate);
    assertPlanBinding(operation, preconditions, plan, evaluation);
    assertCurrentWindow(now, stringField(record(plan), 'expires_at'));

    if (input.approval === null || typeof input.approval !== 'object') {
      return fail('DOSAI_AUTH_APPROVAL_0001');
    }
    const approvalState = approvals.get(input.approval);
    if (approvalState === undefined) {
      return fail('DOSAI_AUTH_APPROVAL_0001');
    }
    if (approvalState.consumed) {
      return fail('DOSAI_AUTH_REPLAY_0001');
    }
    approvalState.consumed = true;
    const approvalProof = input.approval as SyntheticOwnerApproval;
    const approval = approvalProof.approval;
    const approvalRecord = record(approval);
    const planRecord = record(plan);
    if (
      digestContract(approval).value !== approvalState.approvalDigest ||
      approvalRecord.plan_id !== planRecord.plan_id ||
      !exactDigest(approvalRecord.plan_digest, digestContract(plan)) ||
      !exactDigest(approvalRecord.operation_digest, digestContract(operation)) ||
      approvalRecord.actor_id !== planRecord.actor_id ||
      approvalRecord.session_id !== planRecord.session_id ||
      approvalRecord.owner_id !== ownerId ||
      approvalRecord.owner_id === approvalRecord.actor_id ||
      approvalRecord.approval_decision !== 'APPROVE' ||
      approvalRecord.approval_method !== 'LOCAL_OWNER_CONFIRMATION_TEST_ONLY'
    ) {
      return fail('DOSAI_AUTH_APPROVAL_0001');
    }
    assertCurrentWindow(now, stringField(approvalRecord, 'expires_at'));

    const decision = buildDecision(plan, evaluation, now, typedValidate);
    const audit = appendDecisionAudit(
      input.auditDatabasePath,
      auditAuthenticationToken,
      decision,
      now,
    );
    const assurance = establishAssurance(
      input.auditDatabasePath,
      audit.identity,
      audit.acknowledgement,
      input.checkpointAuthority as CheckpointSigningAuthority | null,
      input.requiredAssurance as RequiredSyntheticAssurance,
    );

    const expiresAt = new Date(Math.min(
      Date.parse(now) + GRANT_LIFETIME_MS,
      Date.parse(stringField(planRecord, 'expires_at')),
      Date.parse(stringField(approvalRecord, 'expires_at')),
    )).toISOString();
    assertCurrentWindow(now, expiresAt);
    const opaqueToken = new Uint8Array(randomBytes(32));
    const tokenHash = digestBytes(opaqueToken);
    const operationDigest = digestContract(operation);
    const planDigest = digestContract(plan);
    const grant = admitContract(GRANT_SCHEMA_ID, {
      schema_id: GRANT_SCHEMA_ID,
      schema_version: 1,
      message_id: randomUUID(),
      created_at: now,
      producer: 'dosai.grants',
      producer_generation: '1',
      trace_id: stringField(planRecord, 'trace_id'),
      data_class: 'D5',
      grant_id: randomUUID(),
      opaque_token_hash: { algorithm: 'SHA-256', value: tokenHash.toString('hex') },
      operation_digest: operationDigest,
      plan_digest: planDigest,
      policy_decision_digest: digestContract(decision),
      actor_id: stringField(planRecord, 'actor_id'),
      session_id: stringField(planRecord, 'session_id'),
      effective_capabilities: evaluation.effectiveCapabilities,
      policy_version: evaluation.policyVersion,
      issuer_id: 'dosai.grants.synthetic-proof',
      nonce: randomUUID(),
      issued_at: now,
      expires_at: expiresAt,
      audit_ack_sequence: audit.acknowledgement.sequence,
      grant_state: 'ISSUED',
      use_limit: 1,
    }, typedValidate);
    const lease = Object.freeze({
      grant,
      opaqueToken,
      assurance,
      authority: 'SYNTHETIC_NO_EFFECT_TEST_ONLY' as const,
    });
    grants.set(lease, {
      operationDigest: operationDigest.value,
      planDigest: planDigest.value,
      tokenHash,
      consumed: false,
    });
    return lease;
  }

  function consume(optionsValue: unknown): SyntheticNoEffectVerdict {
    const input = exactOptions(optionsValue, [
      'lease',
      'operation',
      'plan',
      'policyContext',
      'preconditions',
    ]);
    if (input.lease === null || typeof input.lease !== 'object') {
      return fail('DOSAI_AUTH_GRANT_0001');
    }
    const grantState = grants.get(input.lease);
    if (grantState === undefined) {
      return fail('DOSAI_AUTH_GRANT_0001');
    }
    if (grantState.consumed) {
      return fail('DOSAI_AUTH_REPLAY_0001');
    }
    grantState.consumed = true;
    const lease = input.lease as SyntheticGrantLease;
    const token = lease.opaqueToken;
    if (
      Object.getPrototypeOf(token) !== Uint8Array.prototype ||
      !timingSafeEqual(digestBytes(token), grantState.tokenHash)
    ) {
      token.fill(0);
      return fail('DOSAI_AUTH_GRANT_0001');
    }
    token.fill(0);
    if (stopEngaged) {
      return fail('DOSAI_AUTH_STOP_0001');
    }

    const now = exactTimestamp(typedClock);
    const operation = admitContract(OPERATION_SCHEMA_ID, input.operation, typedValidate);
    const preconditions = admitPreconditions(input.preconditions, typedValidate);
    const plan = admitContract(PLAN_SCHEMA_ID, input.plan, typedValidate);
    const evaluation = requireRedPolicy(operation, input.policyContext, typedValidate);
    assertPlanBinding(operation, preconditions, plan, evaluation);
    const grantRecord = record(lease.grant);
    const planRecord = record(plan);
    assertCurrentWindow(now, stringField(grantRecord, 'expires_at'));
    if (
      digestContract(operation).value !== grantState.operationDigest ||
      digestContract(plan).value !== grantState.planDigest ||
      !exactDigest(grantRecord.operation_digest, digestContract(operation)) ||
      !exactDigest(grantRecord.plan_digest, digestContract(plan)) ||
      grantRecord.actor_id !== planRecord.actor_id ||
      grantRecord.session_id !== planRecord.session_id ||
      grantRecord.policy_version !== evaluation.policyVersion ||
      !exactArray(stringArray(grantRecord.effective_capabilities), evaluation.effectiveCapabilities)
    ) {
      return fail('DOSAI_AUTH_GRANT_0001');
    }
    return Object.freeze({
      result: 'PROOF_ACCEPTED',
      effectState: 'NO_EFFECT',
      executionPermitted: false,
      grantId: stringField(grantRecord, 'grant_id'),
      effectiveCapabilities: Object.freeze([...evaluation.effectiveCapabilities]),
    });
  }

  function emergencyStop(): SyntheticEmergencyStopResult {
    stopEngaged = true;
    return Object.freeze({
      state: 'STOPPED',
      effectState: 'NO_EFFECT',
      executionPermitted: false,
      stopGeneration: '1',
    });
  }

  return Object.freeze({ createOwnerApproval, authorize, consume, emergencyStop });
}
