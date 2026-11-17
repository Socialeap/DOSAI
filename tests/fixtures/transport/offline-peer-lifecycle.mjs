// Test-only model. Fingerprints, sessions and handshake proof are synthetic inputs.
const stageTicks = 10;
const action = 'SUMMARIZE_FIXTURE';
const rejected = Object.freeze({ status: 'REJECTED' });

function matches(actual, expected) {
  if (actual === null || typeof actual !== 'object') return false;
  const entries = Object.entries(expected);
  return Reflect.ownKeys(actual).length === entries.length &&
    entries.every(([field, value]) => {
      const descriptor = Object.getOwnPropertyDescriptor(actual, field);
      return descriptor !== undefined && Object.hasOwn(descriptor, 'value') && descriptor.value === value;
    });
}

export function createOfflinePeerLifecycle({ processGeneration, now }) {
  if (!Number.isSafeInteger(processGeneration) || processGeneration <= 0 || typeof now !== 'function') {
    throw new TypeError('INVALID_SYNTHETIC_CONTEXT');
  }

  let runNumber = 0;
  let lastTick = 0;
  let current = null;

  function stop() {
    current = null;
  }

  function fail() {
    stop();
    return rejected;
  }

  function readClock() {
    const tick = now();
    if (!Number.isSafeInteger(tick) || tick < lastTick || tick > Number.MAX_SAFE_INTEGER - stageTicks) {
      stop();
      return null;
    }
    lastTick = tick;
    if (current !== null && tick >= current.deadline) {
      stop();
      return null;
    }
    return tick;
  }

  function enter(stage, tick) {
    current.stage = stage;
    current.deadline = tick + stageTicks;
  }

  function begin() {
    const tick = readClock();
    if (tick === null || current !== null) return rejected;

    const runId = `synthetic-${processGeneration}/${++runNumber}`;
    const pairing = Object.freeze({
      runId,
      senderFingerprint: `${runId}/M1`,
      receiverFingerprint: `${runId}/M4`,
      senderRole: 'SENDER',
      receiverRole: 'RECEIVER',
      version: 1,
      action,
    });
    current = { pairing, confirmations: new Set(), session: `${runId}/session` };
    enter('PAIRING', tick);
    return Object.freeze({ status: 'PAIRING', pairing });
  }

  function confirm(endpoint, pairing) {
    const tick = readClock();
    if (tick === null || current?.stage === 'REVIEW') return rejected;
    if (current?.stage !== 'PAIRING' || !matches(pairing, current.pairing) ||
        current.confirmations.has(endpoint)) return fail();
    const { confirmations } = current;

    confirmations.add(endpoint);
    if (confirmations.size === 1) return Object.freeze({ status: 'AWAITING_PEER_CONFIRMATION' });
    enter('HANDSHAKE', tick);
    return Object.freeze({ status: 'AWAITING_HANDSHAKE' });
  }

  function authenticate(evidence) {
    const tick = readClock();
    if (tick === null || current?.stage === 'REVIEW') return rejected;
    if (current?.stage !== 'HANDSHAKE' || !matches(evidence, {
      ...current.pairing,
      session: current.session,
      senderProof: true,
      receiverProof: true,
    })) return fail();

    enter('ADMISSION', tick);
    return Object.freeze({ status: 'AWAITING_PROPOSAL' });
  }

  function admit(frame) {
    const tick = readClock();
    if (tick === null || current?.stage === 'REVIEW') return rejected;
    if (current?.stage !== 'ADMISSION' || !matches(frame, {
      session: current.session,
      direction: 'M1_TO_M4',
      sequence: 1,
      payload: '{"action":"SUMMARIZE_FIXTURE"}',
    })) return fail();

    // The receive window is consumed. Retain only the run binding for local review.
    current = { runId: current.pairing.runId };
    enter('REVIEW', tick);
    return Object.freeze({
      status: 'PROPOSAL_FOR_LOCAL_REVIEW',
      proposal: Object.freeze({ action }),
    });
  }

  function checkLocalReview(runId) {
    if (readClock() === null || current?.stage !== 'REVIEW' || current.runId !== runId) return rejected;
    return Object.freeze({ status: 'LOCAL_APPROVAL_REQUIRED' });
  }

  function disconnect() {
    if (current?.stage !== 'REVIEW') stop();
  }

  return Object.freeze({
    begin,
    confirmOnSender: (pairing) => confirm('SENDER', pairing),
    confirmOnReceiver: (pairing) => confirm('RECEIVER', pairing),
    authenticate,
    admit,
    checkLocalReview,
    disconnect,
    stop,
  });
}
