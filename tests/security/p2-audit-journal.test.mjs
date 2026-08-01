import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { chmod, link, mkdtemp, readFile, realpath, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import * as auditJournalModule from '../../native-helpers/audit/journal.ts';
import {
  AuditJournalFailure,
  openAuditJournal,
  verifyAuditJournal,
} from '../../native-helpers/audit/journal.ts';

function authenticationToken(label) {
  const bytes = new TextEncoder().encode(label.padEnd(32, '_').slice(0, 32));
  assert.equal(bytes.byteLength, 32);
  assert.equal(Object.getPrototypeOf(bytes), Uint8Array.prototype);
  return bytes;
}

const policyToken = authenticationToken('DOSAI_SECRET_CANARY_AUTH_TOKEN');
const ownerToken = authenticationToken('DOSAI_OWNER_AUTH_CANARY_TOKEN');
const sources = Object.freeze([
  Object.freeze({
    sourceId: 'dosai.policy',
    sourceGeneration: '1',
    provenance: 'DETERMINISTIC_DERIVATION',
    wallClockUncertaintyMs: 5,
    authenticationToken: policyToken,
  }),
  Object.freeze({
    sourceId: 'dosai.owner-ui',
    sourceGeneration: '3',
    provenance: 'OWNER_APPROVAL',
    wallClockUncertaintyMs: 10,
    authenticationToken: ownerToken,
  }),
]);

async function createStore() {
  return realpath(await mkdtemp(join(tmpdir(), 'dosai-audit-test-')));
}

function proposal(overrides = {}) {
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
    ...overrides,
  };
}

function assertFailure(code) {
  return (error) => {
    assert.ok(error instanceof AuditJournalFailure);
    assert.equal(error.code, code);
    assert.equal(error.message, code);
    return true;
  };
}

function directDatabase(path) {
  return new DatabaseSync(path, {
    allowExtension: false,
    defensive: false,
    enableDoubleQuotedStringLiterals: false,
    readBigInts: true,
  });
}

test('module exposes only bounded open, verify, and typed failure entry points', () => {
  assert.deepEqual(Object.keys(auditJournalModule).sort(), [
    'AuditJournalFailure',
    'openAuditJournal',
    'verifyAuditJournal',
  ]);
});

test('writer returns a frozen acknowledgement only after a verifiable local-durable commit', async () => {
  const directory = await createStore();
  const path = join(directory, 'audit.sqlite3');
  try {
    const writer = openAuditJournal({ databasePath: path, sources });
    assert.equal('appendWriterEpoch' in writer, false);
    assert.equal(writer.headSequence, '1');
    assert.equal(writer.assurance, 'LOCAL_DURABLE');
    assert.equal(writer.storageProfile, 'SQLITE_DELETE_EXTRA_FULLFSYNC');
    assert.deepEqual(writer.durabilityStatus, {
      journalMode: 'DELETE',
      synchronous: 'EXTRA',
      fullFsync: true,
      checkpointFullFsync: true,
      lockingMode: 'EXCLUSIVE',
    });

    const acknowledgement = writer.append('dosai.policy', policyToken, proposal());
    const identity = writer.identity;
    assert.equal(acknowledgement.sequence, '2');
    assert.equal(acknowledgement.assurance, 'LOCAL_DURABLE');
    assert.ok(Object.isFrozen(acknowledgement));
    assert.ok(Object.isFrozen(acknowledgement.event_hash));
    writer.close();

    const report = verifyAuditJournal(path, identity);
    assert.equal(report.verifiedThroughSequence, '2');
    assert.equal(report.eventCount, 2);
    assert.equal(report.writerEpochCount, 1);
    assert.deepEqual(report.limitations, [
      'UNSIGNED',
      'UNANCHORED',
      'LOCAL_ROLLBACK_NOT_DETECTABLE',
    ]);

    const bytes = await readFile(path);
    assert.equal(bytes.includes(Buffer.from('DOSAI_SECRET_CANARY_AUTH_TOKEN')), false);
    assert.equal(bytes.includes(Buffer.from('DOSAI_OWNER_AUTH_CANARY_TOKEN')), false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('authentication, source generation, provenance, and authority fields fail closed', async () => {
  const directory = await createStore();
  const path = join(directory, 'audit.sqlite3');
  try {
    const writer = openAuditJournal({ databasePath: path, sources });
    const forged = authenticationToken('FORGED_AUTHENTICATION_TOKEN');
    assert.throws(
      () => writer.append('dosai.policy', forged, proposal()),
      assertFailure('DOSAI_AUDIT_AUTH_0001'),
    );
    assert.throws(
      () => writer.append('dosai.policy', policyToken, proposal({ producer: 'dosai.owner-ui' })),
      assertFailure('DOSAI_AUDIT_AUTH_0001'),
    );
    assert.throws(
      () => writer.append('dosai.policy', policyToken, proposal({ producer_generation: '2' })),
      assertFailure('DOSAI_AUDIT_AUTH_0001'),
    );
    assert.throws(
      () => writer.append('dosai.policy', policyToken, proposal({ sequence: '1' })),
      /DOSAI_AUDIT_SCHEMA_0001/,
    );
    assert.throws(
      () => writer.append('dosai.policy', policyToken, proposal({ provenance: 'OWNER_APPROVAL' })),
      /DOSAI_AUDIT_SCHEMA_0001/,
    );
    assert.throws(
      () => writer.append('dosai.policy', policyToken, proposal({ secret: 'NEVER_PERSIST_THIS_CANARY' })),
      /DOSAI_AUDIT_SCHEMA_0001/,
    );
    assert.equal(writer.headSequence, '1');
    writer.close();

    const bytes = await readFile(path);
    assert.equal(bytes.includes(Buffer.from('NEVER_PERSIST_THIS_CANARY')), false);
    assert.equal(bytes.includes(Buffer.from('FORGED_AUTHENTICATION_TOKEN')), false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('request identity is idempotent and changed replay is rejected', async () => {
  const directory = await createStore();
  const path = join(directory, 'audit.sqlite3');
  try {
    const writer = openAuditJournal({ databasePath: path, sources });
    const request = proposal();
    const first = writer.append('dosai.policy', policyToken, request);
    const repeated = writer.append('dosai.policy', policyToken, structuredClone(request));
    assert.deepEqual(repeated, first);
    assert.equal(writer.headSequence, '2');
    assert.deepEqual(
      writer.lookupAcknowledgement('dosai.policy', policyToken, request.message_id),
      first,
    );
    assert.throws(
      () => writer.append('dosai.policy', policyToken, {
        ...request,
        payload: { ...request.payload, outcome: 'DENIED' },
      }),
      assertFailure('DOSAI_AUDIT_REPLAY_0001'),
    );
    assert.throws(
      () => writer.lookupAcknowledgement('dosai.owner-ui', ownerToken, request.message_id),
      assertFailure('DOSAI_AUDIT_AUTH_0001'),
    );
    writer.close();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('distinct authenticated sources receive one contiguous writer-owned sequence', async () => {
  const directory = await createStore();
  const path = join(directory, 'audit.sqlite3');
  try {
    const writer = openAuditJournal({ databasePath: path, sources });
    const acknowledgements = [];
    for (let index = 0; index < 20; index += 1) {
      const owner = index % 2 === 1;
      acknowledgements.push(writer.append(
        owner ? 'dosai.owner-ui' : 'dosai.policy',
        owner ? ownerToken : policyToken,
        proposal(owner ? { producer: 'dosai.owner-ui', producer_generation: '3' } : {}),
      ));
    }
    assert.deepEqual(
      acknowledgements.map(({ sequence }) => sequence),
      Array.from({ length: 20 }, (_, index) => String(index + 2)),
    );
    const identity = writer.identity;
    writer.close();
    assert.equal(verifyAuditJournal(path, identity).verifiedThroughSequence, '21');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('restart creates an explicit writer epoch linked to the previously verified head', async () => {
  const directory = await createStore();
  const path = join(directory, 'audit.sqlite3');
  try {
    const firstWriter = openAuditJournal({ databasePath: path, sources });
    firstWriter.append('dosai.policy', policyToken, proposal());
    const firstEpoch = firstWriter.writerEpochId;
    const identity = firstWriter.identity;
    firstWriter.close();

    const secondWriter = openAuditJournal({ databasePath: path, sources, expectedIdentity: identity });
    assert.equal(secondWriter.headSequence, '3');
    assert.notEqual(secondWriter.writerEpochId, firstEpoch);
    secondWriter.append('dosai.policy', policyToken, proposal());
    secondWriter.close();

    const report = verifyAuditJournal(path, identity);
    assert.equal(report.eventCount, 4);
    assert.equal(report.writerEpochCount, 2);
    const database = directDatabase(path);
    const epochEvent = JSON.parse(
      database.prepare('SELECT event_json FROM events WHERE sequence = 3').get().event_json,
    );
    database.close();
    assert.equal(epochEvent.event_kind, 'WRITER_EPOCH_STARTED');
    assert.equal(epochEvent.payload.previous_writer_epoch_id, firstEpoch);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('exclusive storage ownership rejects a second writer without harming the first', async () => {
  const directory = await createStore();
  const path = join(directory, 'audit.sqlite3');
  let writer;
  try {
    writer = openAuditJournal({ databasePath: path, sources });
    assert.throws(
      () => openAuditJournal({ databasePath: path, sources, expectedIdentity: writer.identity }),
      assertFailure('DOSAI_AUDIT_CONCURRENCY_0001'),
    );
    assert.throws(
      () => verifyAuditJournal(path, writer.identity),
      assertFailure('DOSAI_AUDIT_CONCURRENCY_0001'),
    );
    assert.equal(writer.append('dosai.policy', policyToken, proposal()).sequence, '2');
    writer.close();
    writer = undefined;
  } finally {
    writer?.close();
    await rm(directory, { recursive: true, force: true });
  }
});

for (const mutation of [
  {
    name: 'payload mutation',
    sql: `UPDATE events SET event_json = replace(event_json, '"PASS"', '"DENIED"') WHERE sequence = 2`,
  },
  {
    name: 'acknowledgement rebinding',
    sql: `UPDATE events SET acknowledgement_json = replace(acknowledgement_json, '"producer_generation":"1"', '"producer_generation":"9"') WHERE sequence = 2`,
  },
  {
    name: 'partial event record',
    sql: 'UPDATE events SET event_json = substr(event_json, 1, length(event_json) - 1) WHERE sequence = 2',
  },
  {
    name: 'acknowledgement truncation',
    sql: 'UPDATE events SET acknowledgement_json = substr(acknowledgement_json, 1, length(acknowledgement_json) - 1) WHERE sequence = 2',
  },
  { name: 'event deletion', sql: 'DELETE FROM events WHERE sequence = 2' },
  { name: 'sequence reorder', sql: 'UPDATE events SET sequence = 99 WHERE sequence = 2' },
]) {
  test(`verification and startup reject ${mutation.name} without repairing history`, async () => {
    const directory = await createStore();
    const path = join(directory, 'audit.sqlite3');
    try {
      const writer = openAuditJournal({ databasePath: path, sources });
      writer.append('dosai.policy', policyToken, proposal());
      const identity = writer.identity;
      writer.close();

      const attacker = directDatabase(path);
      attacker.exec('PRAGMA ignore_check_constraints = ON');
      attacker.exec(mutation.sql);
      const mutatedRows = attacker.prepare('SELECT sequence, event_json FROM events ORDER BY sequence').all();
      attacker.close();

      assert.throws(
        () => verifyAuditJournal(path, identity),
        assertFailure('DOSAI_AUDIT_INTEGRITY_0001'),
      );
      assert.throws(
        () => openAuditJournal({ databasePath: path, sources, expectedIdentity: identity }),
        assertFailure('DOSAI_AUDIT_INTEGRITY_0001'),
      );

      const inspection = directDatabase(path);
      assert.deepEqual(
        inspection.prepare('SELECT sequence, event_json FROM events ORDER BY sequence').all(),
        mutatedRows,
      );
      inspection.close();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
}

test('a fully rolled-back valid prefix remains explicitly outside local assurance', async () => {
  const directory = await createStore();
  const path = join(directory, 'audit.sqlite3');
  try {
    const writer = openAuditJournal({ databasePath: path, sources });
    writer.append('dosai.policy', policyToken, proposal());
    const identity = writer.identity;
    writer.close();

    const attacker = directDatabase(path);
    const prefix = attacker.prepare(
      'SELECT event_hash, event_json FROM events WHERE sequence = 1',
    ).get();
    const prefixEvent = JSON.parse(prefix.event_json);
    attacker.exec('BEGIN IMMEDIATE');
    attacker.prepare('DELETE FROM events WHERE sequence > 1').run();
    attacker.prepare(
      `UPDATE journal_state
       SET head_sequence = 1, head_hash = ?, latest_writer_epoch_id = ?, latest_boot_id = ?
       WHERE singleton = 1`,
    ).run(prefix.event_hash, prefixEvent.writer_epoch_id, prefixEvent.boot_id);
    attacker.exec('COMMIT');
    attacker.close();

    const report = verifyAuditJournal(path, identity);
    assert.equal(report.verifiedThroughSequence, '1');
    assert.ok(report.limitations.includes('LOCAL_ROLLBACK_NOT_DETECTABLE'));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('a commit-result failure becomes BROKEN and is reconciled by request identity', async () => {
  const directory = await createStore();
  const path = join(directory, 'audit.sqlite3');
  const originalExec = DatabaseSync.prototype.exec;
  let armed = false;
  let writer;
  try {
    writer = openAuditJournal({ databasePath: path, sources });
    const identity = writer.identity;
    const request = proposal();
    DatabaseSync.prototype.exec = function simulatedUnknownCommit(sql) {
      if (armed && sql === 'COMMIT') {
        armed = false;
        originalExec.call(this, sql);
        throw Object.assign(new Error('simulated commit acknowledgement loss'), {
          code: 'SQLITE_IOERR_FSYNC',
        });
      }
      return originalExec.call(this, sql);
    };
    armed = true;
    assert.throws(
      () => writer.append('dosai.policy', policyToken, request),
      assertFailure('DOSAI_AUDIT_COMMIT_UNKNOWN_0001'),
    );
    assert.equal(writer.assurance, 'BROKEN');
    DatabaseSync.prototype.exec = originalExec;

    const recovered = openAuditJournal({ databasePath: path, sources, expectedIdentity: identity });
    const acknowledgement = recovered.lookupAcknowledgement(
      'dosai.policy',
      policyToken,
      request.message_id,
    );
    assert.equal(acknowledgement.sequence, '2');
    assert.equal(recovered.headSequence, '3');
    recovered.close();
    writer = undefined;
  } finally {
    DatabaseSync.prototype.exec = originalExec;
    writer?.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('storage exhaustion returns no acknowledgement and preserves the last committed chain', async () => {
  const directory = await createStore();
  const path = join(directory, 'audit.sqlite3');
  let writer;
  try {
    const initial = openAuditJournal({ databasePath: path, sources });
    const identity = initial.identity;
    initial.close();
    const inspection = directDatabase(path);
    const initialPageCount = Number(inspection.prepare('PRAGMA page_count').get().page_count);
    inspection.close();

    writer = openAuditJournal({
      databasePath: path,
      sources,
      expectedIdentity: identity,
      maximumPageCount: initialPageCount + 8,
    });
    let failure;
    let successful = 0;
    for (let index = 0; index < 500 && failure === undefined; index += 1) {
      try {
        writer.append('dosai.policy', policyToken, proposal());
        successful += 1;
      } catch (error) {
        failure = error;
      }
    }
    assert.ok(successful > 0);
    assertFailure('DOSAI_AUDIT_PERSISTENCE_0001')(failure);
    assert.equal(writer.assurance, 'BROKEN');
    const report = verifyAuditJournal(path, identity);
    assert.equal(report.eventCount, successful + 2);
    assert.equal(report.verifiedThroughSequence, String(successful + 2));
    writer = undefined;
  } finally {
    writer?.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('store identity and canonical owner-only paths are mandatory', async () => {
  const directory = await createStore();
  const path = join(directory, 'audit.sqlite3');
  try {
    const writer = openAuditJournal({ databasePath: path, sources });
    const identity = writer.identity;
    writer.close();

    assert.throws(
      () => openAuditJournal({
        databasePath: join(directory, 'duplicate-token.sqlite3'),
        sources: [
          sources[0],
          { ...sources[1], authenticationToken: policyToken },
        ],
      }),
      assertFailure('DOSAI_AUDIT_PRECONDITION_0001'),
    );

    assert.throws(
      () => openAuditJournal({ databasePath: path, sources }),
      assertFailure('DOSAI_AUDIT_PRECONDITION_0001'),
    );
    assert.throws(
      () => openAuditJournal({
        databasePath: path,
        sources,
        expectedIdentity: { ...identity, journalId: randomUUID() },
      }),
      assertFailure('DOSAI_AUDIT_INTEGRITY_0001'),
    );

    const symlinkPath = join(directory, 'audit-link.sqlite3');
    await symlink(path, symlinkPath);
    assert.throws(
      () => verifyAuditJournal(symlinkPath, identity),
      assertFailure('DOSAI_AUDIT_PRECONDITION_0001'),
    );

    const hardlinkPath = join(directory, 'audit-hardlink.sqlite3');
    await link(path, hardlinkPath);
    assert.throws(
      () => openAuditJournal({ databasePath: hardlinkPath, sources, expectedIdentity: identity }),
      assertFailure('DOSAI_AUDIT_PRECONDITION_0001'),
    );

    const permissiveDirectory = await createStore();
    await chmod(permissiveDirectory, 0o755);
    assert.throws(
      () => openAuditJournal({
        databasePath: join(permissiveDirectory, 'audit.sqlite3'),
        sources,
      }),
      assertFailure('DOSAI_AUDIT_PRECONDITION_0001'),
    );
    await chmod(permissiveDirectory, 0o700);
    await rm(permissiveDirectory, { recursive: true, force: true });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
