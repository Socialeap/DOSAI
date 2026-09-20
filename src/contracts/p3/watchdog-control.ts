export const WATCHDOG_OPERATIONS = Object.freeze(['INSPECT', 'STOP_ONE', 'STOP_ALL'] as const);
export const WATCHDOG_CAPSULE_STATES = Object.freeze([
  'REGISTERED',
  'STARTING',
  'RUNNING',
  'STOPPING',
  'STOPPED',
  'FAILED',
  'QUARANTINED',
] as const);

export type WatchdogOperation = (typeof WATCHDOG_OPERATIONS)[number];
export type WatchdogCapsuleState = (typeof WATCHDOG_CAPSULE_STATES)[number];

export type WatchdogControlSession = Readonly<{
  readonly schema_id: 'urn:dosai:schema:watchdog-control-session:1';
  readonly schema_version: 1;
  readonly service_boot_id: string;
  readonly service_generation: string;
  readonly session_id: string;
  readonly coordinator_instance_id: string;
  readonly protocol: 'DOSAI_WATCHDOG_XPC_V1';
  readonly peer_assurance: 'XPC_MUTUAL_CODE_REQUIREMENT';
  readonly mode: 'INERT_TEST_FIXTURE';
  readonly sequence_start: '1';
  readonly limits: Readonly<{
    readonly max_frame_bytes: 4096;
    readonly max_cached_responses: 64;
    readonly max_inspect_pending: 8;
    readonly max_stop_one_pending: 16;
    readonly reserved_stop_all_slots: 1;
    readonly response_timeout_ms: 1000;
  }>;
  readonly disconnect_behavior: 'STOP_ALL';
  readonly authorization: 'NO_EFFECT_TEST_ONLY';
}>;

type WatchdogRequestBase = Readonly<{
  readonly schema_id: 'urn:dosai:schema:watchdog-control-request:1';
  readonly schema_version: 1;
  readonly request_id: string;
  readonly session_id: string;
  readonly service_boot_id: string;
  readonly service_generation: string;
  readonly sequence: string;
  readonly supervisor_generation: string;
  readonly authorization: 'NO_EFFECT_TEST_ONLY';
}>;

export type WatchdogControlRequest =
  | (WatchdogRequestBase & Readonly<{ readonly operation: 'INSPECT' }>)
  | (WatchdogRequestBase & Readonly<{
    readonly operation: 'STOP_ONE';
    readonly capsule_id: string;
    readonly reason: 'OWNER_REQUEST' | 'WATCHDOG_TIMEOUT' | 'EMERGENCY_STOP';
  }>)
  | (WatchdogRequestBase & Readonly<{
    readonly operation: 'STOP_ALL';
    readonly reason: 'OWNER_REQUEST' | 'COORDINATOR_DISCONNECT' | 'EMERGENCY_STOP';
  }>);

export type WatchdogControlResponse = Readonly<{
  readonly schema_id: 'urn:dosai:schema:watchdog-control-response:1';
  readonly schema_version: 1;
  readonly response_id: string;
  readonly request_id: string;
  readonly session_id: string;
  readonly service_boot_id: string;
  readonly service_generation: string;
  readonly sequence: string;
  readonly operation: WatchdogOperation;
  readonly result:
    | Readonly<{
      readonly kind: 'INSPECTION';
      readonly capsules: readonly Readonly<{
        readonly capsule_id: string;
        readonly supervisor_generation: string;
        readonly state: WatchdogCapsuleState;
      }>[];
    }>
    | Readonly<{
      readonly kind: 'STOP_RESULT';
      readonly scope: 'ONE' | 'ALL';
      readonly disposition: 'STOPPED' | 'QUARANTINED' | 'NOT_FOUND';
      readonly capsule_ids: readonly string[];
    }>
    | Readonly<{
      readonly kind: 'REJECTED';
      readonly code:
        | 'DOSAI_WATCHDOG_SCHEMA_0001'
        | 'DOSAI_WATCHDOG_IDENTITY_0001'
        | 'DOSAI_WATCHDOG_REPLAY_0001'
        | 'DOSAI_WATCHDOG_SEQUENCE_0001'
        | 'DOSAI_WATCHDOG_QUEUE_0001'
        | 'DOSAI_WATCHDOG_UNAVAILABLE_0001';
      readonly safe_message: string;
      readonly retry_disposition: 'NEVER' | 'NEW_SESSION' | 'RECONCILE' | 'OWNER_ACTION';
    }>
    | Readonly<{ readonly kind: 'REPLAYED'; readonly original_response_id: string }>;
}>;

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const POSITIVE_DECIMAL = /^[1-9][0-9]*$/;
const ASCII = /^[ -~]+$/;
const stringifyJson = JSON.stringify;
const SESSION_KEYS = Object.freeze([
  'schema_id', 'schema_version', 'service_boot_id', 'service_generation', 'session_id',
  'coordinator_instance_id', 'protocol', 'peer_assurance', 'mode', 'sequence_start',
  'limits', 'disconnect_behavior', 'authorization',
] as const);
const LIMIT_KEYS = Object.freeze([
  'max_frame_bytes', 'max_cached_responses', 'max_inspect_pending',
  'max_stop_one_pending', 'reserved_stop_all_slots', 'response_timeout_ms',
] as const);
const REQUEST_BASE_KEYS = Object.freeze([
  'schema_id', 'schema_version', 'request_id', 'session_id', 'service_boot_id',
  'service_generation', 'sequence', 'operation', 'supervisor_generation', 'authorization',
] as const);
const RESPONSE_KEYS = Object.freeze([
  'schema_id', 'schema_version', 'response_id', 'request_id', 'session_id',
  'service_boot_id', 'service_generation', 'sequence', 'operation', 'result',
] as const);

function exactObject(
  candidate: unknown,
  keys: readonly string[],
  errorCode: string,
): Record<string, unknown> {
  if (candidate === null || typeof candidate !== 'object' || Array.isArray(candidate)) {
    throw new TypeError(errorCode);
  }
  const prototype = Object.getPrototypeOf(candidate);
  if (prototype !== Object.prototype && prototype !== null) throw new TypeError(errorCode);
  const ownKeys = Reflect.ownKeys(candidate);
  if (
    ownKeys.some((key) => typeof key === 'symbol')
    || ownKeys.map(String).sort().join('\0') !== [...keys].sort().join('\0')
  ) {
    throw new TypeError(errorCode);
  }
  const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(candidate, key);
    if (descriptor === undefined || !descriptor.enumerable || !('value' in descriptor)) {
      throw new TypeError(errorCode);
    }
    result[key] = descriptor.value;
  }
  return result;
}

function exactArray(candidate: unknown, maximum: number, errorCode: string): readonly unknown[] {
  if (!Array.isArray(candidate) || Object.getPrototypeOf(candidate) !== Array.prototype) {
    throw new TypeError(errorCode);
  }
  if (candidate.length > maximum) throw new TypeError(errorCode);
  const expectedKeys = [...Array.from({ length: candidate.length }, (_, index) => String(index)), 'length'];
  const ownKeys = Reflect.ownKeys(candidate);
  if (
    ownKeys.some((key) => typeof key === 'symbol')
    || ownKeys.map(String).sort().join('\0') !== expectedKeys.sort().join('\0')
  ) {
    throw new TypeError(errorCode);
  }
  const admitted: unknown[] = [];
  for (let index = 0; index < candidate.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(candidate, String(index));
    if (descriptor === undefined || !descriptor.enumerable || !('value' in descriptor)) {
      throw new TypeError(errorCode);
    }
    admitted.push(descriptor.value);
  }
  return admitted;
}

function uuid(value: unknown, errorCode: string): string {
  if (typeof value !== 'string' || !UUID_V4.test(value)) throw new TypeError(errorCode);
  return value;
}

function decimal(value: unknown, errorCode: string): string {
  if (typeof value !== 'string' || value.length > 32 || !POSITIVE_DECIMAL.test(value)) {
    throw new TypeError(errorCode);
  }
  return value;
}

function freeze<T extends object>(value: T): Readonly<T> {
  return Object.freeze(value);
}

export function admitWatchdogControlSession(candidate: unknown): WatchdogControlSession {
  const errorCode = 'DOSAI_WATCHDOG_SESSION_SCHEMA_0001';
  const session = exactObject(candidate, SESSION_KEYS, errorCode);
  const limits = exactObject(session.limits, LIMIT_KEYS, errorCode);
  if (
    session.schema_id !== 'urn:dosai:schema:watchdog-control-session:1'
    || session.schema_version !== 1
    || session.protocol !== 'DOSAI_WATCHDOG_XPC_V1'
    || session.peer_assurance !== 'XPC_MUTUAL_CODE_REQUIREMENT'
    || session.mode !== 'INERT_TEST_FIXTURE'
    || session.sequence_start !== '1'
    || session.disconnect_behavior !== 'STOP_ALL'
    || session.authorization !== 'NO_EFFECT_TEST_ONLY'
    || limits.max_frame_bytes !== 4096
    || limits.max_cached_responses !== 64
    || limits.max_inspect_pending !== 8
    || limits.max_stop_one_pending !== 16
    || limits.reserved_stop_all_slots !== 1
    || limits.response_timeout_ms !== 1000
  ) {
    throw new TypeError(errorCode);
  }
  return freeze({
    schema_id: 'urn:dosai:schema:watchdog-control-session:1',
    schema_version: 1,
    service_boot_id: uuid(session.service_boot_id, errorCode),
    service_generation: decimal(session.service_generation, errorCode),
    session_id: uuid(session.session_id, errorCode),
    coordinator_instance_id: uuid(session.coordinator_instance_id, errorCode),
    protocol: 'DOSAI_WATCHDOG_XPC_V1',
    peer_assurance: 'XPC_MUTUAL_CODE_REQUIREMENT',
    mode: 'INERT_TEST_FIXTURE',
    sequence_start: '1',
    limits: freeze({
      max_frame_bytes: 4096,
      max_cached_responses: 64,
      max_inspect_pending: 8,
      max_stop_one_pending: 16,
      reserved_stop_all_slots: 1,
      response_timeout_ms: 1000,
    }),
    disconnect_behavior: 'STOP_ALL',
    authorization: 'NO_EFFECT_TEST_ONLY',
  });
}

export function admitWatchdogControlRequest(candidate: unknown): WatchdogControlRequest {
  const errorCode = 'DOSAI_WATCHDOG_SCHEMA_0001';
  if (candidate === null || typeof candidate !== 'object' || Array.isArray(candidate)) {
    throw new TypeError(errorCode);
  }
  const operationDescriptor = Object.getOwnPropertyDescriptor(candidate, 'operation');
  if (operationDescriptor === undefined || !('value' in operationDescriptor)) throw new TypeError(errorCode);
  const operation = operationDescriptor.value;
  const keys = operation === 'STOP_ONE'
    ? [...REQUEST_BASE_KEYS, 'capsule_id', 'reason']
    : operation === 'STOP_ALL'
      ? [...REQUEST_BASE_KEYS, 'reason']
      : REQUEST_BASE_KEYS;
  const request = exactObject(candidate, keys, errorCode);
  if (
    request.schema_id !== 'urn:dosai:schema:watchdog-control-request:1'
    || request.schema_version !== 1
    || request.authorization !== 'NO_EFFECT_TEST_ONLY'
    || !WATCHDOG_OPERATIONS.includes(request.operation as WatchdogOperation)
  ) {
    throw new TypeError(errorCode);
  }
  const base = {
    schema_id: 'urn:dosai:schema:watchdog-control-request:1' as const,
    schema_version: 1 as const,
    request_id: uuid(request.request_id, errorCode),
    session_id: uuid(request.session_id, errorCode),
    service_boot_id: uuid(request.service_boot_id, errorCode),
    service_generation: decimal(request.service_generation, errorCode),
    sequence: decimal(request.sequence, errorCode),
    supervisor_generation: decimal(request.supervisor_generation, errorCode),
    authorization: 'NO_EFFECT_TEST_ONLY' as const,
  };
  if (request.operation === 'INSPECT') return freeze({ ...base, operation: 'INSPECT' });
  if (request.operation === 'STOP_ONE') {
    if (!['OWNER_REQUEST', 'WATCHDOG_TIMEOUT', 'EMERGENCY_STOP'].includes(request.reason as string)) {
      throw new TypeError(errorCode);
    }
    return freeze({
      ...base,
      operation: 'STOP_ONE',
      capsule_id: uuid(request.capsule_id, errorCode),
      reason: request.reason as 'OWNER_REQUEST' | 'WATCHDOG_TIMEOUT' | 'EMERGENCY_STOP',
    });
  }
  if (!['OWNER_REQUEST', 'COORDINATOR_DISCONNECT', 'EMERGENCY_STOP'].includes(request.reason as string)) {
    throw new TypeError(errorCode);
  }
  return freeze({
    ...base,
    operation: 'STOP_ALL',
    reason: request.reason as 'OWNER_REQUEST' | 'COORDINATOR_DISCONNECT' | 'EMERGENCY_STOP',
  });
}

export function admitWatchdogControlResponse(candidate: unknown): WatchdogControlResponse {
  const errorCode = 'DOSAI_WATCHDOG_RESPONSE_SCHEMA_0001';
  const response = exactObject(candidate, RESPONSE_KEYS, errorCode);
  if (
    response.schema_id !== 'urn:dosai:schema:watchdog-control-response:1'
    || response.schema_version !== 1
    || !WATCHDOG_OPERATIONS.includes(response.operation as WatchdogOperation)
  ) {
    throw new TypeError(errorCode);
  }
  const operation = response.operation as WatchdogOperation;
  if (response.result === null || typeof response.result !== 'object' || Array.isArray(response.result)) {
    throw new TypeError(errorCode);
  }
  const kindDescriptor = Object.getOwnPropertyDescriptor(response.result, 'kind');
  if (kindDescriptor === undefined || !('value' in kindDescriptor)) throw new TypeError(errorCode);
  const kind = kindDescriptor.value;
  let result: WatchdogControlResponse['result'];
  if (kind === 'INSPECTION') {
    if (operation !== 'INSPECT') throw new TypeError(errorCode);
    const input = exactObject(response.result, ['kind', 'capsules'], errorCode);
    const capsules = exactArray(input.capsules, 64, errorCode).map((candidateCapsule) => {
      const capsule = exactObject(candidateCapsule, ['capsule_id', 'supervisor_generation', 'state'], errorCode);
      if (!WATCHDOG_CAPSULE_STATES.includes(capsule.state as WatchdogCapsuleState)) {
        throw new TypeError(errorCode);
      }
      return freeze({
        capsule_id: uuid(capsule.capsule_id, errorCode),
        supervisor_generation: decimal(capsule.supervisor_generation, errorCode),
        state: capsule.state as WatchdogCapsuleState,
      });
    });
    result = freeze({ kind: 'INSPECTION', capsules: freeze(capsules) });
  } else if (kind === 'STOP_RESULT') {
    const input = exactObject(response.result, ['kind', 'scope', 'disposition', 'capsule_ids'], errorCode);
    if (operation === 'INSPECT') throw new TypeError(errorCode);
    const expectedScope: 'ONE' | 'ALL' = operation === 'STOP_ONE' ? 'ONE' : 'ALL';
    if (
      input.scope !== expectedScope
      || !['STOPPED', 'QUARANTINED', 'NOT_FOUND'].includes(input.disposition as string)
    ) {
      throw new TypeError(errorCode);
    }
    const capsuleIds = exactArray(input.capsule_ids, 64, errorCode).map((value) => uuid(value, errorCode));
    if (new Set(capsuleIds).size !== capsuleIds.length) throw new TypeError(errorCode);
    result = freeze({
      kind: 'STOP_RESULT',
      scope: expectedScope,
      disposition: input.disposition as 'STOPPED' | 'QUARANTINED' | 'NOT_FOUND',
      capsule_ids: freeze(capsuleIds),
    });
  } else if (kind === 'REJECTED') {
    const input = exactObject(
      response.result,
      ['kind', 'code', 'safe_message', 'retry_disposition'],
      errorCode,
    );
    const codes = [
      'DOSAI_WATCHDOG_SCHEMA_0001', 'DOSAI_WATCHDOG_IDENTITY_0001',
      'DOSAI_WATCHDOG_REPLAY_0001', 'DOSAI_WATCHDOG_SEQUENCE_0001',
      'DOSAI_WATCHDOG_QUEUE_0001', 'DOSAI_WATCHDOG_UNAVAILABLE_0001',
    ] as const;
    const retry = ['NEVER', 'NEW_SESSION', 'RECONCILE', 'OWNER_ACTION'] as const;
    if (
      !codes.includes(input.code as (typeof codes)[number])
      || typeof input.safe_message !== 'string'
      || input.safe_message.length < 1
      || input.safe_message.length > 160
      || !ASCII.test(input.safe_message)
      || !retry.includes(input.retry_disposition as (typeof retry)[number])
    ) {
      throw new TypeError(errorCode);
    }
    result = freeze({
      kind: 'REJECTED',
      code: input.code as (typeof codes)[number],
      safe_message: input.safe_message,
      retry_disposition: input.retry_disposition as (typeof retry)[number],
    });
  } else if (kind === 'REPLAYED') {
    const input = exactObject(response.result, ['kind', 'original_response_id'], errorCode);
    result = freeze({
      kind: 'REPLAYED',
      original_response_id: uuid(input.original_response_id, errorCode),
    });
  } else {
    throw new TypeError(errorCode);
  }
  return freeze({
    schema_id: 'urn:dosai:schema:watchdog-control-response:1',
    schema_version: 1,
    response_id: uuid(response.response_id, errorCode),
    request_id: uuid(response.request_id, errorCode),
    session_id: uuid(response.session_id, errorCode),
    service_boot_id: uuid(response.service_boot_id, errorCode),
    service_generation: decimal(response.service_generation, errorCode),
    sequence: decimal(response.sequence, errorCode),
    operation,
    result,
  });
}

export function watchdogFrameBytes(value: WatchdogControlRequest | WatchdogControlResponse): number {
  const encoded = stringifyJson(value);
  if (!ASCII.test(encoded)) throw new TypeError('DOSAI_WATCHDOG_FRAME_0001');
  return encoded.length;
}
