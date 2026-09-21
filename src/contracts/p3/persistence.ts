import {
  CAPSULE_STATES,
  CANCELLATION_REASONS,
  admitFixedSafeTestCapsuleRequest,
  type CancellationReason,
  type CapsuleRequest,
  type CapsuleState,
} from './contracts.ts';

const DECIMAL_SEQUENCE = /^(0|[1-9][0-9]*)$/;
const REGISTRY_KEYS = Object.freeze([
  'schema_id',
  'schema_version',
  'supervisor_generation',
  'revision',
  'updated_at_ms',
  'records',
] as const);
const RECORD_KEYS = Object.freeze([
  'request',
  'state',
  'registered_at_ms',
  'deadline_at_ms',
  'output_bytes',
  'process_attached',
] as const);

export type PersistedCapsuleRecord = Readonly<{
  readonly request: CapsuleRequest;
  readonly state: CapsuleState;
  readonly registered_at_ms: number;
  readonly deadline_at_ms: number;
  readonly output_bytes: number;
  readonly process_attached: boolean;
  readonly last_cancellation_reason?: CancellationReason;
}>;

export type CapsuleRegistryDocument = Readonly<{
  readonly schema_id: 'urn:dosai:schema:capsule-registry:1';
  readonly schema_version: 1;
  readonly supervisor_generation: string;
  readonly revision: string;
  readonly updated_at_ms: number;
  readonly records: readonly PersistedCapsuleRecord[];
}>;

export type ReconciledCapsuleRegistry = Readonly<{
  readonly document: CapsuleRegistryDocument;
  readonly quarantined_capsule_ids: readonly string[];
}>;

function exactObject(candidate: unknown, keys: readonly string[]): Record<string, unknown> {
  if (candidate === null || typeof candidate !== 'object' || Array.isArray(candidate)) {
    throw new TypeError('DOSAI_CAPSULE_REGISTRY_SCHEMA_0001');
  }
  const prototype = Object.getPrototypeOf(candidate);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError('DOSAI_CAPSULE_REGISTRY_SCHEMA_0001');
  }
  if (
    Object.getOwnPropertySymbols(candidate).length !== 0 ||
    Object.keys(candidate).sort().join('\0') !== [...keys].sort().join('\0')
  ) {
    throw new TypeError('DOSAI_CAPSULE_REGISTRY_SCHEMA_0001');
  }
  const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(candidate, key);
    if (descriptor === undefined || !descriptor.enumerable || !('value' in descriptor)) {
      throw new TypeError('DOSAI_CAPSULE_REGISTRY_SCHEMA_0001');
    }
    result[key] = descriptor.value;
  }
  return result;
}

function sequence(value: unknown): string {
  if (typeof value !== 'string' || !DECIMAL_SEQUENCE.test(value)) {
    throw new TypeError('DOSAI_CAPSULE_REGISTRY_SCHEMA_0001');
  }
  return value;
}

function safeInteger(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new TypeError('DOSAI_CAPSULE_REGISTRY_SCHEMA_0001');
  }
  return value;
}

function admitRecord(candidate: unknown): PersistedCapsuleRecord {
  const candidateKeys = candidate !== null && typeof candidate === 'object' && !Array.isArray(candidate)
    ? Object.keys(candidate)
    : [];
  const hasReason = candidateKeys.includes('last_cancellation_reason');
  const record = exactObject(candidate, hasReason
    ? [...RECORD_KEYS, 'last_cancellation_reason']
    : RECORD_KEYS);
  const request = admitFixedSafeTestCapsuleRequest(record.request);
  const state = record.state;
  const registeredAt = safeInteger(record.registered_at_ms);
  const deadlineAt = safeInteger(record.deadline_at_ms);
  const outputBytes = safeInteger(record.output_bytes);
  if (
    typeof state !== 'string' ||
    !CAPSULE_STATES.includes(state as CapsuleState) ||
    deadlineAt !== registeredAt + request.limits.wall_time_ms ||
    outputBytes > request.limits.max_output_bytes + 1 ||
    typeof record.process_attached !== 'boolean'
  ) {
    throw new TypeError('DOSAI_CAPSULE_REGISTRY_SCHEMA_0001');
  }
  const reason = record.last_cancellation_reason;
  if (
    hasReason &&
    (typeof reason !== 'string' || !CANCELLATION_REASONS.includes(reason as CancellationReason))
  ) {
    throw new TypeError('DOSAI_CAPSULE_REGISTRY_SCHEMA_0001');
  }
  return Object.freeze({
    request,
    state: state as CapsuleState,
    registered_at_ms: registeredAt,
    deadline_at_ms: deadlineAt,
    output_bytes: outputBytes,
    process_attached: record.process_attached,
    ...(hasReason ? { last_cancellation_reason: reason as CancellationReason } : {}),
  });
}

export function admitCapsuleRegistryDocument(candidate: unknown): CapsuleRegistryDocument {
  const registry = exactObject(candidate, REGISTRY_KEYS);
  if (
    registry.schema_id !== 'urn:dosai:schema:capsule-registry:1' ||
    registry.schema_version !== 1 ||
    !Array.isArray(registry.records) ||
    registry.records.length > 1024 ||
    Object.keys(registry.records).length !== registry.records.length
  ) {
    throw new TypeError('DOSAI_CAPSULE_REGISTRY_SCHEMA_0001');
  }
  const records = registry.records.map(admitRecord).sort((left, right) =>
    left.request.capsule_id.localeCompare(right.request.capsule_id));
  if (new Set(records.map(({ request }) => request.capsule_id)).size !== records.length) {
    throw new TypeError('DOSAI_CAPSULE_REGISTRY_SCHEMA_0001');
  }
  return Object.freeze({
    schema_id: 'urn:dosai:schema:capsule-registry:1',
    schema_version: 1,
    supervisor_generation: sequence(registry.supervisor_generation),
    revision: sequence(registry.revision),
    updated_at_ms: safeInteger(registry.updated_at_ms),
    records: Object.freeze(records),
  });
}

export function reconcileCapsuleRegistryDocument(
  candidate: unknown,
  nextSupervisorGeneration: string,
  now: number,
): ReconciledCapsuleRegistry {
  const current = admitCapsuleRegistryDocument(candidate);
  const nextGeneration = sequence(nextSupervisorGeneration);
  if (BigInt(nextGeneration) <= BigInt(current.supervisor_generation)) {
    throw new TypeError('DOSAI_CAPSULE_REGISTRY_GENERATION_0001');
  }
  const quarantined: string[] = [];
  const records = current.records.map((record): PersistedCapsuleRecord => {
    if (!['REGISTERED', 'STARTING', 'RUNNING', 'STOPPING'].includes(record.state)) {
      return Object.freeze({ ...record, process_attached: false });
    }
    quarantined.push(record.request.capsule_id);
    return Object.freeze({
      ...record,
      state: 'QUARANTINED',
      process_attached: false,
      last_cancellation_reason: 'SUPERVISOR_CRASH',
    });
  });
  const document = admitCapsuleRegistryDocument({
    schema_id: 'urn:dosai:schema:capsule-registry:1',
    schema_version: 1,
    supervisor_generation: nextGeneration,
    revision: (BigInt(current.revision) + 1n).toString(),
    updated_at_ms: safeInteger(now),
    records,
  });
  return Object.freeze({
    document,
    quarantined_capsule_ids: Object.freeze(quarantined.sort()),
  });
}

export function serializeCapsuleRegistryDocument(candidate: unknown): Uint8Array {
  const registry = admitCapsuleRegistryDocument(candidate);
  const source = `${JSON.stringify(registry)}\n`;
  const bytes = new Uint8Array(source.length);
  for (let index = 0; index < source.length; index += 1) {
    const code = source.charCodeAt(index);
    if (code > 0x7f) {
      throw new TypeError('DOSAI_CAPSULE_REGISTRY_ENCODING_0001');
    }
    bytes[index] = code;
  }
  return bytes;
}
