import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  CapsuleRegistryAuditBindingFailure,
  createCapsuleRegistryAuditBinding,
} from '../../native-helpers/audit/capsule-registry-binding.ts';
import { openAuditJournal, verifyAuditJournal } from '../../native-helpers/audit/journal.ts';
import { openCapsuleStateStore } from '../../src/main/execution/capsule-state-store.ts';
import { openDurableCapsuleCoordinator } from '../../src/main/execution/durable-capsule-coordinator.ts';

const sourceId = 'dosai.capsule-registry';

function authenticationToken() {
  return Uint8Array.from({ length: 32 }, (_, index) => index + 1);
}

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

async function rootFixture() {
  return realpath(await mkdtemp(join(tmpdir(), 'dosai-capsule-audit-binding-test-')));
}

function openAudit(root, sourceGeneration, expectedIdentity) {
  const token = authenticationToken();
  const journal = openAuditJournal({
    databasePath: join(root, 'audit.sqlite3'),
    sources: [{
      sourceId,
      sourceGeneration,
      provenance: 'SUPERVISOR_OBSERVATION',
      wallClockUncertaintyMs: 1,
      authenticationToken: token,
    }],
    ...(expectedIdentity === undefined ? {} : { expectedIdentity }),
  });
  const binding = createCapsuleRegistryAuditBinding(journal, {
    sourceGeneration,
    authenticationToken: token,
  });
  return { binding, journal, token };
}

function appendManualEvent(audit, payload, eventKind = 'CAPSULE_REGISTRY_REVISION_COMMITTED') {
  return audit.journal.append(sourceId, audit.token, {
    schema_id: 'urn:dosai:schema:audit-event-proposal:2',
    schema_version: 2,
    message_id: randomUUID(),
    created_at: new Date().toISOString(),
    producer: sourceId,
    producer_generation: '1',
    trace_id: randomUUID(),
    data_class: 'D1',
    event_kind: eventKind,
    payload,
  });
}

async function closeFixture(root, store, audit) {
  audit?.binding.close();
  audit?.journal.close();
  await store?.close().catch(() => undefined);
  await rm(root, { recursive: true, force: true });
}

test('ordinary revisions are state-first, durably journaled, and semantically chained', async () => {
  const root = await rootFixture();
  const store = await openCapsuleStateStore(join(root, 'state'));
  const audit = openAudit(root, '1');
  try {
    const { coordinator } = await openDurableCapsuleCoordinator(
      store,
      '1',
      100,
      audit.binding,
    );
    const candidate = request();
    await coordinator.register(candidate, 101);
    await coordinator.begin(candidate.capsule_id, candidate.generation, 102);
    await coordinator.appendOutput(candidate.capsule_id, candidate.generation, 4, 103);
    await coordinator.cancel(candidate.capsule_id, candidate.generation, 'OWNER_REQUEST', 104);

    const events = [];
    audit.journal.visitEventsForSource(sourceId, audit.token, (event) => events.push(event));
    assert.deepEqual(events.map(({ event_kind }) => event_kind), [
      'CAPSULE_REGISTRY_REVISION_COMMITTED',
      'CAPSULE_REGISTRY_REVISION_COMMITTED',
      'CAPSULE_REGISTRY_REVISION_COMMITTED',
      'CAPSULE_REGISTRY_REVISION_COMMITTED',
      'CAPSULE_REGISTRY_REVISION_COMMITTED',
    ]);
    assert.deepEqual(events.map(({ payload }) => payload.transition), [
      'INITIALIZE',
      'REGISTER',
      'BEGIN',
      'OUTPUT',
      'CANCEL',
    ]);
    assert.deepEqual(events.map(({ payload }) => payload.revision), ['1', '2', '3', '4', '5']);
    assert.equal(events[0].payload.previous_registry_digest, null);
    for (let index = 1; index < events.length; index += 1) {
      assert.deepEqual(
        events[index].payload.previous_registry_digest,
        events[index - 1].payload.registry_digest,
      );
    }
    const identity = audit.journal.identity;
    audit.binding.close();
    audit.journal.close();
    const report = verifyAuditJournal(join(root, 'audit.sqlite3'), identity);
    assert.equal(report.assurance, 'LOCAL_DURABLE');
    assert.equal(report.limitations.includes('LOCAL_ROLLBACK_NOT_DETECTABLE'), true);
  } finally {
    await closeFixture(root, store, audit);
  }
});

test('restart rejects a schema-valid older registry while the journal remains newer', async () => {
  const root = await rootFixture();
  let store = await openCapsuleStateStore(join(root, 'state'));
  let audit = openAudit(root, '1');
  try {
    const first = (await openDurableCapsuleCoordinator(store, '1', 100, audit.binding)).coordinator;
    const revisionOne = await readFile(join(root, 'state', 'capsule-registry.json'));
    await first.register(request(), 101);
    const identity = audit.journal.identity;
    audit.binding.close();
    audit.journal.close();
    await store.close();

    await writeFile(join(root, 'state', 'capsule-registry.json'), revisionOne);
    store = await openCapsuleStateStore(join(root, 'state'));
    audit = openAudit(root, '2', identity);
    await assert.rejects(
      () => openDurableCapsuleCoordinator(store, '2', 200, audit.binding),
      /DOSAI_CAPSULE_COORDINATOR_CONTINUITY_0001/,
    );
  } finally {
    await closeFixture(root, store, audit);
  }
});

test('restart rejects schema-valid same-revision mutation', async () => {
  const root = await rootFixture();
  let store = await openCapsuleStateStore(join(root, 'state'));
  let audit = openAudit(root, '1');
  try {
    await openDurableCapsuleCoordinator(store, '1', 100, audit.binding);
    const identity = audit.journal.identity;
    audit.binding.close();
    audit.journal.close();
    await store.close();

    const path = join(root, 'state', 'capsule-registry.json');
    const registry = JSON.parse(await readFile(path, 'utf8'));
    registry.updated_at_ms += 1;
    await writeFile(path, `${JSON.stringify(registry)}\n`);
    store = await openCapsuleStateStore(join(root, 'state'));
    audit = openAudit(root, '2', identity);
    await assert.rejects(
      () => openDurableCapsuleCoordinator(store, '2', 200, audit.binding),
      /DOSAI_CAPSULE_COORDINATOR_CONTINUITY_0001/,
    );
  } finally {
    await closeFixture(root, store, audit);
  }
});

test('state-ahead audit failure breaks the operation and blocks restart', async () => {
  const root = await rootFixture();
  let store = await openCapsuleStateStore(join(root, 'state'));
  let audit = openAudit(root, '1');
  try {
    const coordinator = (
      await openDurableCapsuleCoordinator(store, '1', 100, audit.binding)
    ).coordinator;
    const identity = audit.journal.identity;
    audit.journal.close();
    await assert.rejects(
      () => coordinator.register(request(), 101),
      /DOSAI_CAPSULE_COORDINATOR_AUDIT_BINDING_0001/,
    );
    assert.equal(coordinator.status, 'BROKEN');
    assert.equal((await store.load()).revision, '2');

    audit.binding.close();
    await store.close();
    store = await openCapsuleStateStore(join(root, 'state'));
    audit = openAudit(root, '2', identity);
    await assert.rejects(
      () => openDurableCapsuleCoordinator(store, '2', 200, audit.binding),
      /DOSAI_CAPSULE_COORDINATOR_CONTINUITY_0001/,
    );
  } finally {
    await closeFixture(root, store, audit);
  }
});

test('an acknowledged transition with an uncertain caller result is accepted on restart', async () => {
  const root = await rootFixture();
  let store = await openCapsuleStateStore(join(root, 'state'));
  let audit = openAudit(root, '1');
  try {
    const uncertainBinding = Object.freeze({
      verifyCurrent: audit.binding.verifyCurrent,
      async bindTransition(previous, current, transition) {
        const acknowledgement = await audit.binding.bindTransition(previous, current, transition);
        if (current.revision === '2') throw new Error('INJECTED_RESULT_LOSS');
        return acknowledgement;
      },
    });
    const coordinator = (
      await openDurableCapsuleCoordinator(store, '1', 100, uncertainBinding)
    ).coordinator;
    await assert.rejects(
      () => coordinator.register(request(), 101),
      /DOSAI_CAPSULE_COORDINATOR_AUDIT_BINDING_0001/,
    );
    const identity = audit.journal.identity;
    audit.binding.close();
    audit.journal.close();
    await store.close();

    store = await openCapsuleStateStore(join(root, 'state'));
    audit = openAudit(root, '2', identity);
    const reopened = await openDurableCapsuleCoordinator(store, '2', 200, audit.binding);
    assert.equal(reopened.coordinator.status, 'READY');
    assert.equal(reopened.coordinator.durableRevision, '3');
    assert.equal((await store.load()).supervisor_generation, '2');
  } finally {
    await closeFixture(root, store, audit);
  }
});

test('emergency stop reduces state before audit failure and leaves a blocked gap', async () => {
  const root = await rootFixture();
  let store = await openCapsuleStateStore(join(root, 'state'));
  let audit = openAudit(root, '1');
  try {
    const coordinator = (
      await openDurableCapsuleCoordinator(store, '1', 100, audit.binding)
    ).coordinator;
    const candidate = request();
    await coordinator.register(candidate, 101);
    const identity = audit.journal.identity;
    audit.journal.close();

    const outcome = await coordinator.emergencyStop(102);
    assert.equal(outcome.results[0].state, 'STOPPED');
    assert.equal(outcome.persistence, 'FAILED');
    assert.equal(outcome.coordinatorStatus, 'BROKEN');
    assert.equal((await store.load()).records[0].state, 'STOPPED');

    audit.binding.close();
    await store.close();
    store = await openCapsuleStateStore(join(root, 'state'));
    audit = openAudit(root, '2', identity);
    await assert.rejects(
      () => openDurableCapsuleCoordinator(store, '2', 200, audit.binding),
      /DOSAI_CAPSULE_COORDINATOR_CONTINUITY_0001/,
    );
  } finally {
    await closeFixture(root, store, audit);
  }
});

test('binding admission rejects credential misuse and authenticated discontinuity', async () => {
  const root = await rootFixture();
  const audit = openAudit(root, '1');
  try {
    assert.deepEqual(Object.keys(audit.binding).sort(), ['bindTransition', 'close', 'verifyCurrent']);
    assert.throws(
      () => createCapsuleRegistryAuditBinding(audit.journal, {
        sourceGeneration: '1',
        authenticationToken: new Uint8Array(32),
      }),
      /DOSAI_CAPSULE_AUDIT_BINDING_AUTH_0001/,
    );

    appendManualEvent(audit, {
      registry_schema_id: 'urn:dosai:schema:capsule-registry:1',
      registry_schema_version: 1,
      supervisor_generation: '1',
      revision: '2',
      previous_registry_digest: null,
      registry_digest: { algorithm: 'SHA-256', value: 'a'.repeat(64) },
      transition: 'REGISTER',
    });
    await assert.rejects(
      () => audit.binding.verifyCurrent(null),
      (error) => error instanceof CapsuleRegistryAuditBindingFailure &&
        error.code === 'DOSAI_CAPSULE_AUDIT_BINDING_CONTINUITY_0001',
    );
  } finally {
    audit.binding.close();
    audit.journal.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('authenticated duplicate revisions and recovery-gap events block continuity', async () => {
  const duplicateRoot = await rootFixture();
  const duplicateAudit = openAudit(duplicateRoot, '1');
  try {
    appendManualEvent(duplicateAudit, {
      registry_schema_id: 'urn:dosai:schema:capsule-registry:1',
      registry_schema_version: 1,
      supervisor_generation: '1',
      revision: '1',
      previous_registry_digest: null,
      registry_digest: { algorithm: 'SHA-256', value: 'a'.repeat(64) },
      transition: 'INITIALIZE',
    });
    appendManualEvent(duplicateAudit, {
      registry_schema_id: 'urn:dosai:schema:capsule-registry:1',
      registry_schema_version: 1,
      supervisor_generation: '1',
      revision: '1',
      previous_registry_digest: { algorithm: 'SHA-256', value: 'a'.repeat(64) },
      registry_digest: { algorithm: 'SHA-256', value: 'b'.repeat(64) },
      transition: 'REGISTER',
    });
    await assert.rejects(
      () => duplicateAudit.binding.verifyCurrent(null),
      /DOSAI_CAPSULE_AUDIT_BINDING_CONTINUITY_0001/,
    );
  } finally {
    duplicateAudit.binding.close();
    duplicateAudit.journal.close();
    await rm(duplicateRoot, { recursive: true, force: true });
  }

  const gapRoot = await rootFixture();
  const gapAudit = openAudit(gapRoot, '1');
  try {
    appendManualEvent(gapAudit, {
      registry_schema_id: 'urn:dosai:schema:capsule-registry:1',
      registry_schema_version: 1,
      supervisor_generation: '1',
      revision: '1',
      last_bound_registry_digest: null,
      registry_digest: { algorithm: 'SHA-256', value: 'a'.repeat(64) },
      reason: 'STATE_COMMITTED_AUDIT_UNKNOWN',
    }, 'CAPSULE_REGISTRY_RECOVERY_GAP');
    await assert.rejects(
      () => gapAudit.binding.verifyCurrent(null),
      /DOSAI_CAPSULE_AUDIT_BINDING_CONTINUITY_0001/,
    );
  } finally {
    gapAudit.binding.close();
    gapAudit.journal.close();
    await rm(gapRoot, { recursive: true, force: true });
  }
});
