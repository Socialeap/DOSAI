import assert from 'node:assert/strict';
import test from 'node:test';
import { createSyntheticDevalleyDisplayAdapter } from '../fixtures/spatial/devalley-display-adapter.mjs';

function event(generation, sequence, state = 'RUNNING') {
  return { generation, sequence, state };
}

function running() {
  const adapter = createSyntheticDevalleyDisplayAdapter();
  assert.equal(adapter.connect(1, 0), true);
  const frame = adapter.observe(event(1, 1), 0);
  assert.ok(frame);
  return { adapter, frame };
}

test('synthetic hook input carries one stable resident across reconnect', () => {
  const adapter = createSyntheticDevalleyDisplayAdapter();
  adapter.connect(1, 0);
  const queued = adapter.observe(event(1, 1, 'QUEUED'), 0);
  const working = adapter.observe(event(1, 2), 1);
  adapter.disconnect(1, 2);
  adapter.connect(2, 6000);
  const refresh = adapter.observe(event(2, 3), 6001);

  const first = JSON.parse(queued.stdin);
  assert.deepEqual(first, {
    session_id: first.session_id, cwd: '/private/tmp', hook_event_name: 'SessionStart', source: 'startup',
  });
  assert.match(first.session_id, /^[a-f0-9-]{36}$/);
  assert.deepEqual(JSON.parse(working.stdin), {
    session_id: first.session_id, cwd: '/private/tmp', hook_event_name: 'UserPromptSubmit',
    prompt: 'Synthetic DOSAI M1 display observation',
  });
  assert.deepEqual(refresh, working);
  assert.deepEqual(Object.keys(refresh).sort(), ['agent', 'stdin']);
  assert.equal(refresh.agent, 'dosai-m1-fixture');
  assert.equal(refresh.stdin.split('\n').length, 2);
  assert.ok(Object.isFrozen(refresh));
});

test('DOSAI marks stale exactly at expiry and requires a fresh event after reconnect', () => {
  const { adapter } = running();
  assert.equal(adapter.disconnect(1, 1), true);
  assert.equal(adapter.view(4999).state, 'RUNNING');
  assert.deepEqual(adapter.view(5000), {
    connected: false, stale: true, state: 'STALE', lastObservedState: 'RUNNING',
    lastObservedSequence: 1, observedAtMs: 0,
  });
  assert.equal(adapter.connect(2, 5100), true);
  assert.equal(adapter.view(5100).state, 'STALE');
  assert.ok(adapter.observe(event(2, 2), 5101));
  assert.deepEqual(adapter.view(5101), {
    connected: true, stale: false, state: 'RUNNING', lastObservedState: 'RUNNING',
    lastObservedSequence: 2, observedAtMs: 5101,
  });
});

test('offline observations, duplicates, old sequences and old connections cannot refresh', () => {
  const { adapter } = running();
  adapter.observe(event(1, 2), 1);
  adapter.disconnect(1, 2);
  assert.equal(adapter.observe(event(1, 3), 5002), null);
  adapter.connect(2, 5003);
  assert.equal(adapter.disconnect(1, 5003), false);
  assert.equal(adapter.connect(3, 5003), false);
  for (const observation of [event(2, 2), event(2, 1), event(1, 99)]) {
    assert.equal(adapter.observe(observation, 5004), null);
    assert.equal(adapter.view(5004).observedAtMs, 1);
    assert.equal(adapter.view(5004).state, 'STALE');
  }
  assert.ok(adapter.observe(event(2, 3), 5005));
  assert.equal(adapter.observe(event(2, 2), 5006), null);
  assert.equal(adapter.view(5006).observedAtMs, 5005);
});

test('approval, completion and stale state do not produce hook payloads', () => {
  const { adapter } = running();
  assert.equal(adapter.observe(event(1, 2, 'AWAITING_APPROVAL'), 10), null);
  assert.equal(adapter.view(10).state, 'AWAITING_APPROVAL');
  assert.equal(adapter.observe(event(1, 3, 'COMPLETED'), 11), null);
  assert.equal(adapter.view(11).state, 'COMPLETED');
  assert.equal(adapter.observe(event(1, 4, 'STALE'), 5011), null);
  assert.equal(adapter.view(5011).state, 'STALE');
});

test('closed input rejects authority, paths, unknown types and getters without refreshing', () => {
  const { adapter } = running();
  const unexpected = [
    { ...event(1, 2), cwd: '/untrusted' },
    { ...event(1, 2), prompt: 'untrusted' },
    { ...event(1, 2), approval: true },
    { ...event(1, 2), endpoint: 'untrusted' },
    event(1, 2, 'PermissionRequest'),
    event(1, '2'),
    event(1, Infinity),
    event('1', 2),
    { ...event(1, 2), get state() { throw new Error('must never read getter'); } },
    Object.create(event(1, 2)),
    null,
  ];
  for (const observation of unexpected) assert.equal(adapter.observe(observation, 5000), null);
  assert.equal(adapter.view(5000).state, 'STALE');
  assert.throws(() => adapter.view(4999), { message: 'INVALID_FIXTURE_MONOTONIC_TIME' });
  assert.throws(() => adapter.observe(event(1, 2), NaN), { message: 'INVALID_FIXTURE_MONOTONIC_TIME' });
  assert.equal(adapter.view(5000).lastObservedSequence, 1);
});
