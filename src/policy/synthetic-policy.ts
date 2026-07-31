import { admitContract } from '../contracts/p2/contracts.ts';
import type { ContractValidator, JsonValue } from '../contracts/p2/contracts.ts';

export const POLICY_VERSION = 'dosai.policy.v1' as const;
export const POLICY_TIERS = Object.freeze(['GREEN', 'YELLOW', 'RED', 'BLACK'] as const);

export type PolicyTier = (typeof POLICY_TIERS)[number];
export type PolicyOutcome = 'AUTO_ALLOW' | 'DENY' | 'ENVELOPE_ALLOW' | 'OWNER_REVIEW_REQUIRED';
export type ApprovalRequirement = 'NONE' | 'CAPABILITY_ENVELOPE' | 'FRESH_LOCAL' | 'PROHIBITED';

export interface SyntheticPolicyContext {
  readonly policyAvailable: boolean;
  readonly actorId: string;
  readonly actorGeneration: string;
  readonly sessionId: string;
  readonly resourceId: string;
  readonly resourceGeneration: string;
  readonly actorCapabilities: readonly string[];
  readonly ownerCapabilities: readonly string[];
  readonly policyCapabilities: readonly string[];
  readonly capabilityEnvelopeActive: boolean;
  readonly capabilityEnvelopeCapabilities: readonly string[];
}

export interface SyntheticPolicyEvaluation {
  readonly policyVersion: typeof POLICY_VERSION;
  readonly minimumTier: PolicyTier;
  readonly enforcedTier: PolicyTier;
  readonly outcome: PolicyOutcome;
  readonly approvalRequirement: ApprovalRequirement;
  readonly effectiveCapabilities: readonly string[];
  readonly reasonCodes: readonly string[];
}

const capabilityPattern = /^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/;
const decimalSequencePattern = /^(0|[1-9][0-9]*)$/;
const producerPattern = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/;
const uuidV4Pattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const knownCapabilities = new Set(['policy.preflight']);
const tierRank: Readonly<Record<PolicyTier, number>> = Object.freeze({
  GREEN: 0,
  YELLOW: 1,
  RED: 2,
  BLACK: 3,
});
const effectFloor = Object.freeze({
  NONE: 'GREEN',
  READ_LOCAL: 'GREEN',
  MUTATE_LOCAL: 'YELLOW',
  MUTATE_REMOTE: 'RED',
  PROHIBITED: 'BLACK',
} as const satisfies Readonly<Record<string, PolicyTier>>);
const environmentFloor = Object.freeze({
  LOCAL_TEST: 'GREEN',
  LOCAL_DEVELOPMENT: 'YELLOW',
  STAGING: 'RED',
  PRODUCTION: 'BLACK',
} as const satisfies Readonly<Record<string, PolicyTier>>);
const contextKeys = Object.freeze([
  'actorCapabilities',
  'actorGeneration',
  'actorId',
  'capabilityEnvelopeActive',
  'capabilityEnvelopeCapabilities',
  'ownerCapabilities',
  'policyAvailable',
  'policyCapabilities',
  'resourceGeneration',
  'resourceId',
  'sessionId',
] as const);

function policyResult(
  minimumTier: PolicyTier,
  enforcedTier: PolicyTier,
  outcome: PolicyOutcome,
  approvalRequirement: ApprovalRequirement,
  effectiveCapabilities: readonly string[],
  reasonCodes: readonly string[],
): SyntheticPolicyEvaluation {
  return Object.freeze({
    policyVersion: POLICY_VERSION,
    minimumTier,
    enforcedTier,
    outcome,
    approvalRequirement,
    effectiveCapabilities: Object.freeze([...effectiveCapabilities].sort()),
    reasonCodes: Object.freeze([...reasonCodes]),
  });
}

function blackDenial(reasonCode: string, minimumTier: PolicyTier = 'BLACK'): SyntheticPolicyEvaluation {
  return policyResult(minimumTier, 'BLACK', 'DENY', 'PROHIBITED', [], [reasonCode]);
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) &&
    value.length <= 32 &&
    value.every((item) => typeof item === 'string' && capabilityPattern.test(item)) &&
    new Set(value).size === value.length;
}

function validContext(context: SyntheticPolicyContext): boolean {
  return typeof context.policyAvailable === 'boolean' &&
    typeof context.capabilityEnvelopeActive === 'boolean' &&
    producerPattern.test(context.actorId) &&
    decimalSequencePattern.test(context.actorGeneration) &&
    uuidV4Pattern.test(context.sessionId) &&
    uuidV4Pattern.test(context.resourceId) &&
    decimalSequencePattern.test(context.resourceGeneration) &&
    isStringArray(context.actorCapabilities) &&
    isStringArray(context.ownerCapabilities) &&
    isStringArray(context.policyCapabilities) &&
    isStringArray(context.capabilityEnvelopeCapabilities);
}

function dataProperty(candidate: object, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(candidate, key);
  if (descriptor === undefined || !descriptor.enumerable || !('value' in descriptor)) {
    throw new TypeError('DOSAI_POLICY_0001');
  }
  return descriptor.value;
}

function capabilityArrayProperty(candidate: object, key: string): readonly string[] {
  const value = dataProperty(candidate, key);
  if (!Array.isArray(value) || value.length > 32 || Object.keys(value).length !== value.length) {
    throw new TypeError('DOSAI_POLICY_0001');
  }
  const clone: string[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (
      descriptor === undefined ||
      !descriptor.enumerable ||
      !('value' in descriptor) ||
      typeof descriptor.value !== 'string'
    ) {
      throw new TypeError('DOSAI_POLICY_0001');
    }
    clone.push(descriptor.value);
  }
  if (!isStringArray(clone)) {
    throw new TypeError('DOSAI_POLICY_0001');
  }
  return Object.freeze(clone);
}

export function admitSyntheticPolicyContext(candidate: unknown): SyntheticPolicyContext {
  if (candidate === null || typeof candidate !== 'object' || Array.isArray(candidate)) {
    throw new TypeError('DOSAI_POLICY_0001');
  }
  const prototype = Object.getPrototypeOf(candidate);
  if (
    (prototype !== Object.prototype && prototype !== null) ||
    Object.getOwnPropertySymbols(candidate).length !== 0 ||
    Object.keys(candidate).sort().join('\0') !== [...contextKeys].sort().join('\0')
  ) {
    throw new TypeError('DOSAI_POLICY_0001');
  }

  const context: SyntheticPolicyContext = {
    policyAvailable: dataProperty(candidate, 'policyAvailable') as boolean,
    actorId: dataProperty(candidate, 'actorId') as string,
    actorGeneration: dataProperty(candidate, 'actorGeneration') as string,
    sessionId: dataProperty(candidate, 'sessionId') as string,
    resourceId: dataProperty(candidate, 'resourceId') as string,
    resourceGeneration: dataProperty(candidate, 'resourceGeneration') as string,
    actorCapabilities: capabilityArrayProperty(candidate, 'actorCapabilities'),
    ownerCapabilities: capabilityArrayProperty(candidate, 'ownerCapabilities'),
    policyCapabilities: capabilityArrayProperty(candidate, 'policyCapabilities'),
    capabilityEnvelopeActive: dataProperty(candidate, 'capabilityEnvelopeActive') as boolean,
    capabilityEnvelopeCapabilities: capabilityArrayProperty(
      candidate,
      'capabilityEnvelopeCapabilities',
    ),
  };
  if (!validContext(context)) {
    throw new TypeError('DOSAI_POLICY_0001');
  }
  return Object.freeze(context);
}

function isJsonObject(value: unknown): value is { readonly [key: string]: JsonValue } {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function objectField(value: JsonValue, key: string): { readonly [key: string]: JsonValue } | null {
  if (!isJsonObject(value)) {
    return null;
  }
  const field = value[key];
  return isJsonObject(field) ? field : null;
}

function stringField(value: { readonly [key: string]: JsonValue }, key: string): string | null {
  const field = value[key];
  return typeof field === 'string' ? field : null;
}

function higherTier(left: PolicyTier, right: PolicyTier): PolicyTier {
  return tierRank[left] >= tierRank[right] ? left : right;
}

function intersectCapabilities(
  requested: readonly string[],
  context: SyntheticPolicyContext,
): readonly string[] {
  const actor = new Set(context.actorCapabilities);
  const owner = new Set(context.ownerCapabilities);
  const policy = new Set(context.policyCapabilities);
  return requested.filter((capability) =>
    actor.has(capability) && owner.has(capability) && policy.has(capability),
  );
}

export function evaluateSyntheticPolicy(
  candidate: unknown,
  contextCandidate: unknown,
  validate: ContractValidator,
): SyntheticPolicyEvaluation {
  let context;
  try {
    context = admitSyntheticPolicyContext(contextCandidate);
  } catch {
    return blackDenial('POLICY_CONTEXT_REJECTED');
  }
  let operation;
  try {
    operation = admitContract('urn:dosai:schema:operation:1', candidate, validate);
  } catch {
    return blackDenial('OPERATION_CONTRACT_REJECTED');
  }
  if (
    operation.schema_id !== 'urn:dosai:schema:operation:1' ||
    operation.operation_kind !== 'SYNTHETIC_POLICY_PROBE' ||
    operation.data_class !== 'D5'
  ) {
    return blackDenial('OPERATION_CONTRACT_REJECTED');
  }
  if (!context.policyAvailable) {
    return blackDenial('POLICY_UNAVAILABLE');
  }

  const actor = objectField(operation, 'actor');
  const target = objectField(operation, 'target');
  const requested = operation.requested_capabilities;
  const effectProfile = operation.effect_profile;
  if (
    actor === null ||
    target === null ||
    !isStringArray(requested) ||
    typeof effectProfile !== 'string' ||
    !(effectProfile in effectFloor)
  ) {
    return blackDenial('OPERATION_FIELDS_REJECTED');
  }
  if (
    stringField(actor, 'actor_id') !== context.actorId ||
    stringField(actor, 'actor_generation') !== context.actorGeneration ||
    stringField(actor, 'session_id') !== context.sessionId ||
    stringField(target, 'resource_id') !== context.resourceId ||
    stringField(target, 'generation') !== context.resourceGeneration
  ) {
    return blackDenial('POLICY_IDENTITY_MISMATCH');
  }

  const environment = stringField(target, 'environment');
  if (environment === null || !(environment in environmentFloor)) {
    return blackDenial('TARGET_ENVIRONMENT_REJECTED');
  }

  const effectTier = effectFloor[effectProfile as keyof typeof effectFloor];
  const environmentTier = environmentFloor[environment as keyof typeof environmentFloor];
  const minimumTier = higherTier(effectTier, environmentTier);
  if (requested.some((capability) => !knownCapabilities.has(capability))) {
    return blackDenial('UNKNOWN_CAPABILITY', minimumTier);
  }

  const effectiveCapabilities = intersectCapabilities(requested, context);
  if (
    effectiveCapabilities.length !== requested.length ||
    !requested.every((capability, index) => capability === effectiveCapabilities[index])
  ) {
    return blackDenial('CAPABILITY_EXPANSION_REJECTED', minimumTier);
  }

  switch (minimumTier) {
    case 'GREEN':
      return policyResult('GREEN', 'GREEN', 'AUTO_ALLOW', 'NONE', effectiveCapabilities, [
        'SYNTHETIC_NON_MUTATING_PROVEN',
      ]);
    case 'YELLOW': {
      const envelope = new Set(context.capabilityEnvelopeCapabilities);
      const envelopeAllows = context.capabilityEnvelopeActive &&
        effectiveCapabilities.every((capability) => envelope.has(capability));
      return envelopeAllows
        ? policyResult('YELLOW', 'YELLOW', 'ENVELOPE_ALLOW', 'CAPABILITY_ENVELOPE', effectiveCapabilities, [
          'ACTIVE_CAPABILITY_ENVELOPE',
        ])
        : policyResult('YELLOW', 'YELLOW', 'DENY', 'CAPABILITY_ENVELOPE', [], [
          'CAPABILITY_ENVELOPE_REQUIRED',
        ]);
    }
    case 'RED':
      return policyResult('RED', 'RED', 'OWNER_REVIEW_REQUIRED', 'FRESH_LOCAL', effectiveCapabilities, [
        'FRESH_LOCAL_APPROVAL_REQUIRED',
      ]);
    case 'BLACK':
      return blackDenial('PROHIBITED_TARGET_OR_EFFECT');
  }
}
