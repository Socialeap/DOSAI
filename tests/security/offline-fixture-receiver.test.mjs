import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import { createOfflineReceiver } from '../fixtures/transport/offline-receiver.mjs';

const key = Buffer.alloc(32, 7);
const peer = Buffer.alloc(16, 8);
const session = Buffer.alloc(16, 9);
const defaultPayload = '{"action":"SUMMARIZE_FIXTURE"}';

function frame({ version = 1, direction = 1, sequence = 1, payload = defaultPayload,
                 peerId = peer, sessionId = session, signingKey = key } = {}) {
  const data = Buffer.from(payload);
  const header = Buffer.alloc(40);
  header[0] = version;
  header[1] = direction;
  peerId.copy(header, 2);
  sessionId.copy(header, 18);
  header.writeUInt32BE(sequence, 34);
  header.writeUInt16BE(data.length, 38);
  const body = Buffer.concat([header, data]);
  const tag = createHmac('sha256', signingKey)
    .update('DOSAI offline fixture proposal v1\0').update(body).digest();
  return Buffer.concat([body, tag]);
}

const receiver = (sessionId = session) => createOfflineReceiver({ key, peer, session: sessionId });

function receive(input, rx = receiver()) {
  const partial = rx.push(input);
  return partial.status === 'REJECTED' ? partial : rx.finish();
}

test('every split boundary returns only one untrusted proposal after finish', () => {
  const bytes = frame();
  for (let split = 0; split <= bytes.length; split++) {
    const rx = receiver();
    assert.deepEqual(rx.push(bytes.subarray(0, split)), { status: 'PENDING' });
    assert.deepEqual(rx.push(bytes.subarray(split)), { status: 'PENDING' });
    assert.deepEqual(rx.finish(), {
      status: 'PROPOSAL_FOR_LOCAL_REVIEW',
      proposal: { version: 1, action: 'SUMMARIZE_FIXTURE', fixture: 'beta-core-v1', generation: '1' },
    });
    assert.deepEqual(receive(bytes, rx), { status: 'REJECTED', reason: 'SESSION_CLOSED' });
  }
});

test('truncation, oversized length, unknown version and trailing bytes close the session', () => {
  const bytes = frame();
  const oversize = Buffer.from(bytes);
  oversize.writeUInt16BE(129, 38);
  for (const [input, reason] of [
    [bytes.subarray(0, 39), 'TRUNCATED'],
    [bytes.subarray(0, -1), 'TRUNCATED'],
    [oversize, 'INVALID_LENGTH'],
    [Buffer.alloc(201), 'INVALID_LENGTH'],
    [frame({ version: 2 }), 'UNSUPPORTED_VERSION'],
    [Buffer.concat([bytes, Buffer.from([0])]), 'TRAILING_BYTES'],
  ]) {
    const rx = receiver();
    assert.deepEqual(receive(input, rx), { status: 'REJECTED', reason });
    assert.equal(receive(bytes, rx).reason, 'SESSION_CLOSED');
  }
  const rx = receiver();
  assert.equal(rx.push(bytes).status, 'PENDING');
  assert.equal(rx.push(Buffer.from([0])).reason, 'TRAILING_BYTES');
});

test('authentication and peer, direction, session and sequence are checked before payload admission', () => {
  const badPayload = '{"approval":"DO_NOT_ECHO"}';
  for (const [options, reason] of [
    [{ signingKey: Buffer.alloc(32), sequence: 2 }, 'AUTHENTICATION_FAILED'],
    [{ peerId: Buffer.alloc(16) }, 'CONTEXT_MISMATCH'],
    [{ direction: 2 }, 'CONTEXT_MISMATCH'],
    [{ sessionId: Buffer.alloc(16) }, 'CONTEXT_MISMATCH'],
    [{ sequence: 2 }, 'INVALID_SEQUENCE'],
  ]) {
    assert.deepEqual(receive(frame({ payload: badPayload, ...options })), { status: 'REJECTED', reason });
  }
  assert.equal(receive(frame(), receiver(Buffer.alloc(16, 10))).reason, 'CONTEXT_MISMATCH');
});

test('even authenticated payloads cannot add authority, effects or arbitrary operations', () => {
  for (const field of ['approval', 'grant', 'command', 'path', 'unexpected']) {
    const payload = JSON.stringify({ action: 'SUMMARIZE_FIXTURE', [field]: 'DO_NOT_ECHO' });
    assert.deepEqual(receive(frame({ payload })), { status: 'REJECTED', reason: 'INVALID_PAYLOAD' });
  }
  assert.equal(receive(frame({ payload: '{"action":"RUN_SHELL"}' })).reason, 'INVALID_PAYLOAD');
  assert.equal(receive(frame({ payload: '{"action":"RUN_SHELL","action":"SUMMARIZE_FIXTURE"}' })).reason, 'INVALID_PAYLOAD');
});
