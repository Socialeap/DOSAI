import assert from 'node:assert/strict';
import test from 'node:test';

import * as rekorModule from '../../native-helpers/audit/rekor-v2.ts';
import {
  RekorV2Failure,
  buildRekorV2CreateEntry,
  verifyRekorV2CreateEntryResponse,
  verifyStoredRekorV2Receipt,
} from '../../native-helpers/audit/rekor-v2.ts';
import { checkpointFixture, receiptFixture } from '../support/p2-checkpoint-fixtures.mjs';

function failure(code) {
  return (error) => {
    assert.ok(error instanceof RekorV2Failure);
    assert.equal(error.code, code);
    return true;
  };
}

function verify(checkpoint, response, trust) {
  return verifyRekorV2CreateEntryResponse({
    checkpoint,
    response,
    trust,
    producerGeneration: '1',
  });
}

test('Rekor module is pure and exposes no network or submission operation', () => {
  assert.deepEqual(Object.keys(rekorModule).sort(), [
    'RekorV2Failure',
    'buildRekorV2CreateEntry',
    'verifyRekorV2CreateEntryResponse',
    'verifyStoredRekorV2Receipt',
  ]);
});

test('create-entry request contains only checkpoint digest, active signature, and public key', async () => {
  const { checkpoint } = await checkpointFixture();
  const request = buildRekorV2CreateEntry(checkpoint);
  assert.deepEqual(Object.keys(request), ['hashedRekordRequestV002']);
  assert.deepEqual(Object.keys(request.hashedRekordRequestV002).sort(), ['digest', 'signature']);
  assert.deepEqual(
    Object.keys(request.hashedRekordRequestV002.signature.verifier).sort(),
    ['keyDetails', 'publicKey'],
  );
  assert.equal(request.hashedRekordRequestV002.signature.verifier.keyDetails, 'PKIX_ECDSA_P256_SHA_256');
  const serialized = JSON.stringify(request);
  for (const prohibited of ['journal_id', 'journal_epoch_id', 'event_hash', 'payload', 'secret', 'token']) {
    assert.equal(serialized.includes(prohibited), false, prohibited);
  }
});

test('verified response and stored receipt pass offline under pinned trust material', async () => {
  const { checkpoint } = await checkpointFixture();
  const { receipt, response, trust } = await receiptFixture(checkpoint);
  const repeated = verify(checkpoint, structuredClone(response), trust);
  assert.equal(repeated.receipt_id, receipt.receipt_id);
  assert.equal(repeated.checkpoint_digest.value, receipt.checkpoint_digest.value);
  assert.equal(repeated.log_index, '0');
  assert.equal(repeated.tree_size, '2');
  assert.equal(repeated.assurance, 'INCLUSION_PROOF_VERIFIED_NO_TRUSTED_TIME');
  assert.deepEqual(verifyStoredRekorV2Receipt(checkpoint, receipt, trust), receipt);
});

test('body, kind, log identity, integrated time, and response shape substitutions fail', async () => {
  const { checkpoint } = await checkpointFixture();
  const { response, trust } = await receiptFixture(checkpoint);
  const cases = [
    ['DOSAI_REKOR_BODY_0001', (value) => {
      const body = JSON.parse(Buffer.from(value.canonicalizedBody, 'base64').toString('utf8'));
      body.spec.hashedRekordV002.data.digest = Buffer.alloc(32, 7).toString('base64');
      value.canonicalizedBody = Buffer.from(JSON.stringify(body)).toString('base64');
    }],
    ['DOSAI_REKOR_RESPONSE_0001', (value) => { value.kindVersion.version = '0.0.3'; }],
    ['DOSAI_REKOR_TRUST_0001', (value) => { value.logId.keyId = Buffer.alloc(32, 8).toString('base64'); }],
    ['DOSAI_REKOR_RESPONSE_0001', (value) => { value.integratedTime = '1'; }],
    ['DOSAI_REKOR_RESPONSE_0001', (value) => { value.unexpected = true; }],
  ];
  for (const [code, mutate] of cases) {
    const candidate = structuredClone(response);
    mutate(candidate);
    assert.throws(() => verify(checkpoint, candidate, trust), failure(code));
  }
});

test('Merkle index, path, root, tree size, and signed checkpoint tampering fail', async () => {
  const { checkpoint } = await checkpointFixture();
  const { response, trust } = await receiptFixture(checkpoint);
  const cases = [
    (value) => { value.logIndex = '1'; },
    (value) => { value.inclusionProof.logIndex = '1'; },
    (value) => { value.inclusionProof.treeSize = '3'; },
    (value) => { value.inclusionProof.rootHash = Buffer.alloc(32, 1).toString('base64'); },
    (value) => { value.inclusionProof.hashes[0] = Buffer.alloc(32, 2).toString('base64'); },
    (value) => {
      value.inclusionProof.checkpoint.envelope = value.inclusionProof.checkpoint.envelope.replace('\n2\n', '\n3\n');
    },
    (value) => {
      const envelope = value.inclusionProof.checkpoint.envelope;
      const marker = '\n\u2014 ';
      const index = envelope.lastIndexOf(marker);
      const line = envelope.slice(index + marker.length, -1);
      const split = line.indexOf(' ');
      const blob = Buffer.from(line.slice(split + 1), 'base64');
      blob[blob.length - 1] ^= 1;
      value.inclusionProof.checkpoint.envelope = `${envelope.slice(0, index + marker.length)}${line.slice(0, split)} ${blob.toString('base64')}\n`;
    },
  ];
  for (const mutate of cases) {
    const candidate = structuredClone(response);
    mutate(candidate);
    assert.throws(
      () => verify(checkpoint, candidate, trust),
      (error) => error instanceof RekorV2Failure,
    );
  }
});

test('unknown signatures are ignored but an invalid selected-key signature rejects the note', async () => {
  const { checkpoint } = await checkpointFixture();
  const { response, trust } = await receiptFixture(checkpoint);
  const withUnknown = structuredClone(response);
  const envelope = withUnknown.inclusionProof.checkpoint.envelope;
  const marker = '\n\u2014 ';
  const index = envelope.lastIndexOf(marker);
  withUnknown.inclusionProof.checkpoint.envelope =
    `${envelope.slice(0, index + 1)}\u2014 unknown.example/key ${Buffer.alloc(12, 4).toString('base64')}\n${envelope.slice(index + 1)}`;
  assert.doesNotThrow(() => verify(checkpoint, withUnknown, trust));

  const invalidKnown = structuredClone(response);
  const invalidKnownBlob = Buffer.concat([
    Buffer.from(trust.checkpointKeyIdBase64, 'base64').subarray(0, 4),
    Buffer.alloc(8, 4),
  ]);
  invalidKnown.inclusionProof.checkpoint.envelope =
    `${envelope.slice(0, index + 1)}\u2014 ${trust.checkpointKeyName} ${invalidKnownBlob.toString('base64')}\n${envelope.slice(index + 1)}`;
  assert.throws(
    () => verify(checkpoint, invalidKnown, trust),
    failure('DOSAI_REKOR_CHECKPOINT_0001'),
  );
});

test('receipt replay and trust substitution do not advance a different checkpoint', async () => {
  const { checkpoint: first } = await checkpointFixture();
  const { checkpoint: second } = await checkpointFixture({
    checkpoint_id: '80f8573f-f1a4-4c08-aa64-75e727bd52fe',
    event_hash: { algorithm: 'SHA-256', value: 'e'.repeat(64) },
  });
  const { receipt, trust } = await receiptFixture(first);
  assert.throws(
    () => verifyStoredRekorV2Receipt(second, receipt, trust),
    failure('DOSAI_REKOR_TRUST_0001'),
  );
  assert.throws(
    () => verifyStoredRekorV2Receipt(first, receipt, {
      ...trust,
      signingConfigDigest: { algorithm: 'SHA-256', value: 'f'.repeat(64) },
    }),
    failure('DOSAI_REKOR_TRUST_0001'),
  );
});

test('response admission rejects accessors without executing them', async () => {
  const { checkpoint } = await checkpointFixture();
  const { response, trust } = await receiptFixture(checkpoint);
  let getterCalls = 0;
  const hostile = { ...response };
  Object.defineProperty(hostile, 'canonicalizedBody', {
    enumerable: true,
    get() {
      getterCalls += 1;
      return response.canonicalizedBody;
    },
  });
  assert.throws(() => verify(checkpoint, hostile, trust), failure('DOSAI_REKOR_RESPONSE_0001'));
  assert.equal(getterCalls, 0);
});
