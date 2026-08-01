export const P2_SCHEMA_IDS = Object.freeze([
  'urn:dosai:schema:resource-precondition:1',
  'urn:dosai:schema:operation:1',
  'urn:dosai:schema:action-plan:1',
  'urn:dosai:schema:policy-decision:1',
  'urn:dosai:schema:execution-grant:1',
  'urn:dosai:schema:operation-lifecycle:1',
] as const);

export const P2_AUTHORIZATION_SCHEMA_IDS = Object.freeze([
  'urn:dosai:schema:local-owner-approval:1',
] as const);

export type P2SchemaId =
  | (typeof P2_SCHEMA_IDS)[number]
  | (typeof P2_AUTHORIZATION_SCHEMA_IDS)[number];
export type JsonPrimitive = boolean | number | string | null;
export type JsonValue = JsonPrimitive | readonly JsonValue[] | { readonly [key: string]: JsonValue };

declare const contractBrand: unique symbol;

export type ImmutableContract<S extends P2SchemaId> = Readonly<{
  schema_id: S;
  [key: string]: JsonValue;
  [contractBrand]: true;
}>;

export type ContractValidator = (schemaId: P2SchemaId, value: JsonValue) => boolean;

const maximumDepth = 32;
const maximumNodes = 10_000;

function isJsonObject(value: JsonValue): value is { readonly [key: string]: JsonValue } {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function clonePlainJson(value: unknown, depth: number, budget: { remaining: number }): JsonValue {
  budget.remaining -= 1;
  if (budget.remaining < 0 || depth > maximumDepth) {
    throw new TypeError('DOSAI_SCHEMA_0001');
  }
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || Object.is(value, -0)) {
      throw new TypeError('DOSAI_SCHEMA_0001');
    }
    return value;
  }
  if (Array.isArray(value)) {
    const keys = Object.keys(value);
    if (keys.length !== value.length || keys.some((key, index) => key !== String(index))) {
      throw new TypeError('DOSAI_SCHEMA_0001');
    }
    return value.map((item) => clonePlainJson(item, depth + 1, budget));
  }
  if (typeof value !== 'object') {
    throw new TypeError('DOSAI_SCHEMA_0001');
  }

  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError('DOSAI_SCHEMA_0001');
  }
  if (Object.getOwnPropertySymbols(value).length !== 0) {
    throw new TypeError('DOSAI_SCHEMA_0001');
  }

  const clone: Record<string, JsonValue> = Object.create(null);
  for (const key of Object.keys(value).sort()) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !descriptor.enumerable || !('value' in descriptor)) {
      throw new TypeError('DOSAI_SCHEMA_0001');
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

function requireStringField(value: { readonly [key: string]: JsonValue }, key: string): string {
  const field = value[key];
  if (typeof field !== 'string') {
    throw new TypeError('DOSAI_SCHEMA_0001');
  }
  return field;
}

function assertSemanticContract(
  schemaId: P2SchemaId,
  value: { readonly [key: string]: JsonValue },
): void {
  if (schemaId === 'urn:dosai:schema:action-plan:1') {
    assertBoundedWindow(
      requireStringField(value, 'created_at'),
      requireStringField(value, 'expires_at'),
    );
  }
  if (schemaId === 'urn:dosai:schema:execution-grant:1') {
    const createdAt = requireStringField(value, 'created_at');
    const issuedAt = requireStringField(value, 'issued_at');
    if (createdAt !== issuedAt) {
      throw new TypeError('DOSAI_PRECONDITION_0001');
    }
    assertBoundedWindow(issuedAt, requireStringField(value, 'expires_at'));
  }
  if (schemaId === 'urn:dosai:schema:local-owner-approval:1') {
    const createdAt = requireStringField(value, 'created_at');
    const approvedAt = requireStringField(value, 'approved_at');
    if (createdAt !== approvedAt) {
      throw new TypeError('DOSAI_PRECONDITION_0001');
    }
    assertBoundedWindow(approvedAt, requireStringField(value, 'expires_at'), 60_000);
  }
}

export function admitContract<S extends P2SchemaId>(
  schemaId: S,
  candidate: unknown,
  validate: ContractValidator,
): ImmutableContract<S> {
  if (
    !(P2_SCHEMA_IDS as readonly string[]).includes(schemaId) &&
    !(P2_AUTHORIZATION_SCHEMA_IDS as readonly string[]).includes(schemaId)
  ) {
    throw new TypeError('DOSAI_SCHEMA_0001');
  }
  const clone = clonePlainJson(candidate, 0, { remaining: maximumNodes });
  if (
    !isJsonObject(clone) ||
    clone.schema_id !== schemaId ||
    !validate(schemaId, clone)
  ) {
    throw new TypeError('DOSAI_SCHEMA_0001');
  }
  assertSemanticContract(schemaId, clone);
  return freezeJson(clone) as ImmutableContract<S>;
}

function normalizeCanonical(value: JsonValue): JsonValue {
  if (Array.isArray(value)) {
    return value.map(normalizeCanonical);
  }
  if (isJsonObject(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, normalizeCanonical(value[key] as JsonValue)]),
    );
  }
  return value;
}

export function canonicalContractJson<S extends P2SchemaId>(contract: ImmutableContract<S>): string {
  return JSON.stringify(normalizeCanonical(contract));
}

export const OPERATION_STATES = Object.freeze([
  'REQUESTED',
  'PLANNED',
  'REJECTED',
  'AWAITING_APPROVAL',
  'AUTHORIZED',
  'DENIED',
  'GRANT_ISSUED',
  'EXECUTING',
  'SUCCEEDED',
  'FAILED',
  'CANCELLED',
  'EXPIRED',
  'UNKNOWN',
] as const);

export type OperationState = (typeof OPERATION_STATES)[number];

const allowedTransitions = Object.freeze({
  REQUESTED: Object.freeze(['PLANNED', 'REJECTED', 'CANCELLED']),
  PLANNED: Object.freeze(['AWAITING_APPROVAL', 'AUTHORIZED', 'DENIED', 'CANCELLED', 'EXPIRED']),
  REJECTED: Object.freeze([]),
  AWAITING_APPROVAL: Object.freeze(['AUTHORIZED', 'DENIED', 'CANCELLED', 'EXPIRED']),
  AUTHORIZED: Object.freeze(['GRANT_ISSUED', 'CANCELLED', 'EXPIRED']),
  DENIED: Object.freeze([]),
  GRANT_ISSUED: Object.freeze(['EXECUTING', 'CANCELLED', 'EXPIRED']),
  EXECUTING: Object.freeze(['SUCCEEDED', 'FAILED', 'CANCELLED', 'UNKNOWN']),
  SUCCEEDED: Object.freeze([]),
  FAILED: Object.freeze([]),
  CANCELLED: Object.freeze([]),
  EXPIRED: Object.freeze([]),
  UNKNOWN: Object.freeze([]),
} satisfies Readonly<Record<OperationState, readonly OperationState[]>>);

export function isLifecycleTransitionAllowed(
  previous: OperationState | null,
  current: OperationState,
): boolean {
  return previous === null
    ? current === 'REQUESTED'
    : (allowedTransitions[previous] as readonly OperationState[]).includes(current);
}

export function assertBoundedWindow(
  issuedAt: string,
  expiresAt: string,
  maximumLifetimeMs = 300_000,
): void {
  const exactTimestamp = /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$/;
  const issued = Date.parse(issuedAt);
  const expires = Date.parse(expiresAt);
  if (
    !Number.isInteger(maximumLifetimeMs) ||
    maximumLifetimeMs < 1 ||
    !exactTimestamp.test(issuedAt) ||
    !exactTimestamp.test(expiresAt) ||
    !Number.isFinite(issued) ||
    !Number.isFinite(expires) ||
    new Date(issued).toISOString() !== issuedAt ||
    new Date(expires).toISOString() !== expiresAt ||
    expires <= issued ||
    expires - issued > maximumLifetimeMs
  ) {
    throw new TypeError('DOSAI_PRECONDITION_0001');
  }
}
