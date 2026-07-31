export const AUDIT_SCHEMA_IDS = Object.freeze({
  acknowledgement: 'urn:dosai:schema:audit-acknowledgement:1',
  event: 'urn:dosai:schema:audit-event:1',
  proposal: 'urn:dosai:schema:audit-event-proposal:1',
} as const);

export const AUDIT_ALGORITHM_SUITE = 'DOSAI-JOURNAL-SHA256-JCS-V1' as const;
export const AUDIT_DURABILITY_PROFILE = 'SQLITE_DELETE_EXTRA_FULLFSYNC' as const;

export const AUDIT_PROVENANCE_CLASSES = Object.freeze([
  'AGENT_CLAIM',
  'SUPERVISOR_OBSERVATION',
  'OWNER_APPROVAL',
  'REMOTE_PROVIDER_RECEIPT',
  'DETERMINISTIC_DERIVATION',
  'RECOVERY_INFERENCE',
] as const);

export type AuditProvenance = (typeof AUDIT_PROVENANCE_CLASSES)[number];
export type JsonPrimitive = boolean | number | string | null;
export type JsonValue = JsonPrimitive | readonly JsonValue[] | { readonly [key: string]: JsonValue };

export type Digest = Readonly<{
  algorithm: 'SHA-256';
  value: string;
}>;

export type AuditEventProposal = Readonly<{
  schema_id: typeof AUDIT_SCHEMA_IDS.proposal;
  schema_version: 1;
  message_id: string;
  created_at: string;
  producer: string;
  producer_generation: string;
  trace_id: string;
  data_class: 'D1';
  event_kind: 'SYNTHETIC_AUDIT_PROBE';
  payload: Readonly<{
    probe_id: string;
    outcome: 'PASS' | 'DENIED' | 'UNKNOWN';
    policy_decision_digest: Digest;
  }>;
}>;

export type AuditEvent = Readonly<{
  schema_id: typeof AUDIT_SCHEMA_IDS.event;
  schema_version: 1;
  message_id: string;
  created_at: string;
  producer: 'dosai.audit-writer';
  producer_generation: string;
  trace_id: string;
  data_class: 'D1';
  algorithm_suite: typeof AUDIT_ALGORITHM_SUITE;
  journal_id: string;
  journal_epoch_id: string;
  boot_id: string;
  writer_epoch_id: string;
  sequence: string;
  source: Readonly<{
    source_id: string;
    source_generation: string;
    provenance: AuditProvenance;
  }>;
  observed_at: string;
  wall_clock_uncertainty_ms: number;
  monotonic_ms: string;
  previous_event_hash: Digest;
  request_message_id: string;
  request_digest: Digest;
  acknowledgement_message_id: string;
  event_kind: 'WRITER_EPOCH_STARTED' | 'SYNTHETIC_AUDIT_PROBE';
  payload: Readonly<Record<string, JsonValue>>;
}>;

export type AuditAcknowledgement = Readonly<{
  schema_id: typeof AUDIT_SCHEMA_IDS.acknowledgement;
  schema_version: 1;
  message_id: string;
  created_at: string;
  producer: 'dosai.audit-writer';
  producer_generation: string;
  trace_id: string;
  data_class: 'D1';
  request_message_id: string;
  journal_id: string;
  journal_epoch_id: string;
  sequence: string;
  event_hash: Digest;
  durability: typeof AUDIT_DURABILITY_PROFILE;
  assurance: 'LOCAL_DURABLE';
}>;

const decimalSequencePattern = /^(0|[1-9][0-9]{0,31})$/;
const digestPattern = /^[0-9a-f]{64}$/;
const producerPattern = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/;
const timestampPattern = /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const maximumDepth = 12;
const maximumNodes = 256;
const maximumStringLength = 512;

function fail(): never {
  throw new TypeError('DOSAI_AUDIT_SCHEMA_0001');
}

function clonePlainJson(value: unknown, depth: number, budget: { remaining: number }): JsonValue {
  budget.remaining -= 1;
  if (budget.remaining < 0 || depth > maximumDepth) {
    return fail();
  }
  if (value === null || typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    return value.length <= maximumStringLength ? value : fail();
  }
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && !Object.is(value, -0) ? value : fail();
  }
  if (Array.isArray(value)) {
    const keys = Object.keys(value);
    if (keys.length !== value.length || keys.some((key, index) => key !== String(index))) {
      return fail();
    }
    const clone: JsonValue[] = [];
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (descriptor === undefined || !descriptor.enumerable || !('value' in descriptor)) {
        return fail();
      }
      clone.push(clonePlainJson(descriptor.value, depth + 1, budget));
    }
    return clone;
  }
  if (typeof value !== 'object') {
    return fail();
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    return fail();
  }
  if (Object.getOwnPropertySymbols(value).length !== 0) {
    return fail();
  }
  const clone: Record<string, JsonValue> = Object.create(null);
  for (const key of Object.keys(value).sort()) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !descriptor.enumerable || !('value' in descriptor)) {
      return fail();
    }
    clone[key] = clonePlainJson(descriptor.value, depth + 1, budget);
  }
  return clone;
}

function freezeJson(value: JsonValue): JsonValue {
  if (value !== null && typeof value === 'object') {
    for (const child of Array.isArray(value) ? value : Object.values(value)) {
      freezeJson(child);
    }
    Object.freeze(value);
  }
  return value;
}

function objectValue(value: JsonValue): { readonly [key: string]: JsonValue } {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as { readonly [key: string]: JsonValue }
    : fail();
}

function exactKeys(value: { readonly [key: string]: JsonValue }, expected: readonly string[]): void {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  if (actual.length !== sortedExpected.length || actual.some((key, index) => key !== sortedExpected[index])) {
    fail();
  }
}

function stringField(value: { readonly [key: string]: JsonValue }, key: string): string {
  const field = value[key];
  return typeof field === 'string' ? field : fail();
}

function integerField(value: { readonly [key: string]: JsonValue }, key: string): number {
  const field = value[key];
  return typeof field === 'number' && Number.isSafeInteger(field) && field >= 0 ? field : fail();
}

function assertUuid(value: string): void {
  if (!uuidPattern.test(value)) {
    fail();
  }
}

function assertTimestamp(value: string): void {
  const time = Date.parse(value);
  if (!timestampPattern.test(value) || !Number.isFinite(time) || new Date(time).toISOString() !== value) {
    fail();
  }
}

function assertProducer(value: string): void {
  if (value.length > 96 || !producerPattern.test(value)) {
    fail();
  }
}

function assertSequence(value: string): void {
  if (!decimalSequencePattern.test(value)) {
    fail();
  }
}

function assertDigest(value: JsonValue): void {
  const digest = objectValue(value);
  exactKeys(digest, ['algorithm', 'value']);
  if (digest.algorithm !== 'SHA-256' || !digestPattern.test(stringField(digest, 'value'))) {
    fail();
  }
}

function assertCommonEnvelope(
  value: { readonly [key: string]: JsonValue },
  schemaId: string,
  producer: string | null,
): void {
  if (value.schema_id !== schemaId || value.schema_version !== 1 || value.data_class !== 'D1') {
    fail();
  }
  assertUuid(stringField(value, 'message_id'));
  assertTimestamp(stringField(value, 'created_at'));
  const producerValue = stringField(value, 'producer');
  assertProducer(producerValue);
  if (producer !== null && producerValue !== producer) {
    fail();
  }
  assertSequence(stringField(value, 'producer_generation'));
  assertUuid(stringField(value, 'trace_id'));
}

function assertSyntheticPayload(value: JsonValue): void {
  const payload = objectValue(value);
  exactKeys(payload, ['outcome', 'policy_decision_digest', 'probe_id']);
  assertUuid(stringField(payload, 'probe_id'));
  if (!['PASS', 'DENIED', 'UNKNOWN'].includes(stringField(payload, 'outcome'))) {
    fail();
  }
  assertDigest(payload.policy_decision_digest as JsonValue);
}

function assertWriterEpochPayload(value: JsonValue): void {
  const payload = objectValue(value);
  exactKeys(payload, ['previous_writer_epoch_id']);
  if (payload.previous_writer_epoch_id !== null) {
    assertUuid(stringField(payload, 'previous_writer_epoch_id'));
  }
}

function admit(value: unknown, assertion: (candidate: { readonly [key: string]: JsonValue }) => void): JsonValue {
  const clone = clonePlainJson(value, 0, { remaining: maximumNodes });
  const object = objectValue(clone);
  assertion(object);
  return freezeJson(clone);
}

export function admitAuditEventProposal(value: unknown): AuditEventProposal {
  return admit(value, (proposal) => {
    exactKeys(proposal, [
      'created_at',
      'data_class',
      'event_kind',
      'message_id',
      'payload',
      'producer',
      'producer_generation',
      'schema_id',
      'schema_version',
      'trace_id',
    ]);
    assertCommonEnvelope(proposal, AUDIT_SCHEMA_IDS.proposal, null);
    if (proposal.event_kind !== 'SYNTHETIC_AUDIT_PROBE') {
      fail();
    }
    assertSyntheticPayload(proposal.payload as JsonValue);
  }) as AuditEventProposal;
}

export function admitAuditEvent(value: unknown): AuditEvent {
  return admit(value, (event) => {
    exactKeys(event, [
      'acknowledgement_message_id',
      'algorithm_suite',
      'boot_id',
      'created_at',
      'data_class',
      'event_kind',
      'journal_epoch_id',
      'journal_id',
      'message_id',
      'monotonic_ms',
      'observed_at',
      'payload',
      'previous_event_hash',
      'producer',
      'producer_generation',
      'request_digest',
      'request_message_id',
      'schema_id',
      'schema_version',
      'sequence',
      'source',
      'trace_id',
      'wall_clock_uncertainty_ms',
      'writer_epoch_id',
    ]);
    assertCommonEnvelope(event, AUDIT_SCHEMA_IDS.event, 'dosai.audit-writer');
    if (event.algorithm_suite !== AUDIT_ALGORITHM_SUITE) {
      fail();
    }
    for (const key of [
      'journal_id',
      'journal_epoch_id',
      'boot_id',
      'writer_epoch_id',
      'request_message_id',
      'acknowledgement_message_id',
    ]) {
      assertUuid(stringField(event, key));
    }
    assertSequence(stringField(event, 'sequence'));
    assertTimestamp(stringField(event, 'observed_at'));
    assertSequence(stringField(event, 'monotonic_ms'));
    if (integerField(event, 'wall_clock_uncertainty_ms') > 86_400_000) {
      fail();
    }
    assertDigest(event.previous_event_hash as JsonValue);
    assertDigest(event.request_digest as JsonValue);

    const source = objectValue(event.source as JsonValue);
    exactKeys(source, ['provenance', 'source_generation', 'source_id']);
    assertProducer(stringField(source, 'source_id'));
    assertSequence(stringField(source, 'source_generation'));
    if (!AUDIT_PROVENANCE_CLASSES.includes(stringField(source, 'provenance') as AuditProvenance)) {
      fail();
    }

    if (event.event_kind === 'WRITER_EPOCH_STARTED') {
      if (source.source_id !== 'dosai.audit-writer' || source.provenance !== 'SUPERVISOR_OBSERVATION') {
        fail();
      }
      assertWriterEpochPayload(event.payload as JsonValue);
    } else if (event.event_kind === 'SYNTHETIC_AUDIT_PROBE') {
      assertSyntheticPayload(event.payload as JsonValue);
    } else {
      fail();
    }
  }) as AuditEvent;
}

export function admitAuditAcknowledgement(value: unknown): AuditAcknowledgement {
  return admit(value, (acknowledgement) => {
    exactKeys(acknowledgement, [
      'assurance',
      'created_at',
      'data_class',
      'durability',
      'event_hash',
      'journal_epoch_id',
      'journal_id',
      'message_id',
      'producer',
      'producer_generation',
      'request_message_id',
      'schema_id',
      'schema_version',
      'sequence',
      'trace_id',
    ]);
    assertCommonEnvelope(acknowledgement, AUDIT_SCHEMA_IDS.acknowledgement, 'dosai.audit-writer');
    for (const key of ['request_message_id', 'journal_id', 'journal_epoch_id']) {
      assertUuid(stringField(acknowledgement, key));
    }
    assertSequence(stringField(acknowledgement, 'sequence'));
    assertDigest(acknowledgement.event_hash as JsonValue);
    if (
      acknowledgement.durability !== AUDIT_DURABILITY_PROFILE ||
      acknowledgement.assurance !== 'LOCAL_DURABLE'
    ) {
      fail();
    }
  }) as AuditAcknowledgement;
}

function canonicalValue(value: JsonValue): JsonValue {
  if (Array.isArray(value)) {
    return value.map(canonicalValue);
  }
  if (value !== null && typeof value === 'object') {
    const object = value as { readonly [key: string]: JsonValue };
    return Object.fromEntries(
      Object.keys(object)
        .sort()
        .map((key) => [key, canonicalValue(object[key] as JsonValue)]),
    );
  }
  return value;
}

export function canonicalAuditJson(value: JsonValue): string {
  return JSON.stringify(canonicalValue(value));
}
