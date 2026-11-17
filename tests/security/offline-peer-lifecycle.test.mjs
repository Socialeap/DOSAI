import assert from 'node:assert/strict';
import test from 'node:test';
import { createOfflinePeerLifecycle } from '../fixtures/transport/offline-peer-lifecycle.mjs';

const rejected = { status: 'REJECTED' };
const localApprovalRequired = { status: 'LOCAL_APPROVAL_REQUIRED' };
const payload = '{"action":"SUMMARIZE_FIXTURE"}';
const proposal = {
  status: 'PROPOSAL_FOR_LOCAL_REVIEW',
  proposal: { action: 'SUMMARIZE_FIXTURE' },
};

function setup() {
  let tick = 0;
  return {
    startProcess: (processGeneration = 1) => createOfflinePeerLifecycle({
      processGeneration,
      now: () => tick,
    }),
    advance: (ticks) => { tick += ticks; },
  };
}

function handshake(pairing, overrides = {}) {
  return {
    ...pairing,
    session: `${pairing.runId}/session`,
    senderProof: true,
    receiverProof: true,
    ...overrides,
  };
}

function request(pairing, overrides = {}) {
  return {
    session: `${pairing.runId}/session`,
    direction: 'M1_TO_M4',
    sequence: 1,
    payload,
    ...overrides,
  };
}

function open(lifecycle) {
  const { status, pairing } = lifecycle.begin();
  assert.equal(status, 'PAIRING');
  return pairing;
}

function confirmBoth(lifecycle, pairing) {
  assert.deepEqual(lifecycle.confirmOnReceiver(pairing), { status: 'AWAITING_PEER_CONFIRMATION' });
  assert.deepEqual(lifecycle.confirmOnSender(pairing), { status: 'AWAITING_HANDSHAKE' });
}

function bind(lifecycle) {
  const pairing = open(lifecycle);
  confirmBoth(lifecycle, pairing);
  assert.deepEqual(lifecycle.authenticate(handshake(pairing)), { status: 'AWAITING_PROPOSAL' });
  return pairing;
}

test('the confirmed pair can submit one proposal and review still requires local approval', () => {
  const lifecycle = setup().startProcess();
  const pairing = bind(lifecycle);
  assert.deepEqual(lifecycle.checkLocalReview(pairing.runId), rejected);
  assert.deepEqual(lifecycle.admit(request(pairing)), proposal);
  assert.deepEqual(lifecycle.admit(request(pairing)), rejected);
  assert.deepEqual(lifecycle.authenticate(handshake(pairing)), rejected);
  assert.deepEqual(lifecycle.checkLocalReview(pairing.runId), localApprovalRequired);
});

test('both local confirmations must bind the exact one-run pairing', () => {
  for (const first of ['confirmOnSender', 'confirmOnReceiver']) {
    const lifecycle = setup().startProcess();
    const pairing = open(lifecycle);
    assert.deepEqual(lifecycle[first](pairing), { status: 'AWAITING_PEER_CONFIRMATION' });
    assert.deepEqual(lifecycle.authenticate(handshake(pairing)), rejected);
    assert.deepEqual(lifecycle.admit(request(pairing)), rejected);
  }

  for (const override of [
    { senderFingerprint: 'synthetic-other-mac' },
    { receiverFingerprint: 'synthetic-other-mac' },
    { senderRole: 'RECEIVER', receiverRole: 'SENDER' },
    { version: 2 },
    { action: 'ANOTHER_FIXTURE' },
  ]) {
    const lifecycle = setup().startProcess();
    const pairing = open(lifecycle);
    assert.deepEqual(lifecycle.confirmOnSender({ ...pairing, ...override }), rejected);
    assert.deepEqual(lifecycle.confirmOnReceiver(pairing), rejected);
  }
});

test('replayed consent and mismatched modeled handshake evidence close the ceremony', () => {
  const lifecycle = setup().startProcess();
  const pairing = open(lifecycle);
  assert.equal(lifecycle.confirmOnSender(pairing).status, 'AWAITING_PEER_CONFIRMATION');
  assert.deepEqual(lifecycle.confirmOnSender(pairing), rejected);
  assert.deepEqual(lifecycle.confirmOnReceiver(pairing), rejected);

  const armed = open(lifecycle);
  confirmBoth(lifecycle, armed);
  assert.deepEqual(lifecycle.confirmOnSender(armed), rejected);
  assert.deepEqual(lifecycle.authenticate(handshake(armed)), rejected);

  for (const override of [
    { senderProof: false },
    { receiverProof: false },
    { senderFingerprint: 'synthetic-other-mac' },
    { receiverRole: 'SENDER' },
    { version: 0 },
    { session: 'synthetic-stale-session' },
  ]) {
    const attempt = setup().startProcess();
    const currentPairing = open(attempt);
    confirmBoth(attempt, currentPairing);
    assert.deepEqual(attempt.authenticate(handshake(currentPairing, override)), rejected);
    assert.deepEqual(attempt.authenticate(handshake(currentPairing)), rejected);
    assert.deepEqual(attempt.admit(request(currentPairing)), rejected);
  }
});

test('stale, reordered or authority-bearing proposals cannot produce a review', () => {
  for (const override of [
    { session: 'synthetic-stale-session' },
    { direction: 'M4_TO_M1' },
    { sequence: 2 },
    { approval: true },
    { grant: 'synthetic-grant' },
    { payload: '{"action":"SUMMARIZE_FIXTURE","approval":true}' },
    { payload: '{"action":"SUMMARIZE_FIXTURE","path":"/synthetic"}' },
    { payload: '{"action":"ANOTHER_FIXTURE"}' },
  ]) {
    const lifecycle = setup().startProcess();
    const pairing = bind(lifecycle);
    assert.deepEqual(lifecycle.admit(request(pairing, override)), rejected);
    assert.deepEqual(lifecycle.admit(request(pairing)), rejected);
    assert.deepEqual(lifecycle.checkLocalReview(pairing.runId), rejected);
  }
});

test('pairing, handshake, admission and review all expire at their own deadlines', () => {
  const { startProcess, advance } = setup();
  const lifecycle = startProcess();

  let pairing = open(lifecycle);
  advance(9);
  assert.equal(lifecycle.confirmOnSender(pairing).status, 'AWAITING_PEER_CONFIRMATION');
  advance(1);
  assert.deepEqual(lifecycle.confirmOnReceiver(pairing), rejected);

  pairing = open(lifecycle);
  advance(9);
  confirmBoth(lifecycle, pairing);
  advance(10);
  assert.deepEqual(lifecycle.authenticate(handshake(pairing)), rejected);

  pairing = bind(lifecycle);
  advance(10);
  assert.deepEqual(lifecycle.admit(request(pairing)), rejected);

  pairing = bind(lifecycle);
  advance(9);
  assert.deepEqual(lifecycle.admit(request(pairing)), proposal);
  advance(9);
  assert.deepEqual(lifecycle.checkLocalReview(pairing.runId), localApprovalRequired);
  advance(1);
  assert.deepEqual(lifecycle.checkLocalReview(pairing.runId), rejected);
  advance(-1);
  assert.deepEqual(lifecycle.begin(), rejected);
});

test('revocation, disconnect before admission and clock rollback close the current run', () => {
  const { startProcess, advance } = setup();
  const lifecycle = startProcess();
  let pairing = bind(lifecycle);
  lifecycle.stop();
  assert.deepEqual(lifecycle.admit(request(pairing)), rejected);

  pairing = bind(lifecycle);
  lifecycle.disconnect();
  assert.deepEqual(lifecycle.admit(request(pairing)), rejected);

  pairing = bind(lifecycle);
  assert.deepEqual(lifecycle.admit(request(pairing)), proposal);
  lifecycle.disconnect();
  assert.deepEqual(lifecycle.checkLocalReview(pairing.runId), localApprovalRequired);
  lifecycle.stop();
  assert.deepEqual(lifecycle.checkLocalReview(pairing.runId), rejected);

  advance(2);
  pairing = bind(lifecycle);
  advance(-1);
  assert.deepEqual(lifecycle.admit(request(pairing)), rejected);
  advance(2);
  assert.deepEqual(lifecycle.admit(request(pairing)), rejected);
});

test('rotation ends old trust and requires both fresh confirmations', () => {
  const lifecycle = setup().startProcess();
  const previous = bind(lifecycle);
  assert.deepEqual(lifecycle.begin(), rejected);
  lifecycle.stop();

  const pending = open(lifecycle);
  assert.notEqual(pending.senderFingerprint, previous.senderFingerprint);
  assert.notEqual(pending.receiverFingerprint, previous.receiverFingerprint);
  assert.deepEqual(lifecycle.confirmOnReceiver(previous), rejected);

  const next = open(lifecycle);
  confirmBoth(lifecycle, next);
  assert.deepEqual(lifecycle.authenticate(handshake(previous)), rejected);

  const current = bind(lifecycle);
  assert.deepEqual(lifecycle.admit(request(current)), proposal);
  assert.deepEqual(lifecycle.checkLocalReview(previous.runId), rejected);
  assert.deepEqual(lifecycle.checkLocalReview(current.runId), localApprovalRequired);
});

test('restart starts with empty trust and a fresh process generation', () => {
  const { startProcess } = setup();
  const before = startProcess(1);
  const pairing = bind(before);
  assert.deepEqual(before.admit(request(pairing)), proposal);
  before.stop();

  const after = startProcess(2);
  assert.deepEqual(after.admit(request(pairing)), rejected);
  assert.deepEqual(after.checkLocalReview(pairing.runId), rejected);
  const current = bind(after);
  assert.notEqual(current.senderFingerprint, pairing.senderFingerprint);
  assert.notEqual(current.receiverFingerprint, pairing.receiverFingerprint);
  assert.deepEqual(after.admit(request(pairing)), rejected);
});
