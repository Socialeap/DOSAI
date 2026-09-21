import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

import {
  admitCapsuleRequest,
  admitFixedSafeTestCapsuleRequest,
} from '../../src/contracts/p3/contracts.ts';
import { CapsuleSupervisor } from '../../src/main/execution/capsule-supervisor.ts';

function request(overrides = {}) {
  return {
    schema_id: 'urn:dosai:schema:capsule-request:1',
    schema_version: 1,
    capsule_id: randomUUID(),
    operation_id: randomUUID(),
    generation: '1',
    operation_kind: 'SAFE_TEST',
    executable: '/usr/bin/sleep',
    arguments: ['0.01'],
    environment: {},
    limits: { wall_time_ms: 1000, max_output_bytes: 0 },
    authorization: 'NO_EFFECT_TEST_ONLY',
    ...overrides,
  };
}

function fakeProcess({ remainsAlive = false } = {}) {
  let alive = true;
  return {
    stop: async () => {
      if (!remainsAlive) alive = false;
    },
    forceStop: async () => {
      if (!remainsAlive) alive = false;
    },
    isAlive: () => alive,
  };
}

function attachRunningCapsule(supervisor, candidate, process) {
  supervisor.register(candidate, 100);
  supervisor.begin(candidate.capsule_id, candidate.generation);
  supervisor.attachProcess(candidate.capsule_id, candidate.generation, process);
}

test('P3 request admission is exact and denies ambient environment authority', () => {
  const candidate = request();
  const admitted = admitCapsuleRequest(candidate);
  assert.deepEqual(admitFixedSafeTestCapsuleRequest(candidate), admitted);
  assert.equal(admitted.authorization, 'NO_EFFECT_TEST_ONLY');
  assert.equal(Object.isFrozen(admitted), true);
  assert.equal(Object.isFrozen(admitted.limits), true);
  assert.throws(() => admitCapsuleRequest(request({ executable: '/bin/sh' })), /DOSAI_CAPSULE_SCHEMA_0001/);
  assert.throws(() => admitCapsuleRequest(request({ environment: { PATH: '/usr/bin' } })), /DOSAI_CAPSULE_ENVIRONMENT_0001/);
  assert.throws(() => admitCapsuleRequest(request({ limits: { wall_time_ms: 0, max_output_bytes: 64 } })), /DOSAI_CAPSULE_LIMITS_0001/);
});

test('capsule lifecycle binds generation, output budget, cancellation, and idempotency', async () => {
  const supervisor = new CapsuleSupervisor();
  const candidate = request();
  const registered = supervisor.register(candidate, 100);
  assert.equal(registered.state, 'REGISTERED');
  assert.throws(() => supervisor.begin(candidate.capsule_id, '2'), /DOSAI_CAPSULE_IDENTITY_0001/);
  supervisor.begin(candidate.capsule_id, candidate.generation);
  const process = fakeProcess();
  const running = supervisor.attachProcess(candidate.capsule_id, candidate.generation, process);
  assert.equal(running.state, 'RUNNING');
  const cancelled = await supervisor.cancel(candidate.capsule_id, candidate.generation, 'OWNER_REQUEST', 200);
  assert.deepEqual(cancelled, {
    capsuleId: candidate.capsule_id,
    state: 'STOPPED',
    cleanup: 'VERIFIED',
    reason: 'OWNER_REQUEST',
  });
  assert.deepEqual(
    await supervisor.cancel(candidate.capsule_id, candidate.generation, 'OWNER_REQUEST', 201),
    cancelled,
  );
});

test('output overflow triggers scoped cancellation and uncertain cleanup is quarantined', async () => {
  const supervisor = new CapsuleSupervisor();
  const candidate = request({
    executable: '/usr/bin/printf',
    arguments: ['DOSAI_SAFE_TEST_OK'],
    limits: { wall_time_ms: 1000, max_output_bytes: 18 },
  });
  supervisor.register(candidate, 100);
  supervisor.begin(candidate.capsule_id, candidate.generation);
  supervisor.attachProcess(candidate.capsule_id, candidate.generation, fakeProcess());
  const result = await supervisor.appendOutput(candidate.capsule_id, candidate.generation, 19, 101);
  assert.deepEqual(result, {
    capsuleId: candidate.capsule_id,
    state: 'STOPPED',
    cleanup: 'VERIFIED',
    reason: 'OUTPUT_LIMIT',
  });

  const uncertain = new CapsuleSupervisor();
  const uncertainRequest = request();
  uncertain.register(uncertainRequest, 100);
  uncertain.begin(uncertainRequest.capsule_id, uncertainRequest.generation);
  uncertain.attachProcess(uncertainRequest.capsule_id, uncertainRequest.generation, fakeProcess({ remainsAlive: true }));
  const quarantined = await uncertain.cancel(
    uncertainRequest.capsule_id,
    uncertainRequest.generation,
    'OWNER_REQUEST',
    101,
  );
  assert.equal(quarantined.state, 'QUARANTINED');
  assert.equal(quarantined.cleanup, 'UNCERTAIN');
});

test('watchdog and emergency stop only reduce registered capsule state', async () => {
  const supervisor = new CapsuleSupervisor();
  const expired = request();
  const active = request();
  supervisor.register(expired, 100);
  supervisor.register(active, 1_000);
  supervisor.begin(expired.capsule_id, expired.generation);
  supervisor.begin(active.capsule_id, active.generation);
  supervisor.attachProcess(expired.capsule_id, expired.generation, fakeProcess());
  supervisor.attachProcess(active.capsule_id, active.generation, fakeProcess());
  const watchdogResults = await supervisor.watchdogSweep(1_100);
  assert.equal(watchdogResults.length, 1);
  assert.equal(watchdogResults[0].reason, 'WATCHDOG_TIMEOUT');
  assert.equal(supervisor.snapshot(active.capsule_id).state, 'RUNNING');
  const emergencyResults = await supervisor.emergencyStop(1_101);
  assert.equal(emergencyResults.length, 1);
  assert.equal(emergencyResults[0].reason, 'EMERGENCY_STOP');
  assert.equal(supervisor.snapshot(active.capsule_id).state, 'STOPPED');
});

test('a suspended graceful stop reaches one force attempt and every caller shares that bounded reduction', async () => {
  const supervisor = new CapsuleSupervisor();
  const candidate = request();
  let gracefulAttempts = 0;
  let forceAttempts = 0;
  let alive = true;
  attachRunningCapsule(supervisor, candidate, {
    stop: async () => {
      gracefulAttempts += 1;
      await new Promise(() => {});
    },
    forceStop: async () => {
      forceAttempts += 1;
      alive = false;
    },
    isAlive: () => alive,
  });

  const ordinary = supervisor.cancel(
    candidate.capsule_id,
    candidate.generation,
    'OWNER_REQUEST',
    101,
  );
  const [watchdog, emergency] = await Promise.all([
    supervisor.watchdogSweep(1_100),
    supervisor.emergencyStop(1_101),
  ]);
  const ordinaryResult = await ordinary;

  assert.equal(gracefulAttempts, 1);
  assert.equal(forceAttempts, 1);
  assert.deepEqual(ordinaryResult, {
    capsuleId: candidate.capsule_id,
    state: 'STOPPED',
    cleanup: 'VERIFIED',
    reason: 'OWNER_REQUEST',
  });
  assert.deepEqual(watchdog, [ordinaryResult]);
  assert.deepEqual(emergency, [ordinaryResult]);
  assert.equal(supervisor.snapshot(candidate.capsule_id).state, 'STOPPED');
});

test('force failure or remaining liveness quarantines after exactly one force attempt', async () => {
  for (const forceStop of [
    async () => {
      throw new Error('force failed');
    },
    async () => {},
  ]) {
    const supervisor = new CapsuleSupervisor();
    const candidate = request();
    let gracefulAttempts = 0;
    let forceAttempts = 0;
    attachRunningCapsule(supervisor, candidate, {
      stop: async () => {
        gracefulAttempts += 1;
      },
      forceStop: async () => {
        forceAttempts += 1;
        await forceStop();
      },
      isAlive: () => true,
    });

    const result = await supervisor.cancel(
      candidate.capsule_id,
      candidate.generation,
      'OWNER_REQUEST',
      101,
    );

    assert.equal(gracefulAttempts, 1);
    assert.equal(forceAttempts, 1);
    assert.deepEqual(result, {
      capsuleId: candidate.capsule_id,
      state: 'QUARANTINED',
      cleanup: 'UNCERTAIN',
      reason: 'OWNER_REQUEST',
    });
    assert.equal(supervisor.snapshot(candidate.capsule_id).state, 'QUARANTINED');
  }
});

test('timely graceful cleanup avoids force and cancellation results remain immutable', async () => {
  const supervisor = new CapsuleSupervisor();
  const candidate = request();
  let gracefulAttempts = 0;
  let forceAttempts = 0;
  let alive = true;
  attachRunningCapsule(supervisor, candidate, {
    stop: async () => {
      gracefulAttempts += 1;
      alive = false;
    },
    forceStop: async () => {
      forceAttempts += 1;
    },
    isAlive: () => alive,
  });

  const result = await supervisor.cancel(
    candidate.capsule_id,
    candidate.generation,
    'OWNER_REQUEST',
    101,
  );

  assert.equal(gracefulAttempts, 1);
  assert.equal(forceAttempts, 0);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(supervisor.snapshot(candidate.capsule_id)), true);
  assert.throws(() => {
    result.state = 'QUARANTINED';
  }, TypeError);
});

test('capsule supervisor retains an injected-handle-only authority boundary', async () => {
  const root = resolve(import.meta.dirname, '../..');
  const source = await readFile(resolve(root, 'src/main/execution/capsule-supervisor.ts'), 'utf8');
  assert.match(source, /export type CapsuleProcessHandle/);
  assert.doesNotMatch(source, /node:child_process|child_process|\.kill\(/);
  assert.doesNotMatch(source, /from 'electron'|from "electron"/);
});
