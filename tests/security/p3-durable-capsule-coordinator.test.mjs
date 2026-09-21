import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { openCapsuleStateStore } from '../../src/main/execution/capsule-state-store.ts';
import { openDurableCapsuleCoordinator } from '../../src/main/execution/durable-capsule-coordinator.ts';

function request() {
  return {
    schema_id: 'urn:dosai:schema:capsule-request:1',
    schema_version: 1,
    capsule_id: randomUUID(),
    operation_id: randomUUID(),
    generation: '1',
    operation_kind: 'SAFE_TEST',
    executable: '/usr/bin/printf',
    arguments: ['DOSAI_SAFE_TEST_OK'],
    environment: {},
    limits: { wall_time_ms: 1000, max_output_bytes: 18 },
    authorization: 'NO_EFFECT_TEST_ONLY',
  };
}

async function fixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'dosai-durable-coordinator-test-')));
  const store = await openCapsuleStateStore(join(root, 'state'));
  return { root, store };
}

async function cleanup(root) {
  await rm(root, { recursive: true, force: true });
}

function memoryAuditBinding() {
  return Object.freeze({
    async verifyCurrent() {},
    async bindTransition(_previous, candidate) {
      return Object.freeze({
        journalSequence: candidate.revision,
        eventHash: Object.freeze({ algorithm: 'SHA-256', value: 'a'.repeat(64) }),
      });
    },
  });
}

test('ordinary coordinator transitions serialize and become durable before success', async () => {
  const { root, store } = await fixture();
  try {
    const binding = memoryAuditBinding();
    const { coordinator } = await openDurableCapsuleCoordinator(store, '1', 100, binding);
    assert.equal(coordinator.durableRevision, '1');
    assert.equal('attachProcess' in coordinator, false);
    const candidate = request();

    await coordinator.register(candidate, 101);
    assert.equal((await store.load()).revision, '2');
    assert.equal((await store.load()).records[0].state, 'REGISTERED');

    await coordinator.begin(candidate.capsule_id, candidate.generation, 102);
    assert.equal((await store.load()).revision, '3');
    assert.equal((await store.load()).records[0].state, 'STARTING');

    await coordinator.appendOutput(candidate.capsule_id, candidate.generation, 4, 103);
    assert.equal((await store.load()).revision, '4');
    assert.equal((await store.load()).records[0].output_bytes, 4);

    await coordinator.cancel(
      candidate.capsule_id,
      candidate.generation,
      'OWNER_REQUEST',
      104,
    );
    const stopped = await store.load();
    assert.equal(stopped.revision, '5');
    assert.equal(stopped.records[0].state, 'STOPPED');
    assert.equal(stopped.records[0].last_cancellation_reason, 'OWNER_REQUEST');
    assert.equal(coordinator.status, 'READY');
  } finally {
    await store.close().catch(() => undefined);
    await cleanup(root);
  }
});

test('a newer coordinator quarantines active state and fences the stale generation', async () => {
  const { root, store } = await fixture();
  try {
    const binding = memoryAuditBinding();
    const first = (await openDurableCapsuleCoordinator(store, '1', 100, binding)).coordinator;
    const candidate = request();
    await first.register(candidate, 101);
    await first.begin(candidate.capsule_id, candidate.generation, 102);

    const reopened = await openDurableCapsuleCoordinator(store, '2', 200, binding);
    assert.deepEqual(reopened.startupQuarantinedCapsuleIds, [candidate.capsule_id]);
    assert.equal(reopened.coordinator.snapshot(candidate.capsule_id).state, 'QUARANTINED');
    assert.equal((await store.load()).supervisor_generation, '2');

    await assert.rejects(() => first.register(request(), 201), /DOSAI_CAPSULE_COORDINATOR_PERSISTENCE_0001/);
    assert.equal(first.status, 'BROKEN');
    assert.equal((await store.load()).supervisor_generation, '2');
  } finally {
    await store.close().catch(() => undefined);
    await cleanup(root);
  }
});

test('persistence failure closes ordinary authority while emergency stop still reduces state', async () => {
  const { root, store } = await fixture();
  try {
    const binding = memoryAuditBinding();
    let failWrites = false;
    const failingStore = Object.freeze({
      ...store,
      save: async (candidate) => {
        if (failWrites) throw new Error('INJECTED_STORE_FAILURE');
        return store.save(candidate);
      },
    });
    const { coordinator } = await openDurableCapsuleCoordinator(failingStore, '1', 100, binding);
    const candidate = request();
    failWrites = true;
    await assert.rejects(
      () => coordinator.register(candidate, 101),
      /DOSAI_CAPSULE_COORDINATOR_PERSISTENCE_0001/,
    );
    assert.equal(coordinator.status, 'BROKEN');
    await assert.rejects(
      () => coordinator.begin(candidate.capsule_id, candidate.generation, 102),
      /DOSAI_CAPSULE_COORDINATOR_BROKEN_0001/,
    );
    const emergency = await coordinator.emergencyStop(103);
    assert.equal(emergency.results.length, 1);
    assert.equal(emergency.results[0].state, 'STOPPED');
    assert.equal(emergency.persistence, 'FAILED');
    assert.equal(emergency.coordinatorStatus, 'BROKEN');
  } finally {
    await store.close().catch(() => undefined);
    await cleanup(root);
  }
});

test('emergency stop bypasses a blocked ordinary persistence queue', async () => {
  const { root, store } = await fixture();
  try {
    const binding = memoryAuditBinding();
    let blockWrites = false;
    let writing = false;
    let releaseWrite = () => undefined;
    let signalEntered = () => undefined;
    const entered = new Promise((resolve) => {
      signalEntered = resolve;
    });
    const release = new Promise((resolve) => {
      releaseWrite = resolve;
    });
    const blockingStore = Object.freeze({
      ...store,
      save: async (candidate) => {
        if (writing) throw new Error('INJECTED_STORE_BUSY');
        if (!blockWrites) return store.save(candidate);
        writing = true;
        signalEntered();
        await release;
        writing = false;
        return store.save(candidate);
      },
    });
    const { coordinator } = await openDurableCapsuleCoordinator(blockingStore, '1', 100, binding);
    const candidate = request();
    blockWrites = true;
    const pendingRegister = coordinator.register(candidate, 101);
    await entered;

    const emergency = await coordinator.emergencyStop(102);
    assert.equal(emergency.results.length, 1);
    assert.equal(emergency.results[0].state, 'STOPPED');
    assert.equal(emergency.persistence, 'FAILED');
    assert.equal(emergency.coordinatorStatus, 'BROKEN');

    releaseWrite();
    await assert.rejects(pendingRegister, /DOSAI_CAPSULE_COORDINATOR_BROKEN_0001/);
    const reopened = await openDurableCapsuleCoordinator(store, '2', 200, binding);
    assert.deepEqual(reopened.startupQuarantinedCapsuleIds, [candidate.capsule_id]);
    assert.equal(reopened.coordinator.snapshot(candidate.capsule_id).state, 'QUARANTINED');
  } finally {
    await store.close().catch(() => undefined);
    await cleanup(root);
  }
});
