import {
  createHash,
  createPublicKey,
  verify as verifySignature,
  type KeyObject,
} from 'node:crypto';

import {
  AUDIT_ALGORITHM_SUITE,
  canonicalAuditJson,
  type Digest,
  type JsonValue,
} from './contracts.ts';

export const CHECKPOINT_SCHEMA_IDS = Object.freeze({
  checkpoint: 'urn:dosai:schema:audit-checkpoint:1',
  receipt: 'urn:dosai:schema:audit-anchor-receipt:1',
} as const);

export const CHECKPOINT_ALGORITHM_SUITE =
  'DOSAI-CHECKPOINT-ECDSA-P256-SHA256-JCS-V1' as const;
export const CHECKPOINT_POLICY_VERSION = '1' as const;

const CHECKPOINT_HASH_DOMAIN = Buffer.from('DOSAI\0AUDIT-CHECKPOINT\0V1\0', 'ascii');
const RECEIPT_HASH_DOMAIN = Buffer.from('DOSAI\0AUDIT-ANCHOR-RECEIPT\0V1\0', 'ascii');
const digestPattern = /^[0-9a-f]{64}$/;
const sequencePattern = /^(0|[1-9][0-9]{0,31})$/;
const timestampPattern = /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export type CheckpointKeyProtection = 'SECURE_ENCLAVE' | 'SOFTWARE_BACKED_TEST_ONLY';
export type CheckpointTransitionKind = 'GENESIS' | 'CONTINUITY' | 'ROTATION' | 'RECOVERY';

export type CheckpointKey = Readonly<{
  key_id: string;
  algorithm: 'ECDSA_P256_SHA256';
  protection: CheckpointKeyProtection;
  public_key_spki_der_base64: string;
}>;

export type CheckpointSignature = Readonly<{
  key_id: string;
  format: 'ASN1_DER';
  value_base64: string;
}>;

export type AuditCheckpointPayload = Readonly<{
  schema_id: typeof CHECKPOINT_SCHEMA_IDS.checkpoint;
  schema_version: 1;
  checkpoint_id: string;
  created_at: string;
  producer: 'dosai.checkpoint-signer';
  producer_generation: string;
  data_class: 'D5';
  journal_algorithm_suite: typeof AUDIT_ALGORITHM_SUITE;
  checkpoint_algorithm_suite: typeof CHECKPOINT_ALGORITHM_SUITE;
  checkpoint_policy_version: typeof CHECKPOINT_POLICY_VERSION;
  journal_id: string;
  journal_epoch_id: string;
  sequence: string;
  event_hash: Digest;
  previous_checkpoint_digest: Digest | null;
  previous_anchor_receipt_digest: Digest | null;
  transition: Readonly<{
    kind: CheckpointTransitionKind;
    previous_signing_key_id: string | null;
    reason_code:
      | 'INITIAL_INSTALL'
      | 'PERIODIC'
      | 'EFFECT_CRITICAL'
      | 'OWNER_ROTATION'
      | 'KEY_LOSS'
      | 'HARDWARE_MIGRATION'
      | 'PLATFORM_UNAVAILABLE';
  }>;
  active_signing_key_id: string;
  signing_keys: readonly CheckpointKey[];
}>;

export type AuditCheckpoint = AuditCheckpointPayload & Readonly<{
  signatures: readonly CheckpointSignature[];
}>;

export type AuditAnchorReceipt = Readonly<{
  schema_id: typeof CHECKPOINT_SCHEMA_IDS.receipt;
  schema_version: 1;
  receipt_id: string;
  created_at: string;
  producer: 'dosai.anchor-verifier';
  producer_generation: string;
  data_class: 'D5';
  backend: 'SIGSTORE_REKOR_V2';
  checkpoint_digest: Digest;
  previous_anchor_receipt_digest: Digest | null;
  trusted_root_digest: Digest;
  signing_config_digest: Digest;
  log_origin: string;
  log_key_id_base64: string;
  log_index: string;
  tree_size: string;
  canonicalized_body_base64: string;
  inclusion_hashes_base64: readonly string[];
  checkpoint_envelope: string;
  assurance: 'INCLUSION_PROOF_VERIFIED_NO_TRUSTED_TIME';
}>;

export type AuditAnchorReceiptWithoutId = Omit<AuditAnchorReceipt, 'receipt_id'>;

function fail(): never {
  throw new TypeError('DOSAI_CHECKPOINT_SCHEMA_0001');
}

function clonePlainJson(
  value: unknown,
  depth: number,
  budget: { remaining: number },
): JsonValue {
  budget.remaining -= 1;
  if (budget.remaining < 0 || depth > 14) {
    return fail();
  }
  if (value === null || typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    return value.length <= 16_384 ? value : fail();
  }
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && !Object.is(value, -0) ? value : fail();
  }
  if (Array.isArray(value)) {
    if (
      value.length > 64 ||
      Object.keys(value).some((key, index) => key !== String(index))
    ) {
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

function admit(value: unknown): { readonly [key: string]: JsonValue } {
  const clone = clonePlainJson(value, 0, { remaining: 768 });
  if (clone === null || typeof clone !== 'object' || Array.isArray(clone)) {
    return fail();
  }
  return freezeJson(clone) as { readonly [key: string]: JsonValue };
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
  return typeof value[key] === 'string' ? value[key] as string : fail();
}

function assertUuid(value: string): void {
  if (!uuidPattern.test(value)) {
    fail();
  }
}

function assertTimestamp(value: string): void {
  const parsed = Date.parse(value);
  if (!timestampPattern.test(value) || !Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) {
    fail();
  }
}

function assertSequence(value: string): void {
  if (!sequencePattern.test(value)) {
    fail();
  }
}

function assertDigest(value: JsonValue): void {
  const candidate = objectValue(value);
  exactKeys(candidate, ['algorithm', 'value']);
  if (candidate.algorithm !== 'SHA-256' || !digestPattern.test(stringField(candidate, 'value'))) {
    fail();
  }
}

function assertNullableDigest(value: JsonValue): void {
  if (value !== null) {
    assertDigest(value);
  }
}

function decodeCanonicalBase64(value: string, minimum: number, maximum: number): Buffer {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value)) {
    return fail();
  }
  const decoded = Buffer.from(value, 'base64');
  if (decoded.byteLength < minimum || decoded.byteLength > maximum || decoded.toString('base64') !== value) {
    return fail();
  }
  return decoded;
}

function assertP256PublicKey(value: string, expectedKeyId: string): KeyObject {
  const der = decodeCanonicalBase64(value, 80, 160);
  let key: KeyObject;
  try {
    key = createPublicKey({ key: der, format: 'der', type: 'spki' });
  } catch {
    return fail();
  }
  const details = key.asymmetricKeyDetails;
  if (
    key.asymmetricKeyType !== 'ec' ||
    details?.namedCurve !== 'prime256v1' ||
    key.export({ format: 'der', type: 'spki' }).compare(der) !== 0 ||
    createHash('sha256').update(der).digest('hex') !== expectedKeyId
  ) {
    return fail();
  }
  return key;
}

function assertDerSignature(value: string): Buffer {
  const der = decodeCanonicalBase64(value, 8, 80);
  if (der[0] !== 0x30 || der[1] !== der.byteLength - 2) {
    return fail();
  }
  let offset = 2;
  for (let item = 0; item < 2; item += 1) {
    if (der[offset] !== 0x02) {
      return fail();
    }
    const length = der[offset + 1] as number;
    const first = der[offset + 2] as number;
    if (
      length < 1 ||
      length > 33 ||
      offset + 2 + length > der.byteLength ||
      (first & 0x80) !== 0 ||
      (length > 1 && first === 0 && ((der[offset + 3] as number) & 0x80) === 0)
    ) {
      return fail();
    }
    offset += 2 + length;
  }
  return offset === der.byteLength ? der : fail();
}

function checkpointPayloadObject(checkpoint: AuditCheckpoint): AuditCheckpointPayload {
  const { signatures: _signatures, ...payload } = checkpoint;
  return payload;
}

function assertCheckpointPayload(candidate: { readonly [key: string]: JsonValue }): void {
  exactKeys(candidate, [
    'active_signing_key_id',
    'checkpoint_algorithm_suite',
    'checkpoint_id',
    'checkpoint_policy_version',
    'created_at',
    'data_class',
    'event_hash',
    'journal_algorithm_suite',
    'journal_epoch_id',
    'journal_id',
    'previous_anchor_receipt_digest',
    'previous_checkpoint_digest',
    'producer',
    'producer_generation',
    'schema_id',
    'schema_version',
    'sequence',
    'signing_keys',
    'transition',
  ]);
  if (
    candidate.schema_id !== CHECKPOINT_SCHEMA_IDS.checkpoint ||
    candidate.schema_version !== 1 ||
    candidate.producer !== 'dosai.checkpoint-signer' ||
    candidate.data_class !== 'D5' ||
    candidate.journal_algorithm_suite !== AUDIT_ALGORITHM_SUITE ||
    candidate.checkpoint_algorithm_suite !== CHECKPOINT_ALGORITHM_SUITE ||
    candidate.checkpoint_policy_version !== CHECKPOINT_POLICY_VERSION
  ) {
    fail();
  }
  assertUuid(stringField(candidate, 'checkpoint_id'));
  assertTimestamp(stringField(candidate, 'created_at'));
  assertSequence(stringField(candidate, 'producer_generation'));
  assertUuid(stringField(candidate, 'journal_id'));
  assertUuid(stringField(candidate, 'journal_epoch_id'));
  assertSequence(stringField(candidate, 'sequence'));
  assertDigest(candidate.event_hash as JsonValue);
  assertNullableDigest(candidate.previous_checkpoint_digest as JsonValue);
  assertNullableDigest(candidate.previous_anchor_receipt_digest as JsonValue);

  const activeKeyId = stringField(candidate, 'active_signing_key_id');
  if (!digestPattern.test(activeKeyId)) {
    fail();
  }
  const keyValues = candidate.signing_keys;
  if (!Array.isArray(keyValues) || keyValues.length < 1 || keyValues.length > 2) {
    fail();
  }
  const keyIds: string[] = [];
  for (const value of keyValues) {
    const key = objectValue(value);
    exactKeys(key, ['algorithm', 'key_id', 'protection', 'public_key_spki_der_base64']);
    const keyId = stringField(key, 'key_id');
    if (
      !digestPattern.test(keyId) ||
      key.algorithm !== 'ECDSA_P256_SHA256' ||
      !['SECURE_ENCLAVE', 'SOFTWARE_BACKED_TEST_ONLY'].includes(stringField(key, 'protection'))
    ) {
      fail();
    }
    assertP256PublicKey(stringField(key, 'public_key_spki_der_base64'), keyId);
    keyIds.push(keyId);
  }
  if (
    new Set(keyIds).size !== keyIds.length ||
    keyIds.some((keyId, index) => index > 0 && keyIds[index - 1]! > keyId) ||
    !keyIds.includes(activeKeyId)
  ) {
    fail();
  }

  const transition = objectValue(candidate.transition as JsonValue);
  exactKeys(transition, ['kind', 'previous_signing_key_id', 'reason_code']);
  const kind = stringField(transition, 'kind') as CheckpointTransitionKind;
  const previousKeyId = transition.previous_signing_key_id;
  const reason = stringField(transition, 'reason_code');
  if (!['GENESIS', 'CONTINUITY', 'ROTATION', 'RECOVERY'].includes(kind)) {
    fail();
  }
  if (previousKeyId !== null && (typeof previousKeyId !== 'string' || !digestPattern.test(previousKeyId))) {
    fail();
  }
  if (kind === 'GENESIS') {
    if (
      candidate.previous_checkpoint_digest !== null ||
      previousKeyId !== null ||
      reason !== 'INITIAL_INSTALL' ||
      keyIds.length !== 1
    ) {
      fail();
    }
  } else if (kind === 'CONTINUITY') {
    if (
      candidate.previous_checkpoint_digest === null ||
      previousKeyId !== activeKeyId ||
      !['PERIODIC', 'EFFECT_CRITICAL'].includes(reason) ||
      keyIds.length !== 1
    ) {
      fail();
    }
  } else if (kind === 'ROTATION') {
    if (
      candidate.previous_checkpoint_digest === null ||
      typeof previousKeyId !== 'string' ||
      previousKeyId === activeKeyId ||
      reason !== 'OWNER_ROTATION' ||
      keyIds.length !== 2 ||
      !keyIds.includes(previousKeyId)
    ) {
      fail();
    }
  } else if (
    candidate.previous_checkpoint_digest === null ||
    typeof previousKeyId !== 'string' ||
    previousKeyId === activeKeyId ||
    !['KEY_LOSS', 'HARDWARE_MIGRATION', 'PLATFORM_UNAVAILABLE'].includes(reason) ||
    keyIds.length !== 1
  ) {
    fail();
  }
}

export function admitAuditCheckpointPayload(value: unknown): AuditCheckpointPayload {
  const candidate = admit(value);
  assertCheckpointPayload(candidate);
  return candidate as AuditCheckpointPayload;
}

export function admitAuditCheckpoint(value: unknown): AuditCheckpoint {
  const candidate = admit(value);
  exactKeys(candidate, [
    ...Object.keys(admitAuditCheckpointPayload(
      Object.fromEntries(Object.entries(candidate).filter(([key]) => key !== 'signatures')),
    )),
    'signatures',
  ]);
  const payload = admitAuditCheckpointPayload(
    Object.fromEntries(Object.entries(candidate).filter(([key]) => key !== 'signatures')),
  );
  const signatureValues = candidate.signatures;
  if (!Array.isArray(signatureValues) || signatureValues.length < 1 || signatureValues.length > 2) {
    return fail();
  }
  const signatures: CheckpointSignature[] = [];
  for (const value of signatureValues) {
    const signature = objectValue(value);
    exactKeys(signature, ['format', 'key_id', 'value_base64']);
    const keyId = stringField(signature, 'key_id');
    if (!digestPattern.test(keyId) || signature.format !== 'ASN1_DER') {
      return fail();
    }
    assertDerSignature(stringField(signature, 'value_base64'));
    signatures.push(signature as CheckpointSignature);
  }
  const requiredKeyIds = payload.transition.kind === 'ROTATION'
    ? payload.signing_keys.map(({ key_id }) => key_id)
    : [payload.active_signing_key_id];
  if (
    signatures.length !== requiredKeyIds.length ||
    signatures.some(({ key_id }, index) => key_id !== requiredKeyIds[index])
  ) {
    return fail();
  }
  return candidate as AuditCheckpoint;
}

export function auditCheckpointSigningBytes(value: AuditCheckpoint | AuditCheckpointPayload): Buffer {
  const payload = 'signatures' in value
    ? admitAuditCheckpointPayload(checkpointPayloadObject(admitAuditCheckpoint(value)))
    : admitAuditCheckpointPayload(value);
  return Buffer.concat([
    CHECKPOINT_HASH_DOMAIN,
    Buffer.from(canonicalAuditJson(payload as unknown as JsonValue), 'utf8'),
  ]);
}

export function auditCheckpointDigest(value: AuditCheckpoint | AuditCheckpointPayload): Digest {
  return Object.freeze({
    algorithm: 'SHA-256',
    value: createHash('sha256').update(auditCheckpointSigningBytes(value)).digest('hex'),
  });
}

export function verifyAuditCheckpoint(value: unknown): AuditCheckpoint {
  const checkpoint = admitAuditCheckpoint(value);
  const signingBytes = auditCheckpointSigningBytes(checkpoint);
  const keys = new Map(checkpoint.signing_keys.map((key) => [
    key.key_id,
    assertP256PublicKey(key.public_key_spki_der_base64, key.key_id),
  ]));
  for (const signature of checkpoint.signatures) {
    const key = keys.get(signature.key_id);
    if (
      key === undefined ||
      !verifySignature('sha256', signingBytes, key, assertDerSignature(signature.value_base64))
    ) {
      return fail();
    }
  }
  return checkpoint;
}

export function admitAuditAnchorReceipt(value: unknown): AuditAnchorReceipt {
  const receipt = admit(value);
  exactKeys(receipt, [
    'assurance',
    'backend',
    'canonicalized_body_base64',
    'checkpoint_digest',
    'checkpoint_envelope',
    'created_at',
    'data_class',
    'inclusion_hashes_base64',
    'log_index',
    'log_key_id_base64',
    'log_origin',
    'previous_anchor_receipt_digest',
    'producer',
    'producer_generation',
    'receipt_id',
    'schema_id',
    'schema_version',
    'signing_config_digest',
    'tree_size',
    'trusted_root_digest',
  ]);
  if (
    receipt.schema_id !== CHECKPOINT_SCHEMA_IDS.receipt ||
    receipt.schema_version !== 1 ||
    receipt.producer !== 'dosai.anchor-verifier' ||
    receipt.data_class !== 'D5' ||
    receipt.backend !== 'SIGSTORE_REKOR_V2' ||
    receipt.assurance !== 'INCLUSION_PROOF_VERIFIED_NO_TRUSTED_TIME'
  ) {
    return fail();
  }
  if (!digestPattern.test(stringField(receipt, 'receipt_id'))) {
    return fail();
  }
  assertTimestamp(stringField(receipt, 'created_at'));
  assertSequence(stringField(receipt, 'producer_generation'));
  assertDigest(receipt.checkpoint_digest as JsonValue);
  assertNullableDigest(receipt.previous_anchor_receipt_digest as JsonValue);
  assertDigest(receipt.trusted_root_digest as JsonValue);
  assertDigest(receipt.signing_config_digest as JsonValue);
  const origin = stringField(receipt, 'log_origin');
  if (origin.length < 1 || origin.length > 512 || /[\u0000-\u001f\u007f]/.test(origin)) {
    return fail();
  }
  if (decodeCanonicalBase64(stringField(receipt, 'log_key_id_base64'), 32, 32).byteLength !== 32) {
    return fail();
  }
  assertSequence(stringField(receipt, 'log_index'));
  assertSequence(stringField(receipt, 'tree_size'));
  decodeCanonicalBase64(stringField(receipt, 'canonicalized_body_base64'), 1, 6_144);
  const proof = receipt.inclusion_hashes_base64;
  if (!Array.isArray(proof) || proof.length > 64) {
    return fail();
  }
  for (const hash of proof) {
    if (typeof hash !== 'string') {
      return fail();
    }
    decodeCanonicalBase64(hash, 32, 32);
  }
  const envelope = stringField(receipt, 'checkpoint_envelope');
  if (envelope.length < 1 || envelope.length > 16_384) {
    return fail();
  }
  if (receiptIdentityValue(receipt as unknown as AuditAnchorReceipt) !== receipt.receipt_id) {
    return fail();
  }
  return receipt as AuditAnchorReceipt;
}

function receiptIdentityValue(receipt: AuditAnchorReceipt): string {
  const {
    receipt_id: _receiptId,
    created_at: _createdAt,
    producer: _producer,
    producer_generation: _producerGeneration,
    data_class: _dataClass,
    ...evidence
  } = receipt;
  return createHash('sha256')
    .update(RECEIPT_HASH_DOMAIN)
    .update(canonicalAuditJson(evidence as unknown as JsonValue))
    .digest('hex');
}

export function createAuditAnchorReceipt(value: AuditAnchorReceiptWithoutId): AuditAnchorReceipt {
  const candidate = admit({ ...value, receipt_id: '0'.repeat(64) });
  const receiptId = receiptIdentityValue(candidate as unknown as AuditAnchorReceipt);
  return admitAuditAnchorReceipt({ ...candidate, receipt_id: receiptId });
}

export function auditAnchorReceiptDigest(value: unknown): Digest {
  const receipt = admitAuditAnchorReceipt(value);
  return Object.freeze({
    algorithm: 'SHA-256',
    value: receipt.receipt_id,
  });
}
