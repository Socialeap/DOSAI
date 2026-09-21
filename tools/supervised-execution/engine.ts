import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import {
  admitContract, canonicalContractJson,
  type ContractValidator, type JsonValue,
} from '../../src/contracts/p2/contracts.ts';
import {
  admitSyntheticPolicyContext, evaluateSyntheticPolicy, POLICY_VERSION,
} from '../../src/policy/synthetic-policy.ts';
import {
  createSyntheticAuthorizationProofServiceForTesting,
  digestContractForSyntheticAuthorizationProof,
} from '../../native-helpers/grants/synthetic-authorization.ts';
import { createSoftwareCheckpointAuthorityForTesting } from '../../native-helpers/audit/checkpoint.ts';
import { openAuditJournal, verifyAuditJournal, type JournalIdentity } from '../../native-helpers/audit/journal.ts';
import { AUDIT_DURABILITY_PROFILE, type AuditAcknowledgement } from '../../native-helpers/audit/contracts.ts';
import {
  admitConfiguration, admitRequest, evaluateFixture, FIXTURE, ROUTES, SliceFailure,
  type Request, type FixtureResult,
} from './contracts.ts';

const ACTOR = 'dosai.fixture.actor';
const LIFETIME_MS = 60_000;
const MAX_PLANS = 32;
const SOURCE = 'dosai.fixture.proof';
const SCHEMA = 'urn:dosai:schema:operation:1';
const PRECONDITION = 'urn:dosai:schema:resource-precondition:1';
const PLAN = 'urn:dosai:schema:action-plan:1';

export function digest(value: JsonValue): string {
  function canonical(item: JsonValue): string {
    if (Array.isArray(item)) return `[${item.map(canonical).join(',')}]`;
    if (item !== null && typeof item === 'object') {
      return `{${Object.keys(item).sort().map(key => `${JSON.stringify(key)}:${canonical((item as Record<string, JsonValue>)[key]!)}`).join(',')}}`;
    }
    return JSON.stringify(item);
  }
  return createHash('sha256').update('DOSAI:FIXTURE_EXECUTION:V1\0').update(canonical(value)).digest('hex');
}

export type Prepared = Readonly<{
  status: 'AWAITING_APPROVAL';
  request: Request;
  route: string;
  fixtureDigest: string;
  planDigest: string;
  expiresAt: string;
  approvalInstruction: string;
  authority: 'SYNTHETIC_NO_EFFECT_TEST_ONLY';
}>;
export type ReceiptBody = Readonly<{
  version: 1;
  receiptId: string;
  sessionId: string;
  planDigest: string | null;
  route: string | null;
  status: 'PREPARED' | 'INTENT' | 'SUCCEEDED' | 'DENIED' | 'STOPPED' | 'UNKNOWN';
  reason: string;
  result: FixtureResult | null;
  authorization: Readonly<{ grantId: string; planDigest: string; auditSequence: string; journalSuffix: string }> | null;
  authority: 'SYNTHETIC_NO_EFFECT_TEST_ONLY';
  effects: 'NONE';
  observedAt: string | null;
}>;
export type Receipt = Readonly<{
  body: ReceiptBody;
  digest: string;
  audit: 'LOCAL_DURABLE' | 'UNRECORDED';
  acknowledgement: AuditAcknowledgement | null;
}>;
export type Dependencies = Readonly<{
  databasePath: string;
  validate: ContractValidator;
  configuration: () => unknown;
  policyContext: (identity: Readonly<{ actorId: string; sessionId: string; resourceId: string }>) => unknown;
  clock?: () => Date;
  monotonic?: () => number;
}>;

export function createFixtureExecution(deps: Dependencies) {
  const clock = deps.clock ?? (() => new Date());
  const monotonic = deps.monotonic ?? (() => performance.now());
  const sessionId = randomUUID();
  const token = new Uint8Array(randomBytes(32));
  const fixtureDigest = digest(FIXTURE);
  const service = createSyntheticAuthorizationProofServiceForTesting({
    ownerId: 'dosai.fixture.operator', validate: deps.validate, clock,
  });
  const signer = createSoftwareCheckpointAuthorityForTesting();
  let stopped = false;
  let auditBroken = false;
  let lastTick = -Infinity;
  let attempts = 0;
  let pending: Prepared | null = null;
  let journalIdentity: JournalIdentity | undefined;
  let lastAck: AuditAcknowledgement | null = null;
  const events: Receipt[] = [];
  type State = { operation: unknown; plan: unknown; preconditions: readonly unknown[]; issued: number; consumed: boolean };
  const states = new WeakMap<Prepared, State>();

  function now(): string {
    const date = clock();
    if (!(date instanceof Date) || !Number.isFinite(date.getTime())) throw new SliceFailure('CLOCK_UNAVAILABLE');
    return date.toISOString();
  }
  function tick(): number {
    const value = monotonic();
    if (!Number.isFinite(value) || value < lastTick) throw new SliceFailure('CLOCK_UNAVAILABLE');
    lastTick = value;
    return value;
  }
  function preflight(request: Request) {
    if (stopped) throw new SliceFailure('STOP_ENGAGED');
    if (auditBroken) throw new SliceFailure('AUDIT_UNAVAILABLE');
    admitConfiguration(deps.configuration());
    if (digest(FIXTURE) !== fixtureDigest || request.generation !== '1') throw new SliceFailure('FIXTURE_CHANGED');
    return admitSyntheticPolicyContext(deps.policyContext({
      actorId: ACTOR, sessionId, resourceId: ROUTES[request.action].resourceId,
    }));
  }
  function append(status: ReceiptBody['status'], reason: string, prepared: Prepared | null, result: FixtureResult | null = null, authorization: ReceiptBody['authorization'] = null): Receipt {
    // No unadmitted request, exception message, credential or approval token enters a receipt.
    if (events.length >= 160) auditBroken = true;
    let observedAt: string | null;
    try { observedAt = now(); } catch { observedAt = null; }
    const body: ReceiptBody = Object.freeze({
      version: 1, receiptId: randomUUID(), sessionId,
      planDigest: prepared?.planDigest ?? null, route: prepared?.route ?? null,
      status, reason, result, authorization, authority: 'SYNTHETIC_NO_EFFECT_TEST_ONLY', effects: 'NONE', observedAt,
    });
    const hash = digest(body);
    let acknowledgement: AuditAcknowledgement | null = null;
    let writer;
    try {
      if (auditBroken || observedAt === null) throw new SliceFailure('AUDIT_UNAVAILABLE');
      if (journalIdentity !== undefined && lastAck !== null) {
        verifyAuditJournal(deps.databasePath, journalIdentity, { sequence: lastAck.sequence, eventHash: lastAck.event_hash });
      }
      writer = openAuditJournal({ databasePath: deps.databasePath,
        ...(journalIdentity === undefined ? {} : { expectedIdentity: journalIdentity }), sources: [{
        sourceId: SOURCE, sourceGeneration: '1', provenance: 'DETERMINISTIC_DERIVATION',
        wallClockUncertaintyMs: 5, authenticationToken: token,
      }] });
      if (writer.assurance !== 'LOCAL_DURABLE') throw new SliceFailure('AUDIT_UNAVAILABLE');
      journalIdentity = writer.identity;
      acknowledgement = writer.append(SOURCE, token, {
        schema_id: 'urn:dosai:schema:audit-event-proposal:1', schema_version: 1,
        message_id: body.receiptId, created_at: observedAt, producer: SOURCE, producer_generation: '1',
        trace_id: sessionId, data_class: 'D1', event_kind: 'SYNTHETIC_AUDIT_PROBE',
        payload: { probe_id: body.receiptId, outcome: status === 'DENIED' ? 'DENIED' : status === 'UNKNOWN' ? 'UNKNOWN' : 'PASS',
          policy_decision_digest: { algorithm: 'SHA-256', value: hash } },
      });
      if (acknowledgement.request_message_id !== body.receiptId ||
          acknowledgement.assurance !== 'LOCAL_DURABLE' || acknowledgement.durability !== AUDIT_DURABILITY_PROFILE) {
        throw new SliceFailure('AUDIT_UNAVAILABLE');
      }
      writer.close();
      writer = undefined;
      lastAck = acknowledgement;
    } catch {
      auditBroken = true;
      acknowledgement = null;
    } finally {
      try { writer?.close(); } catch { auditBroken = true; acknowledgement = null; }
    }
    const receipt = Object.freeze({ body, digest: hash,
      audit: acknowledgement === null ? 'UNRECORDED' as const : 'LOCAL_DURABLE' as const, acknowledgement });
    if (events.length < 160) events.push(receipt);
    return receipt;
  }
  function reason(error: unknown): string {
    const sliceCodes = ['INVALID_CONTRACT', 'ACTION_NOT_ALLOWED', 'CONFIGURATION_UNAVAILABLE', 'CLOCK_UNAVAILABLE',
      'STOP_ENGAGED', 'AUDIT_UNAVAILABLE', 'FIXTURE_CHANGED', 'SESSION_LIMIT', 'BUSY', 'POLICY_DENIED',
      'OWNER_DENIED', 'PLAN_EXPIRED', 'INVALID_VERDICT'];
    if (error instanceof SliceFailure && sliceCodes.includes(error.code)) return error.code;
    const codes = ['APPROVAL', 'ASSURANCE', 'AUDIT', 'BINDING', 'EXPIRED', 'GRANT', 'KEY', 'POLICY', 'PRECONDITION', 'REPLAY', 'SCHEMA', 'STOP'].map(code => `DOSAI_AUTH_${code}_0001`);
    if (error instanceof Error && [...codes, 'DOSAI_POLICY_0001', 'DOSAI_SCHEMA_0001', 'DOSAI_PRECONDITION_0001'].includes(error.message)) return error.message;
    return 'DEPENDENCY_UNAVAILABLE';
  }
  function denied(code: string, prepared: Prepared | null = null): Receipt {
    return append('DENIED', code, prepared);
  }

  function prepare(candidate: unknown): Prepared | Receipt {
    try {
      if (++attempts > MAX_PLANS) throw new SliceFailure('SESSION_LIMIT');
      if (pending !== null) throw new SliceFailure('BUSY');
      const request = admitRequest(candidate);
      const context = preflight(request);
      const issued = tick();
      const createdAt = now();
      const envelope = (schemaId: string) => ({ schema_id: schemaId, schema_version: 1,
        message_id: randomUUID(), created_at: createdAt, producer: SOURCE, producer_generation: '1',
        trace_id: sessionId, data_class: 'D5' });
      const operation = admitContract(SCHEMA, {
        ...envelope(SCHEMA), operation_id: randomUUID(), operation_kind: 'SYNTHETIC_POLICY_PROBE',
        actor: { actor_id: ACTOR, actor_generation: '1', session_id: sessionId },
        // Synthetic STAGING forces the existing Red proof path; no real staging resource is accessed.
        target: { resource_id: ROUTES[request.action].resourceId, resource_kind: 'SYNTHETIC_RESOURCE', environment: 'STAGING', generation: '1' },
        requested_capabilities: ['policy.preflight'], effect_profile: 'NONE', expected_effects: ['NONE'],
        limits: { deadline_ms: 5000, max_output_bytes: 4096 },
      }, deps.validate);
      const policy = evaluateSyntheticPolicy(operation, context, deps.validate);
      if (policy.outcome !== 'OWNER_REVIEW_REQUIRED') throw new SliceFailure('POLICY_DENIED');
      const precondition = admitContract(PRECONDITION, {
        ...envelope(PRECONDITION), precondition_id: randomUUID(), resource_id: ROUTES[request.action].resourceId,
        resource_kind: 'SYNTHETIC_RESOURCE', condition: { kind: 'GENERATION_MATCH', expected_generation: '1' },
      }, deps.validate);
      const expiresAt = new Date(Date.parse(createdAt) + LIFETIME_MS).toISOString();
      const plan = admitContract(PLAN, {
        ...envelope(PLAN), plan_id: randomUUID(), operation_id: operation.operation_id,
        operation_digest: digestContractForSyntheticAuthorizationProof(SCHEMA, operation, deps.validate),
        actor_id: ACTOR, session_id: sessionId, target: operation.target,
        resource_preconditions: [{ precondition_id: precondition.precondition_id,
          precondition_digest: digestContractForSyntheticAuthorizationProof(PRECONDITION, precondition, deps.validate) }],
        policy_version: POLICY_VERSION, minimum_tier: 'RED', effective_capabilities: policy.effectiveCapabilities,
        approval_requirement: 'FRESH_LOCAL', predicted_effects: ['NONE'],
        evidence_requirements: ['AUDIT_DURABLE_ACK', 'FRESH_LOCAL_APPROVAL', 'POLICY_DECISION', 'SIGNED_CHECKPOINT'], expires_at: expiresAt,
      }, deps.validate);
      const route = ROUTES[request.action].handler;
      const planDigest = digest({ request, route, fixtureDigest, plan: canonicalContractJson(plan) });
      const prepared: Prepared = Object.freeze({ status: 'AWAITING_APPROVAL', request, route,
        fixtureDigest, planDigest, expiresAt, approvalInstruction: `APPROVE ${planDigest}`,
        authority: 'SYNTHETIC_NO_EFFECT_TEST_ONLY' });
      const receipt = append('PREPARED', 'OWNER_REVIEW_REQUIRED', prepared);
      if (receipt.audit !== 'LOCAL_DURABLE') return denied('AUDIT_UNAVAILABLE', prepared);
      states.set(prepared, { operation, plan, preconditions: [precondition], issued, consumed: false });
      pending = prepared;
      return prepared;
    } catch (error) { return denied(reason(error)); }
  }

  function run(prepared: Prepared, confirmation: unknown): Receipt {
    const state = states.get(prepared);
    if (state === undefined) return denied('UNKNOWN_PLAN');
    if (state.consumed) return denied('PLAN_REPLAYED', prepared);
    state.consumed = true;
    pending = null;
    try {
      if (confirmation !== prepared.approvalInstruction) throw new SliceFailure('OWNER_DENIED');
      const wallTime = Date.parse(now());
      if (wallTime < Date.parse(prepared.expiresAt) - LIFETIME_MS) throw new SliceFailure('CLOCK_UNAVAILABLE');
      if (tick() - state.issued >= LIFETIME_MS || wallTime >= Date.parse(prepared.expiresAt)) throw new SliceFailure('PLAN_EXPIRED');
      let context = preflight(prepared.request);
      if (evaluateSyntheticPolicy(state.operation, context, deps.validate).outcome !== 'OWNER_REVIEW_REQUIRED') throw new SliceFailure('POLICY_DENIED');
      const intent = append('INTENT', 'OPERATOR_CONFIRMED_FIXTURE_ONLY', prepared);
      if (intent.audit !== 'LOCAL_DURABLE') throw new SliceFailure('AUDIT_UNAVAILABLE');
      const approval = service.createOwnerApproval(state.plan);
      // P2's accepted proof API creates a fresh journal; it has no reopen identity input.
      // Preserve that boundary with one new proof journal per immutable plan.
      const journalSuffix = `.grant-${prepared.planDigest}`;
      const lease = service.authorize({
        operation: state.operation, plan: state.plan, preconditions: state.preconditions,
        approval, policyContext: context, auditDatabasePath: deps.databasePath + journalSuffix,
        checkpointAuthority: signer, requiredAssurance: 'SIGNED_LOCAL_SOFTWARE',
      });
      // A grant never substitutes for fresh configuration, identity and permission checks.
      try {
        context = preflight(prepared.request);
        if (tick() - state.issued >= LIFETIME_MS) throw new SliceFailure('PLAN_EXPIRED');
        const verdict = service.consume({ lease, operation: state.operation, plan: state.plan,
          preconditions: state.preconditions, policyContext: context });
        if (verdict.result !== 'PROOF_ACCEPTED' || verdict.executionPermitted !== false) throw new SliceFailure('INVALID_VERDICT');
      } finally {
        // Revocation also covers a configuration/clock failure before consume.
        lease.opaqueToken.fill(0);
      }
      const result = evaluateFixture(prepared.request.action);
      const authorization = Object.freeze({
        grantId: lease.grant.grant_id as string,
        planDigest: (lease.grant.plan_digest as { value: string }).value,
        auditSequence: lease.grant.audit_ack_sequence as string,
        journalSuffix,
      });
      const receipt = append('SUCCEEDED', 'FIXTURE_EVALUATED', prepared, result, authorization);
      return receipt.audit === 'LOCAL_DURABLE' ? receipt : append('UNKNOWN', 'OUTCOME_AUDIT_UNAVAILABLE', prepared, null, authorization);
    } catch (error) {
      stopped = true;
      service.emergencyStop();
      return denied(reason(error), prepared);
    }
  }

  function stop(): Receipt {
    stopped = true;
    service.emergencyStop();
    if (pending !== null) { const state = states.get(pending); if (state) state.consumed = true; pending = null; }
    return append('STOPPED', 'STOP_ENGAGED', null);
  }
  return Object.freeze({ prepare, run, stop, receipts: () => Object.freeze([...events]) });
}
