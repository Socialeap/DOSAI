import assert from 'node:assert/strict';
import test from 'node:test';
import { createSyntheticDevalleyBufferedResidentSet } from '../fixtures/spatial/devalley-display-buffer.mjs';

function observation(generation, sequence, state = 'RUNNING') {
  return { generation, sequence, state };
}

test('a slow consumer gets at most one current display frame per resident', () => {
  const { m1, m4 } = createSyntheticDevalleyBufferedResidentSet();
  m1.connect(1, 0);
  m4.connect(1, 0);
  m1.observe(observation(1, 1, 'QUEUED'), 0);
  m4.observe(observation(1, 1, 'QUEUED'), 0);
  for (let sequence = 2; sequence <= 100; sequence++) {
    assert.equal(m1.observe(observation(1, sequence), sequence), true);
  }

  const m1Frame = m1.take(100);
  const m4Frame = m4.take(100);
  assert.equal(m1Frame.agent, 'dosai-m1-fixture');
  assert.equal(JSON.parse(m1Frame.stdin).hook_event_name, 'UserPromptSubmit');
  assert.equal(m4Frame.agent, 'dosai-m4-fixture');
  assert.equal(JSON.parse(m4Frame.stdin).hook_event_name, 'SessionStart');
  assert.equal(m1.take(100), null);
  assert.equal(m4.take(100), null);
  assert.equal(m1.view(100).lastObservedSequence, 100);
  assert.equal(m4.view(100).lastObservedSequence, 1);
});

test('expiry at five seconds discards the pending frame while DOSAI retains the last state', () => {
  const { m1, m4 } = createSyntheticDevalleyBufferedResidentSet();
  for (const resident of [m1, m4]) {
    resident.connect(1, 0);
    resident.observe(observation(1, 1), 0);
  }
  assert.ok(m4.take(4999));
  assert.equal(m1.take(5000), null);
  assert.equal(m1.view(5000).state, 'STALE');
  assert.equal(m1.view(5000).lastObservedState, 'RUNNING');
  assert.equal(m1.take(5001), null);
});

test('disconnect clears pending display data and reconnect requires a newer observation', () => {
  const { m1 } = createSyntheticDevalleyBufferedResidentSet();
  m1.connect(1, 0);
  m1.observe(observation(1, 1), 1);
  assert.equal(m1.disconnect(1, 2), true);
  assert.equal(m1.connect(2, 3), true);
  assert.equal(m1.take(3), null); // The old frame is gone even before expiry.
  assert.equal(m1.view(5001).state, 'STALE');

  assert.equal(m1.observe(observation(1, 99), 5002), false);
  assert.equal(m1.observe(observation(2, 1), 5002), false);
  assert.equal(m1.take(5002), null);
  assert.equal(m1.view(5002).state, 'STALE');

  assert.equal(m1.observe(observation(2, 2), 5003), true);
  assert.equal(m1.disconnect(1, 5004), false);
  assert.equal(m1.observe(observation(2, 1), 5004), false);
  assert.equal(m1.take(5004).agent, 'dosai-m1-fixture');
  assert.equal(m1.view(5004).state, 'RUNNING');
});

test('accepted DOSAI-only states clear old display data without emitting their own', () => {
  const { m1, m4 } = createSyntheticDevalleyBufferedResidentSet();
  m1.connect(1, 0);
  m4.connect(1, 0);
  m4.observe(observation(1, 1), 1);
  for (const [index, state] of ['AWAITING_APPROVAL', 'COMPLETED'].entries()) {
    const seq = index * 2 + 1;
    m1.observe(observation(1, seq), seq);
    assert.equal(m1.observe(observation(1, seq + 1, state), seq + 1), true);
    assert.equal(m1.take(seq + 1), null);
    assert.equal(m1.view(seq + 1).state, state);
  }
  assert.equal(m4.take(4).agent, 'dosai-m4-fixture');
});
