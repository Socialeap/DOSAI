import {
  createHash,
  createPublicKey,
  verify as verifySignature,
} from 'node:crypto';

import {
  admitAuditAnchorReceipt,
  auditCheckpointDigest,
  createAuditAnchorReceipt,
  verifyAuditCheckpoint,
  type AuditAnchorReceipt,
  type AuditCheckpoint,
  CHECKPOINT_SCHEMA_IDS,
} from './checkpoint-contracts.ts';
import { canonicalAuditJson, type Digest, type JsonValue } from './contracts.ts';

export type RekorV2FailureCode =
  | 'DOSAI_REKOR_BODY_0001'
  | 'DOSAI_REKOR_CHECKPOINT_0001'
  | 'DOSAI_REKOR_PROOF_0001'
  | 'DOSAI_REKOR_RESPONSE_0001'
  | 'DOSAI_REKOR_TRUST_0001';

export class RekorV2Failure extends Error {
  readonly code: RekorV2FailureCode;
  readonly assurance = 'BROKEN';

  constructor(code: RekorV2FailureCode) {
    super(code);
    this.name = 'RekorV2Failure';
    this.code = code;
  }
}

export type RekorV2PinnedTrustMaterial = Readonly<{
  logOrigin: string;
  checkpointKeyName: string;
  checkpointKeyIdBase64: string;
  checkpointPublicKeySpkiDerBase64: string;
  trustedRootDigest: Digest;
  signingConfigDigest: Digest;
}>;

type PlainValue = null | boolean | number | string | PlainValue[] | { [key: string]: PlainValue };

function fail(code: RekorV2FailureCode): never {
  throw new RekorV2Failure(code);
}

function clonePlain(value: unknown, depth = 0, budget = { remaining: 512 }): PlainValue {
  budget.remaining -= 1;
  if (depth > 12 || budget.remaining < 0) {
    return fail('DOSAI_REKOR_RESPONSE_0001');
  }
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    if (typeof value === 'string' && value.length > 32_768) {
      return fail('DOSAI_REKOR_RESPONSE_0001');
    }
    return value;
  }
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && !Object.is(value, -0)
      ? value
      : fail('DOSAI_REKOR_RESPONSE_0001');
  }
  if (Array.isArray(value)) {
    if (value.length > 64 || Object.keys(value).some((key, index) => key !== String(index))) {
      return fail('DOSAI_REKOR_RESPONSE_0001');
    }
    return value.map((_entry, index) => {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (descriptor === undefined || !descriptor.enumerable || !('value' in descriptor)) {
        return fail('DOSAI_REKOR_RESPONSE_0001');
      }
      return clonePlain(descriptor.value, depth + 1, budget);
    });
  }
  if (typeof value !== 'object') {
    return fail('DOSAI_REKOR_RESPONSE_0001');
  }
  const prototype = Object.getPrototypeOf(value);
  if ((prototype !== Object.prototype && prototype !== null) || Object.getOwnPropertySymbols(value).length !== 0) {
    return fail('DOSAI_REKOR_RESPONSE_0001');
  }
  const clone: Record<string, PlainValue> = Object.create(null);
  for (const key of Object.keys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !descriptor.enumerable || !('value' in descriptor)) {
      return fail('DOSAI_REKOR_RESPONSE_0001');
    }
    clone[key] = clonePlain(descriptor.value, depth + 1, budget);
  }
  return clone;
}

function record(value: PlainValue, code: RekorV2FailureCode): Record<string, PlainValue> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value
    : fail(code);
}

function exactKeys(value: Record<string, PlainValue>, expected: readonly string[], code: RekorV2FailureCode): void {
  const actual = Object.keys(value).sort();
  const sorted = [...expected].sort();
  if (actual.length !== sorted.length || actual.some((key, index) => key !== sorted[index])) {
    fail(code);
  }
}

function stringField(value: Record<string, PlainValue>, key: string, code: RekorV2FailureCode): string {
  return typeof value[key] === 'string' ? value[key] as string : fail(code);
}

function decodeBase64(value: string, minimum: number, maximum: number, code: RekorV2FailureCode): Buffer {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value)) {
    return fail(code);
  }
  const bytes = Buffer.from(value, 'base64');
  if (bytes.byteLength < minimum || bytes.byteLength > maximum || bytes.toString('base64') !== value) {
    return fail(code);
  }
  return bytes;
}

function assertDigest(value: Digest, code: RekorV2FailureCode): void {
  if (value.algorithm !== 'SHA-256' || !/^[0-9a-f]{64}$/.test(value.value)) {
    fail(code);
  }
}

function validateTrust(trust: RekorV2PinnedTrustMaterial) {
  if (
    !trust.logOrigin ||
    trust.logOrigin.length > 512 ||
    /[\u0000-\u001f\u007f]/.test(trust.logOrigin) ||
    !trust.checkpointKeyName ||
    /[\s+]/u.test(trust.checkpointKeyName)
  ) {
    return fail('DOSAI_REKOR_TRUST_0001');
  }
  assertDigest(trust.trustedRootDigest, 'DOSAI_REKOR_TRUST_0001');
  assertDigest(trust.signingConfigDigest, 'DOSAI_REKOR_TRUST_0001');
  const der = decodeBase64(
    trust.checkpointPublicKeySpkiDerBase64,
    44,
    1024,
    'DOSAI_REKOR_TRUST_0001',
  );
  const keyId = createHash('sha256').update(der).digest();
  if (keyId.toString('base64') !== trust.checkpointKeyIdBase64) {
    return fail('DOSAI_REKOR_TRUST_0001');
  }
  let publicKey;
  try {
    publicKey = createPublicKey({ key: der, format: 'der', type: 'spki' });
  } catch {
    return fail('DOSAI_REKOR_TRUST_0001');
  }
  if (
    publicKey.asymmetricKeyType !== 'ec' ||
    publicKey.asymmetricKeyDetails?.namedCurve !== 'prime256v1'
  ) {
    return fail('DOSAI_REKOR_TRUST_0001');
  }
  return { publicKey, keyId };
}

function activeSignature(checkpoint: AuditCheckpoint) {
  const signature = checkpoint.signatures.find(
    ({ key_id }) => key_id === checkpoint.active_signing_key_id,
  ) ?? fail('DOSAI_REKOR_BODY_0001');
  const key = checkpoint.signing_keys.find(
    ({ key_id }) => key_id === checkpoint.active_signing_key_id,
  ) ?? fail('DOSAI_REKOR_BODY_0001');
  return { key, signature };
}

function rekorCanonicalBody(checkpointValue: unknown): Record<string, JsonValue> {
  const checkpoint = verifyAuditCheckpoint(checkpointValue);
  const digest = auditCheckpointDigest(checkpoint);
  const { key, signature } = activeSignature(checkpoint);
  return {
    apiVersion: '0.0.2',
    kind: 'hashedrekord',
    spec: {
      hashedRekordV002: {
        data: {
          algorithm: 'SHA2_256',
          digest: Buffer.from(digest.value, 'hex').toString('base64'),
        },
        signature: {
          content: signature.value_base64,
          verifier: {
            keyDetails: 'PKIX_ECDSA_P256_SHA_256',
            publicKey: { rawBytes: key.public_key_spki_der_base64 },
          },
        },
      },
    },
  };
}

export function buildRekorV2CreateEntry(checkpointValue: unknown): Readonly<Record<string, JsonValue>> {
  const checkpoint = verifyAuditCheckpoint(checkpointValue);
  const digest = auditCheckpointDigest(checkpoint);
  const { key, signature } = activeSignature(checkpoint);
  return Object.freeze({
    hashedRekordRequestV002: Object.freeze({
      digest: Buffer.from(digest.value, 'hex').toString('base64'),
      signature: Object.freeze({
        content: signature.value_base64,
        verifier: Object.freeze({
          keyDetails: 'PKIX_ECDSA_P256_SHA_256',
          publicKey: Object.freeze({ rawBytes: key.public_key_spki_der_base64 }),
        }),
      }),
    }),
  });
}

function hashLeaf(body: Uint8Array): Buffer {
  return createHash('sha256').update(Buffer.from([0])).update(body).digest();
}

function hashNode(left: Uint8Array, right: Uint8Array): Buffer {
  return createHash('sha256').update(Buffer.from([1])).update(left).update(right).digest();
}

function inclusionRoot(leaf: Buffer, index: bigint, size: bigint, proof: readonly Buffer[]): Buffer {
  if (size < 1n || index < 0n || index >= size) {
    return fail('DOSAI_REKOR_PROOF_0001');
  }
  let node = leaf;
  let leafIndex = index;
  let lastNode = size - 1n;
  for (const sibling of proof) {
    if (lastNode === 0n) {
      return fail('DOSAI_REKOR_PROOF_0001');
    }
    if ((leafIndex & 1n) === 1n || leafIndex === lastNode) {
      node = hashNode(sibling, node);
      while ((leafIndex & 1n) === 0n && leafIndex !== 0n) {
        leafIndex >>= 1n;
        lastNode >>= 1n;
      }
    } else {
      node = hashNode(node, sibling);
    }
    leafIndex >>= 1n;
    lastNode >>= 1n;
  }
  return lastNode === 0n ? node : fail('DOSAI_REKOR_PROOF_0001');
}

function parseAndVerifyCheckpointEnvelope(
  envelope: string,
  trust: RekorV2PinnedTrustMaterial,
): Readonly<{ treeSize: bigint; rootHash: Buffer }> {
  if (envelope.length < 1 || envelope.length > 16_384 || /[\u0000-\u0009\u000b-\u001f\u007f]/.test(envelope)) {
    return fail('DOSAI_REKOR_CHECKPOINT_0001');
  }
  const separator = envelope.lastIndexOf('\n\n');
  if (separator < 0 || !envelope.endsWith('\n')) {
    return fail('DOSAI_REKOR_CHECKPOINT_0001');
  }
  const noteText = envelope.slice(0, separator + 1);
  const signatureLines = envelope.slice(separator + 2, -1).split('\n');
  const lines = noteText.slice(0, -1).split('\n');
  if (
    lines.length < 3 ||
    lines.some((line) => line.length === 0) ||
    lines[0] !== trust.logOrigin ||
    !/^(0|[1-9][0-9]{0,31})$/.test(lines[1] ?? '') ||
    signatureLines.length < 1 ||
    signatureLines.length > 16
  ) {
    return fail('DOSAI_REKOR_CHECKPOINT_0001');
  }
  const treeSize = BigInt(lines[1]!);
  const rootHash = decodeBase64(lines[2]!, 32, 32, 'DOSAI_REKOR_CHECKPOINT_0001');
  const { publicKey, keyId } = validateTrust(trust);
  let verifiedKnownSignature = false;
  for (const line of signatureLines) {
    if (!line.startsWith('\u2014 ')) {
      return fail('DOSAI_REKOR_CHECKPOINT_0001');
    }
    const split = line.indexOf(' ', 2);
    if (split < 3) {
      return fail('DOSAI_REKOR_CHECKPOINT_0001');
    }
    const keyName = line.slice(2, split);
    const signatureBlob = decodeBase64(
      line.slice(split + 1),
      5,
      8_192,
      'DOSAI_REKOR_CHECKPOINT_0001',
    );
    if (keyName !== trust.checkpointKeyName || !signatureBlob.subarray(0, 4).equals(keyId.subarray(0, 4))) {
      continue;
    }
    const signature = signatureBlob.subarray(4);
    if (!verifySignature('sha256', Buffer.from(noteText, 'utf8'), publicKey, signature)) {
      return fail('DOSAI_REKOR_CHECKPOINT_0001');
    }
    verifiedKnownSignature = true;
  }
  return verifiedKnownSignature
    ? Object.freeze({ treeSize, rootHash })
    : fail('DOSAI_REKOR_CHECKPOINT_0001');
}

function verifyBundle(
  checkpointValue: unknown,
  bundleValue: unknown,
  trust: RekorV2PinnedTrustMaterial,
): Readonly<{
  checkpoint: AuditCheckpoint;
  logIndex: bigint;
  treeSize: bigint;
  bodyBase64: string;
  proofBase64: readonly string[];
  envelope: string;
}> {
  validateTrust(trust);
  const checkpoint = verifyAuditCheckpoint(checkpointValue);
  const response = record(clonePlain(bundleValue), 'DOSAI_REKOR_RESPONSE_0001');
  exactKeys(response, [
    'canonicalizedBody',
    'inclusionPromise',
    'inclusionProof',
    'integratedTime',
    'kindVersion',
    'logId',
    'logIndex',
  ], 'DOSAI_REKOR_RESPONSE_0001');
  if (response.integratedTime !== '0' || response.inclusionPromise !== null) {
    return fail('DOSAI_REKOR_RESPONSE_0001');
  }
  const logIndexText = stringField(response, 'logIndex', 'DOSAI_REKOR_RESPONSE_0001');
  if (!/^(0|[1-9][0-9]{0,31})$/.test(logIndexText)) {
    return fail('DOSAI_REKOR_RESPONSE_0001');
  }
  const logIndex = BigInt(logIndexText);
  const logId = record(response.logId as PlainValue, 'DOSAI_REKOR_RESPONSE_0001');
  exactKeys(logId, ['keyId'], 'DOSAI_REKOR_RESPONSE_0001');
  if (stringField(logId, 'keyId', 'DOSAI_REKOR_RESPONSE_0001') !== trust.checkpointKeyIdBase64) {
    return fail('DOSAI_REKOR_TRUST_0001');
  }
  const kindVersion = record(response.kindVersion as PlainValue, 'DOSAI_REKOR_RESPONSE_0001');
  exactKeys(kindVersion, ['kind', 'version'], 'DOSAI_REKOR_RESPONSE_0001');
  if (kindVersion.kind !== 'hashedrekord' || kindVersion.version !== '0.0.2') {
    return fail('DOSAI_REKOR_RESPONSE_0001');
  }

  const bodyBase64 = stringField(response, 'canonicalizedBody', 'DOSAI_REKOR_RESPONSE_0001');
  const body = decodeBase64(bodyBase64, 1, 6_144, 'DOSAI_REKOR_BODY_0001');
  const expectedBody = Buffer.from(
    canonicalAuditJson(rekorCanonicalBody(checkpoint) as unknown as JsonValue),
    'utf8',
  );
  if (!body.equals(expectedBody)) {
    return fail('DOSAI_REKOR_BODY_0001');
  }

  const proof = record(response.inclusionProof as PlainValue, 'DOSAI_REKOR_RESPONSE_0001');
  exactKeys(proof, ['checkpoint', 'hashes', 'logIndex', 'rootHash', 'treeSize'], 'DOSAI_REKOR_RESPONSE_0001');
  if (proof.logIndex !== logIndexText) {
    return fail('DOSAI_REKOR_PROOF_0001');
  }
  const proofHashesValue = proof.hashes;
  if (!Array.isArray(proofHashesValue) || proofHashesValue.length > 64) {
    return fail('DOSAI_REKOR_PROOF_0001');
  }
  const proofBase64 = proofHashesValue.map((value) =>
    typeof value === 'string' ? value : fail('DOSAI_REKOR_PROOF_0001'));
  const proofHashes = proofBase64.map((value) =>
    decodeBase64(value, 32, 32, 'DOSAI_REKOR_PROOF_0001'));
  const checkpointEnvelope = record(proof.checkpoint as PlainValue, 'DOSAI_REKOR_RESPONSE_0001');
  exactKeys(checkpointEnvelope, ['envelope'], 'DOSAI_REKOR_RESPONSE_0001');
  const envelope = stringField(checkpointEnvelope, 'envelope', 'DOSAI_REKOR_RESPONSE_0001');
  const tree = parseAndVerifyCheckpointEnvelope(envelope, trust);
  if (
    proof.treeSize !== tree.treeSize.toString() ||
    stringField(proof, 'rootHash', 'DOSAI_REKOR_PROOF_0001') !== tree.rootHash.toString('base64') ||
    !inclusionRoot(hashLeaf(body), logIndex, tree.treeSize, proofHashes).equals(tree.rootHash)
  ) {
    return fail('DOSAI_REKOR_PROOF_0001');
  }
  return Object.freeze({
    checkpoint,
    logIndex,
    treeSize: tree.treeSize,
    bodyBase64,
    proofBase64: Object.freeze(proofBase64),
    envelope,
  });
}

export function verifyRekorV2CreateEntryResponse(input: Readonly<{
  checkpoint: AuditCheckpoint;
  response: unknown;
  trust: RekorV2PinnedTrustMaterial;
  producerGeneration: string;
}>): AuditAnchorReceipt {
  if (!/^[1-9][0-9]{0,31}$/.test(input.producerGeneration)) {
    return fail('DOSAI_REKOR_RESPONSE_0001');
  }
  const verified = verifyBundle(input.checkpoint, input.response, input.trust);
  return createAuditAnchorReceipt({
    schema_id: CHECKPOINT_SCHEMA_IDS.receipt,
    schema_version: 1,
    created_at: new Date().toISOString(),
    producer: 'dosai.anchor-verifier',
    producer_generation: input.producerGeneration,
    data_class: 'D5',
    backend: 'SIGSTORE_REKOR_V2',
    checkpoint_digest: auditCheckpointDigest(verified.checkpoint),
    previous_anchor_receipt_digest: verified.checkpoint.previous_anchor_receipt_digest,
    trusted_root_digest: input.trust.trustedRootDigest,
    signing_config_digest: input.trust.signingConfigDigest,
    log_origin: input.trust.logOrigin,
    log_key_id_base64: input.trust.checkpointKeyIdBase64,
    log_index: verified.logIndex.toString(),
    tree_size: verified.treeSize.toString(),
    canonicalized_body_base64: verified.bodyBase64,
    inclusion_hashes_base64: verified.proofBase64,
    checkpoint_envelope: verified.envelope,
    assurance: 'INCLUSION_PROOF_VERIFIED_NO_TRUSTED_TIME',
  });
}

export function verifyStoredRekorV2Receipt(
  checkpointValue: unknown,
  receiptValue: unknown,
  trust: RekorV2PinnedTrustMaterial,
): AuditAnchorReceipt {
  validateTrust(trust);
  const checkpoint = verifyAuditCheckpoint(checkpointValue);
  const receipt = admitAuditAnchorReceipt(receiptValue);
  const checkpointDigest = auditCheckpointDigest(checkpoint);
  if (
    receipt.backend !== 'SIGSTORE_REKOR_V2' ||
    receipt.checkpoint_digest.value !== checkpointDigest.value ||
    receipt.previous_anchor_receipt_digest?.value !== checkpoint.previous_anchor_receipt_digest?.value ||
    receipt.trusted_root_digest.value !== trust.trustedRootDigest.value ||
    receipt.signing_config_digest.value !== trust.signingConfigDigest.value ||
    receipt.log_origin !== trust.logOrigin ||
    receipt.log_key_id_base64 !== trust.checkpointKeyIdBase64
  ) {
    return fail('DOSAI_REKOR_TRUST_0001');
  }
  const body = decodeBase64(receipt.canonicalized_body_base64, 1, 6_144, 'DOSAI_REKOR_BODY_0001');
  const expectedBody = Buffer.from(
    canonicalAuditJson(rekorCanonicalBody(checkpoint) as unknown as JsonValue),
    'utf8',
  );
  if (!body.equals(expectedBody)) {
    return fail('DOSAI_REKOR_BODY_0001');
  }
  const tree = parseAndVerifyCheckpointEnvelope(receipt.checkpoint_envelope, trust);
  const logIndex = BigInt(receipt.log_index);
  const proof = receipt.inclusion_hashes_base64.map((value) =>
    decodeBase64(value, 32, 32, 'DOSAI_REKOR_PROOF_0001'));
  if (
    tree.treeSize.toString() !== receipt.tree_size ||
    !inclusionRoot(hashLeaf(body), logIndex, tree.treeSize, proof).equals(tree.rootHash)
  ) {
    return fail('DOSAI_REKOR_PROOF_0001');
  }
  return receipt;
}
