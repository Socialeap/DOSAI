import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { copyFile, mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import * as checkpointModule from '../../native-helpers/audit/checkpoint.ts';
import {
  CheckpointFailure,
  createSignedAuditCheckpoint,
  createSoftwareCheckpointAuthorityForTesting,
  evaluateAuditAssurance,
  receiptIdentity,
} from '../../native-helpers/audit/checkpoint.ts';
import {
  auditCheckpointDigest,
  verifyAuditCheckpoint,
} from '../../native-helpers/audit/checkpoint-contracts.ts';
import { openAuditJournal } from '../../native-helpers/audit/journal.ts';
import { receiptFixture } from '../support/p2-checkpoint-fixtures.mjs';

function authenticationToken(label) {
  return new TextEncoder().encode(label.padEnd(32, '_').slice(0, 32));
}

const policyToken = authenticationToken('CHECKPOINT_TEST_POLICY_TOKEN');
const sources = Object.freeze([Object.freeze({
  sourceId: 'dosai.policy',
  sourceGeneration: '1',
  provenance: 'DETERMINISTIC_DERIVATION',
  wallClockUncertaintyMs: 5,
  authenticationToken: policyToken,
})]);

function proposal() {
  return {
    schema_id: 'urn:dosai:schema:audit-event-proposal:1',
    schema_version: 1,
    message_id: randomUUID(),
    created_at: new Date().toISOString(),
    producer: 'dosai.policy',
    producer_generation: '1',
    trace_id: randomUUID(),
    data_class: 'D1',
    event_kind: 'SYNTHETIC_AUDIT_PROBE',
    payload: {
      probe_id: randomUUID(),
      outcome: 'PASS',
      policy_decision_digest: { algorithm: 'SHA-256', value: 'a'.repeat(64) },
    },
  };
}

async function journalFixture() {
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'dosai-checkpoint-test-')));
  const databasePath = join(directory, 'audit.sqlite3');
  const writer = openAuditJournal({ databasePath, sources });
  writer.append('dosai.policy', policyToken, proposal());
  const identity = writer.identity;
  writer.close();
  return { directory, databasePath, identity };
}

function failure(code) {
  return (error) => {
    assert.ok(error instanceof CheckpointFailure);
    assert.equal(error.code, code);
    return true;
  };
}

function checkpointOptions(fixture, authority, overrides = {}) {
  return {
    databasePath: fixture.databasePath,
    expectedIdentity: fixture.identity,
    producerGeneration: '1',
    transition: { kind: 'GENESIS', reasonCode: 'INITIAL_INSTALL' },
    activeAuthority: authority,
    expectedPreviousCheckpointDigest: null,
    expectedPreviousAnchorReceiptDigest: null,
    ...overrides,
  };
}

async function advanceJournal(fixture) {
  const writer = openAuditJournal({
    databasePath: fixture.databasePath,
    expectedIdentity: fixture.identity,
    sources,
  });
  writer.append('dosai.policy', policyToken, proposal());
  writer.close();
}

test('checkpoint module exposes no arbitrary-message signing operation', () => {
  assert.deepEqual(Object.keys(checkpointModule).sort(), [
    'CheckpointFailure',
    'createSignedAuditCheckpoint',
    'createSoftwareCheckpointAuthorityForTesting',
    'evaluateAuditAssurance',
    'receiptIdentity',
  ]);
  const authority = createSoftwareCheckpointAuthorityForTesting();
  assert.deepEqual(Object.keys(authority).sort(), ['implementation', 'key']);
  assert.equal('sign' in authority, false);
  assert.equal(authority.key.protection, 'SOFTWARE_BACKED_TEST_ONLY');
  assert.ok(Object.isFrozen(authority));
  assert.ok(Object.isFrozen(authority.key));
});

test('software fixture signs only the freshly verified current journal head', async () => {
  const fixture = await journalFixture();
  try {
    const authority = createSoftwareCheckpointAuthorityForTesting();
    const checkpoint = createSignedAuditCheckpoint(checkpointOptions(fixture, authority));
    assert.equal(checkpoint.sequence, '2');
    assert.equal(checkpoint.transition.kind, 'GENESIS');
    assert.equal(checkpoint.signing_keys[0].protection, 'SOFTWARE_BACKED_TEST_ONLY');
    assert.deepEqual(verifyAuditCheckpoint(checkpoint), checkpoint);
    assert.equal(checkpoint.active_signing_key_id, authority.key.key_id);
    assert.match(auditCheckpointDigest(checkpoint).value, /^[0-9a-f]{64}$/);

    const relabeled = {
      ...checkpoint,
      signing_keys: [{ ...checkpoint.signing_keys[0], protection: 'SECURE_ENCLAVE' }],
    };
    assert.throws(() => verifyAuditCheckpoint(relabeled), /DOSAI_CHECKPOINT_SCHEMA_0001/);
  } finally {
    await rm(fixture.directory, { recursive: true, force: true });
  }
});

test('forged, cloned, and mislabeled signing authorities fail closed', async () => {
  const fixture = await journalFixture();
  try {
    const authority = createSoftwareCheckpointAuthorityForTesting();
    const clones = [
      structuredClone(authority),
      { ...authority },
      { ...authority, key: { ...authority.key, protection: 'SECURE_ENCLAVE' } },
    ];
    for (const candidate of clones) {
      assert.throws(
        () => createSignedAuditCheckpoint(checkpointOptions(fixture, candidate)),
        failure('DOSAI_CHECKPOINT_AUTHORITY_0001'),
      );
    }
  } finally {
    await rm(fixture.directory, { recursive: true, force: true });
  }
});

test('continuity, dual-signed rotation, and explicit recovery enforce key lineage', async () => {
  const fixture = await journalFixture();
  try {
    const firstAuthority = createSoftwareCheckpointAuthorityForTesting();
    const genesis = createSignedAuditCheckpoint(checkpointOptions(fixture, firstAuthority));

    await advanceJournal(fixture);
    const continuity = createSignedAuditCheckpoint(checkpointOptions(fixture, firstAuthority, {
      transition: { kind: 'CONTINUITY', reasonCode: 'PERIODIC' },
      previousCheckpoint: genesis,
      expectedPreviousCheckpointDigest: auditCheckpointDigest(genesis),
    }));
    assert.equal(continuity.transition.previous_signing_key_id, firstAuthority.key.key_id);
    assert.equal(continuity.signatures.length, 1);

    await advanceJournal(fixture);
    assert.throws(
      () => createSignedAuditCheckpoint(checkpointOptions(fixture, firstAuthority, {
        transition: { kind: 'CONTINUITY', reasonCode: 'PERIODIC' },
        previousCheckpoint: genesis,
        expectedPreviousCheckpointDigest: auditCheckpointDigest(genesis),
      })),
      failure('DOSAI_CHECKPOINT_AUTHORITY_0001'),
    );
    const secondAuthority = createSoftwareCheckpointAuthorityForTesting();
    assert.throws(
      () => createSignedAuditCheckpoint(checkpointOptions(fixture, secondAuthority, {
        transition: { kind: 'ROTATION', reasonCode: 'OWNER_ROTATION' },
        previousCheckpoint: continuity,
        expectedPreviousCheckpointDigest: auditCheckpointDigest(continuity),
      })),
      failure('DOSAI_CHECKPOINT_AUTHORITY_0001'),
    );
    const rotation = createSignedAuditCheckpoint(checkpointOptions(fixture, secondAuthority, {
      transition: { kind: 'ROTATION', reasonCode: 'OWNER_ROTATION' },
      previousAuthority: firstAuthority,
      previousCheckpoint: continuity,
      expectedPreviousCheckpointDigest: auditCheckpointDigest(continuity),
    }));
    assert.equal(rotation.signatures.length, 2);
    assert.deepEqual(
      rotation.signatures.map(({ key_id }) => key_id),
      rotation.signing_keys.map(({ key_id }) => key_id),
    );

    await advanceJournal(fixture);
    const recoveryAuthority = createSoftwareCheckpointAuthorityForTesting();
    const recovery = createSignedAuditCheckpoint(checkpointOptions(fixture, recoveryAuthority, {
      transition: { kind: 'RECOVERY', reasonCode: 'KEY_LOSS' },
      previousCheckpoint: rotation,
      expectedPreviousCheckpointDigest: auditCheckpointDigest(rotation),
    }));
    assert.equal(recovery.transition.previous_signing_key_id, secondAuthority.key.key_id);
    assert.equal(recovery.signatures.length, 1);
  } finally {
    await rm(fixture.directory, { recursive: true, force: true });
  }
});

test('stale head, wrong digest, and false genesis lineage are rejected', async () => {
  const fixture = await journalFixture();
  try {
    const authority = createSoftwareCheckpointAuthorityForTesting();
    const genesis = createSignedAuditCheckpoint(checkpointOptions(fixture, authority));
    assert.throws(
      () => createSignedAuditCheckpoint(checkpointOptions(fixture, authority, {
        transition: { kind: 'CONTINUITY', reasonCode: 'PERIODIC' },
        previousCheckpoint: genesis,
        expectedPreviousCheckpointDigest: auditCheckpointDigest(genesis),
      })),
      failure('DOSAI_CHECKPOINT_LINEAGE_0001'),
    );
    assert.throws(
      () => createSignedAuditCheckpoint(checkpointOptions(fixture, authority, {
        expectedPreviousAnchorReceiptDigest: { algorithm: 'SHA-256', value: 'f'.repeat(64) },
      })),
      failure('DOSAI_CHECKPOINT_LINEAGE_0001'),
    );

    await advanceJournal(fixture);
    assert.throws(
      () => createSignedAuditCheckpoint(checkpointOptions(fixture, authority, {
        transition: { kind: 'CONTINUITY', reasonCode: 'PERIODIC' },
        previousCheckpoint: genesis,
        expectedPreviousCheckpointDigest: { algorithm: 'SHA-256', value: 'f'.repeat(64) },
      })),
      failure('DOSAI_CHECKPOINT_LINEAGE_0001'),
    );
  } finally {
    await rm(fixture.directory, { recursive: true, force: true });
  }
});

test('a valid checkpoint from a sibling journal fork is not accepted as an ancestor', async () => {
  const fixture = await journalFixture();
  const forkDirectory = await realpath(await mkdtemp(join(tmpdir(), 'dosai-checkpoint-fork-')));
  const forkPath = join(forkDirectory, 'audit.sqlite3');
  try {
    await copyFile(fixture.databasePath, forkPath);
    const authority = createSoftwareCheckpointAuthorityForTesting();
    const forkWriter = openAuditJournal({
      databasePath: forkPath,
      expectedIdentity: fixture.identity,
      sources,
    });
    forkWriter.append('dosai.policy', policyToken, proposal());
    forkWriter.close();
    const forkCheckpoint = createSignedAuditCheckpoint(checkpointOptions(
      { ...fixture, databasePath: forkPath },
      authority,
    ));

    await advanceJournal(fixture);
    await advanceJournal(fixture);
    assert.throws(
      () => createSignedAuditCheckpoint(checkpointOptions(fixture, authority, {
        transition: { kind: 'CONTINUITY', reasonCode: 'PERIODIC' },
        previousCheckpoint: forkCheckpoint,
        expectedPreviousCheckpointDigest: auditCheckpointDigest(forkCheckpoint),
      })),
      /DOSAI_AUDIT_INTEGRITY_0001/,
    );
  } finally {
    await rm(fixture.directory, { recursive: true, force: true });
    await rm(forkDirectory, { recursive: true, force: true });
  }
});

test('assurance reports exact local, signed, anchored, degraded, and broken ranges', async () => {
  const fixture = await journalFixture();
  try {
    const authority = createSoftwareCheckpointAuthorityForTesting();
    const checkpoint = createSignedAuditCheckpoint(checkpointOptions(fixture, authority));
    const { receipt, trust } = await receiptFixture(checkpoint);
    const common = {
      localDurableThroughSequence: checkpoint.sequence,
      journalBroken: false,
      maximumUnanchoredEvents: 2,
      trustedTimeRequired: false,
      trustedTimeAvailable: false,
    };
    assert.equal(evaluateAuditAssurance(common).state, 'LOCAL_DURABLE');
    assert.equal(evaluateAuditAssurance({ ...common, checkpoint }).state, 'SIGNED_LOCAL_SOFTWARE');
    const anchored = evaluateAuditAssurance({ ...common, checkpoint, receipt, anchorTrust: trust });
    assert.equal(anchored.state, 'ANCHORED');
    assert.equal(anchored.anchoredThroughSequence, checkpoint.sequence);
    assert.equal(anchored.unanchoredEventCount, '0');
    assert.equal(
      evaluateAuditAssurance({
        ...common,
        checkpoint,
        receipt,
        anchorTrust: trust,
        trustedTimeRequired: true,
      }).state,
      'DEGRADED',
    );
    assert.throws(
      () => evaluateAuditAssurance({ ...common, checkpoint, receipt }),
      failure('DOSAI_CHECKPOINT_PRECONDITION_0001'),
    );
    assert.equal(
      evaluateAuditAssurance({
        ...common,
        checkpoint,
        receipt,
        anchorTrust: trust,
        localDurableThroughSequence: String(BigInt(checkpoint.sequence) + 3n),
      }).state,
      'DEGRADED',
    );
    assert.equal(evaluateAuditAssurance({ ...common, journalBroken: true }).state, 'BROKEN');
    assert.match(receiptIdentity(receipt).value, /^[0-9a-f]{64}$/);
  } finally {
    await rm(fixture.directory, { recursive: true, force: true });
  }
});
