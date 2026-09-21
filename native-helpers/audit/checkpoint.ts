import {
  createHash,
  generateKeyPairSync,
  randomUUID,
  sign,
  type KeyObject,
} from 'node:crypto';

import {
  AUDIT_ALGORITHM_SUITE,
  type Digest,
} from './contracts.ts';
import {
  CHECKPOINT_ALGORITHM_SUITE,
  CHECKPOINT_POLICY_VERSION,
  CHECKPOINT_SCHEMA_IDS,
  admitAuditCheckpointPayload,
  auditAnchorReceiptDigest,
  auditCheckpointDigest,
  auditCheckpointSigningBytes,
  verifyAuditCheckpoint,
  type AuditAnchorReceipt,
  type AuditCheckpoint,
  type AuditCheckpointPayload,
  type CheckpointKey,
  type CheckpointTransitionKind,
} from './checkpoint-contracts.ts';
import {
  verifyAuditJournal,
  type AuditRequiredHead,
  type JournalIdentity,
} from './journal.ts';
import {
  verifyStoredRekorV2Receipt,
  type RekorV2PinnedTrustMaterial,
} from './rekor-v2.ts';

export type CheckpointFailureCode =
  | 'DOSAI_CHECKPOINT_AUTHORITY_0001'
  | 'DOSAI_CHECKPOINT_LINEAGE_0001'
  | 'DOSAI_CHECKPOINT_PRECONDITION_0001'
  | 'DOSAI_CHECKPOINT_SIGNATURE_0001';

export class CheckpointFailure extends Error {
  readonly code: CheckpointFailureCode;
  readonly assurance = 'BROKEN';

  constructor(code: CheckpointFailureCode) {
    super(code);
    this.name = 'CheckpointFailure';
    this.code = code;
  }
}

export type CheckpointSigningAuthority = Readonly<{
  key: CheckpointKey;
  implementation: 'EPHEMERAL_SOFTWARE_TEST_FIXTURE';
}>;

export type CreateCheckpointOptions = Readonly<{
  databasePath: string;
  expectedIdentity: JournalIdentity;
  producerGeneration: string;
  transition: Readonly<{
    kind: CheckpointTransitionKind;
    reasonCode: AuditCheckpointPayload['transition']['reason_code'];
  }>;
  activeAuthority: CheckpointSigningAuthority;
  previousAuthority?: CheckpointSigningAuthority;
  previousCheckpoint?: AuditCheckpoint;
  expectedPreviousCheckpointDigest: Digest | null;
  expectedPreviousAnchorReceiptDigest: Digest | null;
  requiredJournalHead?: AuditRequiredHead;
}>;

export type AuditAssuranceState =
  | 'LOCAL_DURABLE'
  | 'SIGNED_LOCAL_SOFTWARE'
  | 'SIGNED_LOCAL_HARDWARE'
  | 'ANCHORED'
  | 'DEGRADED'
  | 'BROKEN';

export type AuditAssuranceReport = Readonly<{
  state: AuditAssuranceState;
  localDurableThroughSequence: string;
  signedThroughSequence: string | null;
  anchoredThroughSequence: string | null;
  unanchoredEventCount: string;
  trustedTimeAvailable: boolean;
  limitations: readonly string[];
}>;

type SignCallback = (bytes: Uint8Array) => Buffer;
type AuthorityState = {
  readonly sign: SignCallback;
  journalId: string | null;
  journalEpochId: string | null;
  latestCheckpointDigest: string | null;
  retired: boolean;
};
const authorityStates = new WeakMap<object, AuthorityState>();

function fail(code: CheckpointFailureCode): never {
  throw new CheckpointFailure(code);
}

function exactDigest(actual: Digest | null, expected: Digest | null): boolean {
  return actual === null
    ? expected === null
    : expected !== null && actual.algorithm === expected.algorithm && actual.value === expected.value;
}

function keyFromPublicKey(publicKey: KeyObject): CheckpointKey {
  const der = publicKey.export({ format: 'der', type: 'spki' });
  return Object.freeze({
    key_id: createHash('sha256').update(der).digest('hex'),
    algorithm: 'ECDSA_P256_SHA256',
    protection: 'SOFTWARE_BACKED_TEST_ONLY',
    public_key_spki_der_base64: der.toString('base64'),
  });
}

export function createSoftwareCheckpointAuthorityForTesting(): CheckpointSigningAuthority {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const authority = Object.freeze({
    key: keyFromPublicKey(publicKey),
    implementation: 'EPHEMERAL_SOFTWARE_TEST_FIXTURE' as const,
  });
  authorityStates.set(authority, {
    sign: (bytes) => sign('sha256', bytes, privateKey),
    journalId: null,
    journalEpochId: null,
    latestCheckpointDigest: null,
    retired: false,
  });
  return authority;
}

function stateFor(authority: CheckpointSigningAuthority): AuthorityState {
  const state = authorityStates.get(authority);
  if (state === undefined) {
    return fail('DOSAI_CHECKPOINT_AUTHORITY_0001');
  }
  return state;
}

function assertAuthorityLineage(
  options: CreateCheckpointOptions,
  activeState: AuthorityState,
  previousState: AuthorityState | undefined,
): void {
  const expectedPrevious = options.expectedPreviousCheckpointDigest?.value ?? null;
  const boundToJournal = (state: AuthorityState) =>
    state.journalId === options.expectedIdentity.journalId &&
    state.journalEpochId === options.expectedIdentity.journalEpochId;
  if (activeState.retired) {
    return fail('DOSAI_CHECKPOINT_AUTHORITY_0001');
  }
  if (options.transition.kind === 'GENESIS') {
    if (
      activeState.latestCheckpointDigest !== null ||
      activeState.journalId !== null ||
      activeState.journalEpochId !== null
    ) {
      return fail('DOSAI_CHECKPOINT_AUTHORITY_0001');
    }
    return;
  }
  if (options.transition.kind === 'CONTINUITY') {
    if (!boundToJournal(activeState) || activeState.latestCheckpointDigest !== expectedPrevious) {
      return fail('DOSAI_CHECKPOINT_AUTHORITY_0001');
    }
    return;
  }
  if (
    activeState.latestCheckpointDigest !== null ||
    activeState.journalId !== null ||
    activeState.journalEpochId !== null
  ) {
    return fail('DOSAI_CHECKPOINT_AUTHORITY_0001');
  }
  if (options.transition.kind === 'ROTATION') {
    if (
      previousState === undefined ||
      previousState.retired ||
      !boundToJournal(previousState) ||
      previousState.latestCheckpointDigest !== expectedPrevious
    ) {
      return fail('DOSAI_CHECKPOINT_AUTHORITY_0001');
    }
  }
}

function transitionPreviousKey(
  kind: CheckpointTransitionKind,
  previousCheckpoint: AuditCheckpoint | undefined,
  activeKeyId: string,
): string | null {
  if (kind === 'GENESIS') {
    return null;
  }
  const previousKeyId = previousCheckpoint?.active_signing_key_id
    ?? fail('DOSAI_CHECKPOINT_LINEAGE_0001');
  if (kind === 'CONTINUITY' && previousKeyId !== activeKeyId) {
    return fail('DOSAI_CHECKPOINT_LINEAGE_0001');
  }
  if ((kind === 'ROTATION' || kind === 'RECOVERY') && previousKeyId === activeKeyId) {
    return fail('DOSAI_CHECKPOINT_LINEAGE_0001');
  }
  return previousKeyId;
}

function validateLineage(
  options: CreateCheckpointOptions,
  currentSequence: bigint,
  previous: AuditCheckpoint | undefined,
): AuditCheckpoint | undefined {
  if (options.transition.kind === 'GENESIS') {
    if (
      previous !== undefined ||
      options.expectedPreviousCheckpointDigest !== null ||
      options.expectedPreviousAnchorReceiptDigest !== null ||
      options.previousAuthority !== undefined
    ) {
      return fail('DOSAI_CHECKPOINT_LINEAGE_0001');
    }
    return undefined;
  }
  if (previous === undefined || options.expectedPreviousCheckpointDigest === null) {
    return fail('DOSAI_CHECKPOINT_LINEAGE_0001');
  }
  if (
    !exactDigest(auditCheckpointDigest(previous), options.expectedPreviousCheckpointDigest) ||
    previous.journal_id !== options.expectedIdentity.journalId ||
    previous.journal_epoch_id !== options.expectedIdentity.journalEpochId ||
    BigInt(previous.sequence) >= currentSequence
  ) {
    return fail('DOSAI_CHECKPOINT_LINEAGE_0001');
  }
  if (options.transition.kind === 'ROTATION') {
    if (
      options.previousAuthority === undefined ||
      options.previousAuthority.key.key_id !== previous.active_signing_key_id
    ) {
      return fail('DOSAI_CHECKPOINT_AUTHORITY_0001');
    }
    stateFor(options.previousAuthority);
  } else if (options.previousAuthority !== undefined) {
    return fail('DOSAI_CHECKPOINT_AUTHORITY_0001');
  }
  return previous;
}

export function createSignedAuditCheckpoint(options: CreateCheckpointOptions): AuditCheckpoint {
  const previousCandidate = options.previousCheckpoint === undefined
    ? undefined
    : verifyAuditCheckpoint(options.previousCheckpoint);
  if (options.requiredJournalHead !== undefined && previousCandidate !== undefined) {
    return fail('DOSAI_CHECKPOINT_PRECONDITION_0001');
  }
  const report = verifyAuditJournal(
    options.databasePath,
    options.expectedIdentity,
    options.requiredJournalHead ?? (previousCandidate === undefined
      ? undefined
      : { sequence: previousCandidate.sequence, eventHash: previousCandidate.event_hash }),
  );
  const currentSequence = BigInt(report.verifiedThroughSequence);
  if (currentSequence < 1n || !/^[1-9][0-9]{0,31}$/.test(options.producerGeneration)) {
    return fail('DOSAI_CHECKPOINT_PRECONDITION_0001');
  }
  const activeState = stateFor(options.activeAuthority);
  const previous = validateLineage(options, currentSequence, previousCandidate);
  const previousState = options.previousAuthority === undefined
    ? undefined
    : stateFor(options.previousAuthority);
  assertAuthorityLineage(options, activeState, previousState);
  const previousKeyId = transitionPreviousKey(
    options.transition.kind,
    previous,
    options.activeAuthority.key.key_id,
  );
  const keys = options.transition.kind === 'ROTATION'
    ? [options.activeAuthority.key, options.previousAuthority!.key]
    : [options.activeAuthority.key];
  keys.sort((left, right) => left.key_id < right.key_id ? -1 : left.key_id > right.key_id ? 1 : 0);

  const payload = admitAuditCheckpointPayload({
    schema_id: CHECKPOINT_SCHEMA_IDS.checkpoint,
    schema_version: 1,
    checkpoint_id: randomUUID(),
    created_at: new Date().toISOString(),
    producer: 'dosai.checkpoint-signer',
    producer_generation: options.producerGeneration,
    data_class: 'D5',
    journal_algorithm_suite: AUDIT_ALGORITHM_SUITE,
    checkpoint_algorithm_suite: CHECKPOINT_ALGORITHM_SUITE,
    checkpoint_policy_version: CHECKPOINT_POLICY_VERSION,
    journal_id: options.expectedIdentity.journalId,
    journal_epoch_id: options.expectedIdentity.journalEpochId,
    sequence: report.verifiedThroughSequence,
    event_hash: report.headHash,
    previous_checkpoint_digest: options.expectedPreviousCheckpointDigest,
    previous_anchor_receipt_digest: options.expectedPreviousAnchorReceiptDigest,
    transition: {
      kind: options.transition.kind,
      previous_signing_key_id: previousKeyId,
      reason_code: options.transition.reasonCode,
    },
    active_signing_key_id: options.activeAuthority.key.key_id,
    signing_keys: keys,
  });
  const signingBytes = auditCheckpointSigningBytes(payload);
  const signatures = keys.map((key) => {
    const signer = key.key_id === options.activeAuthority.key.key_id
      ? activeState.sign
      : previousState?.sign ?? fail('DOSAI_CHECKPOINT_AUTHORITY_0001');
    return Object.freeze({
      key_id: key.key_id,
      format: 'ASN1_DER' as const,
      value_base64: signer(signingBytes).toString('base64'),
    });
  });
  try {
    const checkpoint = verifyAuditCheckpoint({ ...payload, signatures });
    const checkpointDigest = auditCheckpointDigest(checkpoint).value;
    activeState.journalId = options.expectedIdentity.journalId;
    activeState.journalEpochId = options.expectedIdentity.journalEpochId;
    activeState.latestCheckpointDigest = checkpointDigest;
    if (options.transition.kind === 'ROTATION' && previousState !== undefined) {
      previousState.retired = true;
    }
    return checkpoint;
  } catch {
    return fail('DOSAI_CHECKPOINT_SIGNATURE_0001');
  }
}

export function evaluateAuditAssurance(input: Readonly<{
  localDurableThroughSequence: string;
  journalBroken: boolean;
  checkpoint?: AuditCheckpoint;
  receipt?: AuditAnchorReceipt;
  maximumUnanchoredEvents: number;
  trustedTimeRequired: boolean;
  trustedTimeAvailable: boolean;
  anchorTrust?: RekorV2PinnedTrustMaterial;
}>): AuditAssuranceReport {
  const local = BigInt(input.localDurableThroughSequence);
  if (
    local < 0n ||
    !Number.isSafeInteger(input.maximumUnanchoredEvents) ||
    input.maximumUnanchoredEvents < 0
  ) {
    return fail('DOSAI_CHECKPOINT_PRECONDITION_0001');
  }
  if (input.journalBroken) {
    return Object.freeze({
      state: 'BROKEN',
      localDurableThroughSequence: local.toString(),
      signedThroughSequence: null,
      anchoredThroughSequence: null,
      unanchoredEventCount: local.toString(),
      trustedTimeAvailable: input.trustedTimeAvailable,
      limitations: Object.freeze(['JOURNAL_BROKEN']),
    });
  }
  if (input.checkpoint === undefined) {
    return Object.freeze({
      state: local > BigInt(input.maximumUnanchoredEvents) ? 'DEGRADED' : 'LOCAL_DURABLE',
      localDurableThroughSequence: local.toString(),
      signedThroughSequence: null,
      anchoredThroughSequence: null,
      unanchoredEventCount: local.toString(),
      trustedTimeAvailable: input.trustedTimeAvailable,
      limitations: Object.freeze(['UNSIGNED', 'UNANCHORED', 'LOCAL_ROLLBACK_NOT_DETECTABLE']),
    });
  }

  const checkpoint = verifyAuditCheckpoint(input.checkpoint);
  const signed = BigInt(checkpoint.sequence);
  if (signed > local) {
    return fail('DOSAI_CHECKPOINT_LINEAGE_0001');
  }
  const activeKey = checkpoint.signing_keys.find(
    ({ key_id }) => key_id === checkpoint.active_signing_key_id,
  ) ?? fail('DOSAI_CHECKPOINT_LINEAGE_0001');
  const limitations = new Set<string>();
  if (activeKey.protection === 'SOFTWARE_BACKED_TEST_ONLY') {
    limitations.add('SOFTWARE_BACKED_SIGNING');
  } else {
    limitations.add('HARDWARE_PROTECTION_PROOF_UNAVAILABLE');
  }
  if (checkpoint.transition.kind === 'RECOVERY') {
    limitations.add('KEY_CONTINUITY_RECOVERY');
  }

  let anchored: bigint | null = null;
  if (input.receipt !== undefined) {
    if (input.anchorTrust === undefined) {
      return fail('DOSAI_CHECKPOINT_PRECONDITION_0001');
    }
    const receipt = verifyStoredRekorV2Receipt(checkpoint, input.receipt, input.anchorTrust);
    if (
      !exactDigest(receipt.checkpoint_digest, auditCheckpointDigest(checkpoint)) ||
      !exactDigest(receipt.previous_anchor_receipt_digest, checkpoint.previous_anchor_receipt_digest)
    ) {
      return fail('DOSAI_CHECKPOINT_LINEAGE_0001');
    }
    anchored = signed;
    if (input.trustedTimeRequired && !input.trustedTimeAvailable) {
      limitations.add('TRUSTED_TIME_REQUIRED');
    }
  } else {
    limitations.add('UNANCHORED');
    limitations.add('LOCAL_ROLLBACK_NOT_DETECTABLE');
  }
  const unanchored = local - (anchored ?? 0n);
  if (unanchored > BigInt(input.maximumUnanchoredEvents)) {
    limitations.add('ANCHOR_EVENT_LAG_EXCEEDED');
  }

  let state: AuditAssuranceState;
  if (
    checkpoint.transition.kind === 'RECOVERY' ||
    limitations.has('HARDWARE_PROTECTION_PROOF_UNAVAILABLE') ||
    limitations.has('TRUSTED_TIME_REQUIRED') ||
    limitations.has('ANCHOR_EVENT_LAG_EXCEEDED')
  ) {
    state = 'DEGRADED';
  } else if (anchored !== null) {
    state = 'ANCHORED';
  } else {
    state = activeKey.protection === 'SECURE_ENCLAVE'
      ? 'SIGNED_LOCAL_HARDWARE'
      : 'SIGNED_LOCAL_SOFTWARE';
  }
  return Object.freeze({
    state,
    localDurableThroughSequence: local.toString(),
    signedThroughSequence: signed.toString(),
    anchoredThroughSequence: anchored?.toString() ?? null,
    unanchoredEventCount: unanchored.toString(),
    trustedTimeAvailable: input.trustedTimeAvailable,
    limitations: Object.freeze([...limitations].sort()),
  });
}

export function receiptIdentity(receipt: AuditAnchorReceipt): Digest {
  return auditAnchorReceiptDigest(receipt);
}
