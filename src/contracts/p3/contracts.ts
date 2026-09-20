export const CAPSULE_STATES = Object.freeze([
  'REGISTERED',
  'STARTING',
  'RUNNING',
  'STOPPING',
  'STOPPED',
  'FAILED',
  'QUARANTINED',
] as const);

export type CapsuleState = (typeof CAPSULE_STATES)[number];

export const CANCELLATION_REASONS = Object.freeze([
  'OWNER_REQUEST',
  'WATCHDOG_TIMEOUT',
  'SUPERVISOR_CRASH',
  'EMERGENCY_STOP',
  'OUTPUT_LIMIT',
] as const);

export type CancellationReason = (typeof CANCELLATION_REASONS)[number];

export const SAFE_TEST_EXECUTABLES = Object.freeze([
  '/usr/bin/printf',
  '/usr/bin/sleep',
] as const);

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const DECIMAL_SEQUENCE = /^(0|[1-9][0-9]*)$/;
const ASCII_ENVIRONMENT_NAME = /^[A-Z][A-Z0-9_]{0,31}$/;
const SAFE_ARGUMENT = /^[\x20-\x7e]{0,128}$/;
const REQUEST_KEYS = Object.freeze([
  'schema_id',
  'schema_version',
  'capsule_id',
  'operation_id',
  'generation',
  'operation_kind',
  'executable',
  'arguments',
  'environment',
  'limits',
  'authorization',
] as const);
const LIMIT_KEYS = Object.freeze(['wall_time_ms', 'max_output_bytes'] as const);

export type CapsuleRequest = Readonly<{
  readonly schema_id: 'urn:dosai:schema:capsule-request:1';
  readonly schema_version: 1;
  readonly capsule_id: string;
  readonly operation_id: string;
  readonly generation: string;
  readonly operation_kind: 'SAFE_TEST';
  readonly executable: (typeof SAFE_TEST_EXECUTABLES)[number];
  readonly arguments: readonly string[];
  readonly environment: Readonly<Record<string, string>>;
  readonly limits: Readonly<{
    readonly wall_time_ms: number;
    readonly max_output_bytes: number;
  }>;
  readonly authorization: 'NO_EFFECT_TEST_ONLY';
}>;

export const FIXED_SAFE_TEST_PROFILES = Object.freeze({
  PRINT_SENTINEL: Object.freeze({
    executable: '/usr/bin/printf' as const,
    arguments: Object.freeze(['DOSAI_SAFE_TEST_OK'] as const),
    environment: Object.freeze({}),
    limits: Object.freeze({ wall_time_ms: 1_000, max_output_bytes: 18 }),
  }),
  DELAY_10_MS: Object.freeze({
    executable: '/usr/bin/sleep' as const,
    arguments: Object.freeze(['0.01'] as const),
    environment: Object.freeze({}),
    limits: Object.freeze({ wall_time_ms: 1_000, max_output_bytes: 0 }),
  }),
} as const);

function exactObject(candidate: unknown, keys: readonly string[]): Record<string, unknown> {
  if (candidate === null || typeof candidate !== 'object' || Array.isArray(candidate)) {
    throw new TypeError('DOSAI_CAPSULE_SCHEMA_0001');
  }
  const prototype = Object.getPrototypeOf(candidate);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError('DOSAI_CAPSULE_SCHEMA_0001');
  }
  if (
    Object.getOwnPropertySymbols(candidate).length !== 0 ||
    Object.keys(candidate).sort().join('\0') !== [...keys].sort().join('\0')
  ) {
    throw new TypeError('DOSAI_CAPSULE_SCHEMA_0001');
  }
  const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(candidate, key);
    if (descriptor === undefined || !descriptor.enumerable || !('value' in descriptor)) {
      throw new TypeError('DOSAI_CAPSULE_SCHEMA_0001');
    }
    result[key] = descriptor.value;
  }
  return result;
}

function stringValue(value: unknown): string {
  if (typeof value !== 'string') {
    throw new TypeError('DOSAI_CAPSULE_SCHEMA_0001');
  }
  return value;
}

function environmentValue(value: unknown): Readonly<Record<string, string>> {
  const source = exactObject(
    value,
    value !== null && typeof value === 'object' && !Array.isArray(value)
      ? Object.keys(value)
      : [],
  );
  const environment: Record<string, string> = Object.create(null) as Record<string, string>;
  for (const [name, rawValue] of Object.entries(source)) {
    if (
      !ASCII_ENVIRONMENT_NAME.test(name) ||
      name === 'PATH' ||
      name === 'HOME' ||
      name === 'SHELL' ||
      name === 'NODE_OPTIONS' ||
      name === 'ELECTRON_RUN_AS_NODE'
    ) {
      throw new TypeError('DOSAI_CAPSULE_ENVIRONMENT_0001');
    }
    const valueText = stringValue(rawValue);
    if (!SAFE_ARGUMENT.test(valueText)) {
      throw new TypeError('DOSAI_CAPSULE_ENVIRONMENT_0001');
    }
    environment[name] = valueText;
  }
  if (Object.keys(environment).length > 8) {
    throw new TypeError('DOSAI_CAPSULE_ENVIRONMENT_0001');
  }
  return Object.freeze(environment);
}

function argumentsValue(value: unknown): readonly string[] {
  if (!Array.isArray(value) || Object.keys(value).length !== value.length || value.length > 8) {
    throw new TypeError('DOSAI_CAPSULE_SCHEMA_0001');
  }
  const arguments_ = value.map((item) => {
    const argument = stringValue(item);
    if (!SAFE_ARGUMENT.test(argument)) {
      throw new TypeError('DOSAI_CAPSULE_SCHEMA_0001');
    }
    return argument;
  });
  return Object.freeze(arguments_);
}

function limitsValue(value: unknown): CapsuleRequest['limits'] {
  const limits = exactObject(value, LIMIT_KEYS);
  const wallTime = limits.wall_time_ms;
  const maxOutput = limits.max_output_bytes;
  if (
    typeof wallTime !== 'number' ||
    !Number.isSafeInteger(wallTime) ||
    wallTime < 1 ||
    wallTime > 60_000 ||
    typeof maxOutput !== 'number' ||
    !Number.isSafeInteger(maxOutput) ||
    maxOutput < 0 ||
    maxOutput > 65_536
  ) {
    throw new TypeError('DOSAI_CAPSULE_LIMITS_0001');
  }
  return Object.freeze({ wall_time_ms: wallTime, max_output_bytes: maxOutput });
}

export function admitCapsuleRequest(candidate: unknown): CapsuleRequest {
  const request = exactObject(candidate, REQUEST_KEYS);
  const schemaId = stringValue(request.schema_id);
  const capsuleId = stringValue(request.capsule_id);
  const operationId = stringValue(request.operation_id);
  const generation = stringValue(request.generation);
  const executable = stringValue(request.executable);
  if (
    schemaId !== 'urn:dosai:schema:capsule-request:1' ||
    request.schema_version !== 1 ||
    !UUID_V4.test(capsuleId) ||
    !UUID_V4.test(operationId) ||
    !DECIMAL_SEQUENCE.test(generation) ||
    !SAFE_TEST_EXECUTABLES.includes(executable as (typeof SAFE_TEST_EXECUTABLES)[number]) ||
    request.operation_kind !== 'SAFE_TEST' ||
    request.authorization !== 'NO_EFFECT_TEST_ONLY'
  ) {
    throw new TypeError('DOSAI_CAPSULE_SCHEMA_0001');
  }
  return Object.freeze({
    schema_id: 'urn:dosai:schema:capsule-request:1',
    schema_version: 1,
    capsule_id: capsuleId,
    operation_id: operationId,
    generation,
    operation_kind: 'SAFE_TEST',
    executable: executable as CapsuleRequest['executable'],
    arguments: argumentsValue(request.arguments),
    environment: environmentValue(request.environment),
    limits: limitsValue(request.limits),
    authorization: 'NO_EFFECT_TEST_ONLY',
  });
}

export function admitFixedSafeTestCapsuleRequest(candidate: unknown): CapsuleRequest {
  const request = admitCapsuleRequest(candidate);
  const profile = request.executable === FIXED_SAFE_TEST_PROFILES.PRINT_SENTINEL.executable
    ? FIXED_SAFE_TEST_PROFILES.PRINT_SENTINEL
    : FIXED_SAFE_TEST_PROFILES.DELAY_10_MS;
  if (
    request.arguments.length !== profile.arguments.length ||
    request.arguments.some((argument, index) => argument !== profile.arguments[index]) ||
    Object.keys(request.environment).length !== 0 ||
    request.limits.wall_time_ms !== profile.limits.wall_time_ms ||
    request.limits.max_output_bytes !== profile.limits.max_output_bytes
  ) {
    throw new TypeError('DOSAI_CAPSULE_PROFILE_0001');
  }
  return request;
}
