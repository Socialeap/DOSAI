import { createHash, randomUUID } from 'node:crypto';

import type {
  CapsuleRegistryAuditBindingPort,
  CapsuleRegistryBindingAcknowledgement,
  CapsuleRegistryTransition,
} from '../../src/contracts/p3/audit-binding.ts';
import {
  admitCapsuleRegistryDocument,
  serializeCapsuleRegistryDocument,
  type CapsuleRegistryDocument,
} from '../../src/contracts/p3/persistence.ts';
import {
  AUDIT_SCHEMA_IDS_V2,
  CAPSULE_REGISTRY_TRANSITIONS,
  type AuditAcknowledgement,
  type AuditEvent,
  type CapsuleRegistryRevisionCommittedPayload,
  type Digest,
} from './contracts.ts';

const SOURCE_ID = 'dosai.capsule-registry';
const decimalSequencePattern = /^(0|[1-9][0-9]{0,31})$/;

export type CapsuleRegistryAuditBindingFailureCode =
  | 'DOSAI_CAPSULE_AUDIT_BINDING_AUTH_0001'
  | 'DOSAI_CAPSULE_AUDIT_BINDING_CONTINUITY_0001'
  | 'DOSAI_CAPSULE_AUDIT_BINDING_PERSISTENCE_0001'
  | 'DOSAI_CAPSULE_AUDIT_BINDING_SCHEMA_0001';

export class CapsuleRegistryAuditBindingFailure extends Error {
  readonly code: CapsuleRegistryAuditBindingFailureCode;

  constructor(code: CapsuleRegistryAuditBindingFailureCode) {
    super(code);
    this.name = 'CapsuleRegistryAuditBindingFailure';
    this.code = code;
  }
}

export type CapsuleRegistryAuditJournal = Readonly<{
  append(
    sourceId: string,
    authenticationToken: Uint8Array,
    proposalCandidate: unknown,
  ): AuditAcknowledgement;
  visitEventsForSource(
    sourceId: string,
    authenticationToken: Uint8Array,
    visitor: (event: AuditEvent) => void,
  ): void;
}>;

export type CapsuleRegistryAuditBindingOptions = Readonly<{
  sourceGeneration: string;
  authenticationToken: Uint8Array;
}>;

export type CapsuleRegistryAuditBinding = CapsuleRegistryAuditBindingPort & Readonly<{
  close(): void;
}>;

type ChainHead = Readonly<{
  payload: CapsuleRegistryRevisionCommittedPayload;
}>;

function fail(code: CapsuleRegistryAuditBindingFailureCode): never {
  throw new CapsuleRegistryAuditBindingFailure(code);
}

function digestRegistry(registry: CapsuleRegistryDocument): Digest {
  return Object.freeze({
    algorithm: 'SHA-256',
    value: createHash('sha256')
      .update(serializeCapsuleRegistryDocument(registry))
      .digest('hex'),
  });
}

function sameDigest(left: Digest | null, right: Digest | null): boolean {
  return left === null || right === null
    ? left === right
    : left.algorithm === right.algorithm && left.value === right.value;
}

function committedPayload(event: AuditEvent): CapsuleRegistryRevisionCommittedPayload {
  if (
    event.schema_id !== AUDIT_SCHEMA_IDS_V2.event ||
    event.schema_version !== 2 ||
    event.event_kind !== 'CAPSULE_REGISTRY_REVISION_COMMITTED' ||
    event.source.source_id !== SOURCE_ID ||
    event.source.provenance !== 'SUPERVISOR_OBSERVATION'
  ) {
    return fail('DOSAI_CAPSULE_AUDIT_BINDING_CONTINUITY_0001');
  }
  return event.payload as unknown as CapsuleRegistryRevisionCommittedPayload;
}

function assertNextPayload(
  previous: CapsuleRegistryRevisionCommittedPayload | null,
  current: CapsuleRegistryRevisionCommittedPayload,
): void {
  if (previous === null) {
    if (
      current.transition !== 'INITIALIZE' ||
      current.revision !== '1' ||
      current.previous_registry_digest !== null
    ) {
      fail('DOSAI_CAPSULE_AUDIT_BINDING_CONTINUITY_0001');
    }
    return;
  }
  if (
    current.transition === 'INITIALIZE' ||
    BigInt(current.revision) !== BigInt(previous.revision) + 1n ||
    !sameDigest(current.previous_registry_digest, previous.registry_digest)
  ) {
    fail('DOSAI_CAPSULE_AUDIT_BINDING_CONTINUITY_0001');
  }
  const previousGeneration = BigInt(previous.supervisor_generation);
  const currentGeneration = BigInt(current.supervisor_generation);
  if (
    (current.transition === 'STARTUP_RECONCILE' && currentGeneration <= previousGeneration) ||
    (current.transition !== 'STARTUP_RECONCILE' && currentGeneration !== previousGeneration)
  ) {
    fail('DOSAI_CAPSULE_AUDIT_BINDING_CONTINUITY_0001');
  }
}

function matchesRegistry(
  payload: CapsuleRegistryRevisionCommittedPayload,
  registry: CapsuleRegistryDocument,
): boolean {
  return payload.registry_schema_id === registry.schema_id &&
    payload.registry_schema_version === registry.schema_version &&
    payload.supervisor_generation === registry.supervisor_generation &&
    payload.revision === registry.revision &&
    sameDigest(payload.registry_digest, digestRegistry(registry));
}

function dataProperty(candidate: object, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(candidate, key);
  return descriptor !== undefined && descriptor.enumerable && 'value' in descriptor
    ? descriptor.value
    : fail('DOSAI_CAPSULE_AUDIT_BINDING_SCHEMA_0001');
}

export function createCapsuleRegistryAuditBinding(
  journalCandidate: CapsuleRegistryAuditJournal,
  optionsCandidate: CapsuleRegistryAuditBindingOptions,
): CapsuleRegistryAuditBinding {
  if (
    journalCandidate === null ||
    typeof journalCandidate !== 'object' ||
    typeof journalCandidate.append !== 'function' ||
    typeof journalCandidate.visitEventsForSource !== 'function' ||
    optionsCandidate === null ||
    typeof optionsCandidate !== 'object' ||
    Object.getPrototypeOf(optionsCandidate) !== Object.prototype ||
    Object.keys(optionsCandidate).sort().join('\0') !==
      ['authenticationToken', 'sourceGeneration'].sort().join('\0')
  ) {
    return fail('DOSAI_CAPSULE_AUDIT_BINDING_SCHEMA_0001');
  }
  const sourceGeneration = dataProperty(optionsCandidate, 'sourceGeneration');
  const tokenCandidate = dataProperty(optionsCandidate, 'authenticationToken');
  if (
    typeof sourceGeneration !== 'string' ||
    !decimalSequencePattern.test(sourceGeneration) ||
    !(tokenCandidate instanceof Uint8Array) ||
    Object.getPrototypeOf(tokenCandidate) !== Uint8Array.prototype ||
    !(tokenCandidate.buffer instanceof ArrayBuffer) ||
    tokenCandidate.byteLength !== 32 ||
    tokenCandidate.every((byte) => byte === 0)
  ) {
    return fail('DOSAI_CAPSULE_AUDIT_BINDING_AUTH_0001');
  }
  const authenticationToken = new Uint8Array(tokenCandidate);
  let closed = false;

  const assertOpen = (): void => {
    if (closed) {
      fail('DOSAI_CAPSULE_AUDIT_BINDING_AUTH_0001');
    }
  };

  const scanChain = (): ChainHead | null => {
    assertOpen();
    let head: CapsuleRegistryRevisionCommittedPayload | null = null;
    try {
      journalCandidate.visitEventsForSource(
        SOURCE_ID,
        authenticationToken,
        (event) => {
          const payload = committedPayload(event);
          assertNextPayload(head, payload);
          head = payload;
        },
      );
    } catch (error) {
      if (error instanceof CapsuleRegistryAuditBindingFailure) {
        throw error;
      }
      return fail('DOSAI_CAPSULE_AUDIT_BINDING_PERSISTENCE_0001');
    }
    return head === null ? null : Object.freeze({ payload: head });
  };

  const verifyCurrent = async (candidate: CapsuleRegistryDocument | null): Promise<void> => {
    let registry: CapsuleRegistryDocument | null;
    try {
      registry = candidate === null ? null : admitCapsuleRegistryDocument(candidate);
    } catch {
      return fail('DOSAI_CAPSULE_AUDIT_BINDING_SCHEMA_0001');
    }
    const head = scanChain();
    if (
      (registry === null && head !== null) ||
      (registry !== null && (head === null || !matchesRegistry(head.payload, registry)))
    ) {
      fail('DOSAI_CAPSULE_AUDIT_BINDING_CONTINUITY_0001');
    }
  };

  const bindTransition = async (
    previousCandidate: CapsuleRegistryDocument | null,
    currentCandidate: CapsuleRegistryDocument,
    transitionCandidate: CapsuleRegistryTransition,
  ): Promise<CapsuleRegistryBindingAcknowledgement> => {
    let previous: CapsuleRegistryDocument | null;
    let current: CapsuleRegistryDocument;
    try {
      previous = previousCandidate === null
        ? null
        : admitCapsuleRegistryDocument(previousCandidate);
      current = admitCapsuleRegistryDocument(currentCandidate);
    } catch {
      return fail('DOSAI_CAPSULE_AUDIT_BINDING_SCHEMA_0001');
    }
    if (!CAPSULE_REGISTRY_TRANSITIONS.includes(transitionCandidate)) {
      return fail('DOSAI_CAPSULE_AUDIT_BINDING_SCHEMA_0001');
    }

    const head = scanChain();
    if (
      (previous === null && head !== null) ||
      (previous !== null && (head === null || !matchesRegistry(head.payload, previous)))
    ) {
      return fail('DOSAI_CAPSULE_AUDIT_BINDING_CONTINUITY_0001');
    }
    const previousDigest = previous === null ? null : digestRegistry(previous);
    const payload: CapsuleRegistryRevisionCommittedPayload = Object.freeze({
      registry_schema_id: current.schema_id,
      registry_schema_version: current.schema_version,
      supervisor_generation: current.supervisor_generation,
      revision: current.revision,
      previous_registry_digest: previousDigest,
      registry_digest: digestRegistry(current),
      transition: transitionCandidate,
    });
    assertNextPayload(head?.payload ?? null, payload);
    if (previousDigest !== null && sameDigest(previousDigest, payload.registry_digest)) {
      return fail('DOSAI_CAPSULE_AUDIT_BINDING_CONTINUITY_0001');
    }

    let acknowledgement: AuditAcknowledgement;
    try {
      acknowledgement = journalCandidate.append(SOURCE_ID, authenticationToken, {
        schema_id: AUDIT_SCHEMA_IDS_V2.proposal,
        schema_version: 2,
        message_id: randomUUID(),
        created_at: new Date().toISOString(),
        producer: SOURCE_ID,
        producer_generation: sourceGeneration,
        trace_id: randomUUID(),
        data_class: 'D1',
        event_kind: 'CAPSULE_REGISTRY_REVISION_COMMITTED',
        payload,
      });
    } catch {
      return fail('DOSAI_CAPSULE_AUDIT_BINDING_PERSISTENCE_0001');
    }
    const committedHead = scanChain();
    if (committedHead === null || !matchesRegistry(committedHead.payload, current)) {
      return fail('DOSAI_CAPSULE_AUDIT_BINDING_CONTINUITY_0001');
    }
    return Object.freeze({
      journalSequence: acknowledgement.sequence,
      eventHash: acknowledgement.event_hash,
    });
  };

  return Object.freeze({
    verifyCurrent,
    bindTransition,
    close(): void {
      if (!closed) {
        authenticationToken.fill(0);
        closed = true;
      }
    },
  });
}
