// Source-only model. Hook input is returned as data for synthetic tests.
const m1Identity = {
  agent: 'dosai-m1-fixture',
  sessionId: 'c76c9a4b-b095-45ed-bcb8-01e48effb714',
  prompt: 'Synthetic DOSAI M1 display observation',
};
const m4Identity = {
  agent: 'dosai-m4-fixture',
  sessionId: '0150137c-bacf-48f6-9448-de75a3acd89e',
  prompt: 'Synthetic DOSAI M4 display observation',
};
const staleAfterMs = 5000;
const states = new Set(['QUEUED', 'RUNNING', 'AWAITING_APPROVAL', 'COMPLETED']);
const positiveInteger = value => Number.isSafeInteger(value) && value > 0;

function hookInput({ agent, sessionId, prompt }, state) {
  const common = { session_id: sessionId, cwd: '/private/tmp' };
  const event = state === 'QUEUED'
    ? { ...common, hook_event_name: 'SessionStart', source: 'startup' }
    : { ...common, hook_event_name: 'UserPromptSubmit', prompt };

  return Object.freeze({ agent, stdin: JSON.stringify(event) + '\n' });
}

function createAdapter(identity) {
  let connected = false;
  let connection = 0;
  let sequence = 0;
  let state = null;
  let observedAtMs = null;
  let latestMs = 0;

  function advanceClock(nowMs) {
    if (!Number.isSafeInteger(nowMs) || nowMs < latestMs) {
      throw new RangeError('INVALID_FIXTURE_MONOTONIC_TIME');
    }
    latestMs = nowMs;
  }

  return Object.freeze({
    // The fixture explicitly models the transport lifecycle. Connection IDs and
    // observation sequences live in separate counters across a reconnect.
    connect(generation, nowMs) {
      advanceClock(nowMs);
      if (connected || !positiveInteger(generation) || generation <= connection) return false;
      connection = generation;
      connected = true;
      return true;
    },

    disconnect(generation, nowMs) {
      advanceClock(nowMs);
      if (!connected || generation !== connection) return false;
      connected = false;
      return true;
    },

    observe(event, nowMs) {
      advanceClock(nowMs);
      if (!event || Object.getPrototypeOf(event) !== Object.prototype) return null;
      const keys = Reflect.ownKeys(event);
      if (keys.length !== 3 || !['generation', 'sequence', 'state'].every(key => keys.includes(key))) {
        return null;
      }

      const descriptors = Object.getOwnPropertyDescriptors(event);
      if (Object.values(descriptors).some(descriptor => !Object.hasOwn(descriptor, 'value'))) return null;
      const generation = descriptors.generation.value;
      const next = descriptors.sequence.value;
      const nextState = descriptors.state.value;
      if (!connected || generation !== connection || !positiveInteger(next) ||
          next <= sequence || !states.has(nextState)) return null;

      sequence = next;
      state = nextState;
      observedAtMs = nowMs;
      if (state === 'QUEUED' || state === 'RUNNING') return hookInput(identity, state);
      return null;
    },

    view(nowMs) {
      advanceClock(nowMs);
      const stale = observedAtMs !== null && nowMs - observedAtMs >= staleAfterMs;
      return Object.freeze({
        connected, stale, state: stale ? 'STALE' : state, lastObservedState: state,
        lastObservedSequence: sequence, observedAtMs,
      });
    },
  });
}

export function createSyntheticDevalleyDisplayAdapter() {
  return createAdapter(m1Identity);
}

export function createSyntheticDevalleyResidentSet() {
  return Object.freeze({
    m1: createAdapter(m1Identity),
    m4: createAdapter(m4Identity),
  });
}
