import {
  createHash,
  generateKeyPairSync,
  sign,
} from 'node:crypto';

import {
  CHECKPOINT_ALGORITHM_SUITE,
  CHECKPOINT_POLICY_VERSION,
  CHECKPOINT_SCHEMA_IDS,
  admitAuditCheckpointPayload,
  auditCheckpointDigest,
  auditCheckpointSigningBytes,
  verifyAuditCheckpoint,
} from '../../native-helpers/audit/checkpoint-contracts.ts';
import { canonicalAuditJson } from '../../native-helpers/audit/contracts.ts';
import {
  buildRekorV2CreateEntry,
  verifyRekorV2CreateEntryResponse,
} from '../../native-helpers/audit/rekor-v2.ts';

function keyRecord(publicKey, protection = 'SOFTWARE_BACKED_TEST_ONLY') {
  const der = publicKey.export({ format: 'der', type: 'spki' });
  return Object.freeze({
    key_id: createHash('sha256').update(der).digest('hex'),
    algorithm: 'ECDSA_P256_SHA256',
    protection,
    public_key_spki_der_base64: der.toString('base64'),
  });
}

function sha256Digest(label) {
  return Object.freeze({
    algorithm: 'SHA-256',
    value: createHash('sha256').update(label).digest('hex'),
  });
}

export async function checkpointFixture(overrides = {}) {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const key = keyRecord(publicKey);
  const payload = admitAuditCheckpointPayload({
    schema_id: CHECKPOINT_SCHEMA_IDS.checkpoint,
    schema_version: 1,
    checkpoint_id: '5ae8c73c-d15f-42e7-b9c2-62cc75721ef2',
    created_at: '2026-07-31T23:19:31.000Z',
    producer: 'dosai.checkpoint-signer',
    producer_generation: '1',
    data_class: 'D5',
    journal_algorithm_suite: 'DOSAI-JOURNAL-SHA256-JCS-V1',
    checkpoint_algorithm_suite: CHECKPOINT_ALGORITHM_SUITE,
    checkpoint_policy_version: CHECKPOINT_POLICY_VERSION,
    journal_id: '4721b470-9acc-44c5-acf7-e8c2b69f653a',
    journal_epoch_id: '910f940f-bbf1-4d11-9177-109456b3a1ae',
    sequence: '2',
    event_hash: sha256Digest('event-head'),
    previous_checkpoint_digest: null,
    previous_anchor_receipt_digest: null,
    transition: {
      kind: 'GENESIS',
      previous_signing_key_id: null,
      reason_code: 'INITIAL_INSTALL',
    },
    active_signing_key_id: key.key_id,
    signing_keys: [key],
    ...overrides,
  });
  const signature = sign('sha256', auditCheckpointSigningBytes(payload), privateKey);
  const checkpoint = verifyAuditCheckpoint({
    ...payload,
    signatures: [{
      key_id: key.key_id,
      format: 'ASN1_DER',
      value_base64: signature.toString('base64'),
    }],
  });
  return Object.freeze({ checkpoint, privateKey, publicKey });
}

function hashLeaf(bytes) {
  return createHash('sha256').update(Buffer.from([0])).update(bytes).digest();
}

function hashNode(left, right) {
  return createHash('sha256').update(Buffer.from([1])).update(left).update(right).digest();
}

export async function receiptFixture(checkpoint) {
  const request = buildRekorV2CreateEntry(checkpoint);
  const canonicalBody = {
    apiVersion: '0.0.2',
    kind: 'hashedrekord',
    spec: {
      hashedRekordV002: {
        data: {
          algorithm: 'SHA2_256',
          digest: request.hashedRekordRequestV002.digest,
        },
        signature: request.hashedRekordRequestV002.signature,
      },
    },
  };
  const body = Buffer.from(canonicalAuditJson(canonicalBody), 'utf8');
  const leaf = hashLeaf(body);
  const sibling = hashLeaf(Buffer.from('independent-synthetic-leaf', 'utf8'));
  const root = hashNode(leaf, sibling);

  const { privateKey: logPrivateKey, publicKey: logPublicKey } = generateKeyPairSync(
    'ec',
    { namedCurve: 'prime256v1' },
  );
  const logDer = logPublicKey.export({ format: 'der', type: 'spki' });
  const logKeyId = createHash('sha256').update(logDer).digest();
  const origin = 'rekor.synthetic.dosai.test/log-1';
  const noteText = `${origin}\n2\n${root.toString('base64')}\n`;
  const noteSignature = sign('sha256', Buffer.from(noteText, 'utf8'), logPrivateKey);
  const signatureBlob = Buffer.concat([logKeyId.subarray(0, 4), noteSignature]);
  const envelope = `${noteText}\n\u2014 ${origin} ${signatureBlob.toString('base64')}\n`;
  const response = {
    logIndex: '0',
    logId: { keyId: logKeyId.toString('base64') },
    kindVersion: { kind: 'hashedrekord', version: '0.0.2' },
    integratedTime: '0',
    inclusionPromise: null,
    inclusionProof: {
      logIndex: '0',
      rootHash: root.toString('base64'),
      treeSize: '2',
      hashes: [sibling.toString('base64')],
      checkpoint: { envelope },
    },
    canonicalizedBody: body.toString('base64'),
  };
  const trust = Object.freeze({
    logOrigin: origin,
    checkpointKeyName: origin,
    checkpointKeyIdBase64: logKeyId.toString('base64'),
    checkpointPublicKeySpkiDerBase64: logDer.toString('base64'),
    trustedRootDigest: sha256Digest('tuf-trusted-root'),
    signingConfigDigest: sha256Digest('tuf-signing-config'),
  });
  const receipt = verifyRekorV2CreateEntryResponse({
    checkpoint,
    response,
    trust,
    producerGeneration: '1',
  });
  assertCheckpointBinding(checkpoint, receipt);
  return Object.freeze({
    receipt,
    response,
    trust,
    logPrivateKey,
    logPublicKey,
    body,
    sibling,
  });
}

function assertCheckpointBinding(checkpoint, receipt) {
  if (receipt.checkpoint_digest.value !== auditCheckpointDigest(checkpoint).value) {
    throw new Error('FIXTURE_BINDING_FAILED');
  }
}
