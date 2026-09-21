import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { lstat, mkdtemp, readFile, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  openAuditJournal,
  verifyAuditJournal,
} from '../../../native-helpers/audit/journal.ts';
import { runFixed } from './fixed-process.mjs';

const suiteGroups = Object.freeze({
  'P2-AT-001': Object.freeze([
    Object.freeze({
      assertions: Object.freeze([
        'P2_POLICY_TIER_MATRIX_VERIFIED',
        'P2_POLICY_TYPED_ADMISSION_VERIFIED',
        'P2_POLICY_NEGATIVE_CORPUS_REJECTED',
      ]),
      id: 'P2_POLICY_CORPUS_FIXED',
      tests: Object.freeze([
        'tests/security/p2-policy.test.mjs',
        'tests/governance/p2-immutable-contracts.test.mjs',
      ]),
    }),
  ]),
  'P2-AT-002': Object.freeze([
    Object.freeze({
      assertions: Object.freeze([
        'P2_APPROVAL_PLAN_BINDING_VERIFIED',
        'P2_GRANT_SINGLE_USE_VERIFIED',
        'P2_AUTHORIZATION_NEGATIVE_CORPUS_REJECTED',
        'P2_BLACK_TIER_DENIED',
        'P2_EMERGENCY_STOP_INDEPENDENT_VERIFIED',
        'P2_NO_EFFECT_AUTHORITY_VERIFIED',
      ]),
      id: 'P2_AUTHORIZATION_CORPUS_FIXED',
      tests: Object.freeze([
        'tests/security/p2-synthetic-authorization.test.mjs',
        'tests/governance/p2-authorization-contracts.test.mjs',
      ]),
    }),
  ]),
  'P2-AT-003': Object.freeze([
    Object.freeze({
      assertions: Object.freeze([
        'P2_AUDIT_DURABILITY_FAULTS_VERIFIED',
        'P2_AUDIT_RESTART_AND_RACE_VERIFIED',
      ]),
      id: 'P2_AUDIT_FAULT_CORPUS_FIXED',
      tests: Object.freeze([
        'tests/security/p2-audit-journal.test.mjs',
        'tests/governance/p2-audit-contracts.test.mjs',
      ]),
    }),
    Object.freeze({
      assertions: Object.freeze([
        'P2_CHECKPOINT_KEY_AND_FORK_FAULTS_VERIFIED',
        'P2_ASSURANCE_RANGES_VERIFIED',
      ]),
      id: 'P2_CHECKPOINT_FAULT_CORPUS_FIXED',
      tests: Object.freeze([
        'tests/security/p2-checkpoint.test.mjs',
        'tests/governance/p2-checkpoint-contracts.test.mjs',
      ]),
    }),
    Object.freeze({
      assertions: Object.freeze([
        'P2_OFFLINE_ANCHOR_VERIFIER_CORPUS_VERIFIED',
      ]),
      id: 'P2_OFFLINE_ANCHOR_CORPUS_FIXED',
      tests: Object.freeze([
        'tests/security/p2-rekor-v2.test.mjs',
        'tests/security/p2-rekor-tuf.test.mjs',
      ]),
    }),
    Object.freeze({
      assertions: Object.freeze([
        'P2_ASSURANCE_OUTAGE_DENIES_AUTHORIZATION',
        'P2_EMERGENCY_STOP_AUDIT_INDEPENDENT_VERIFIED',
      ]),
      id: 'P2_DEGRADED_AUTHORIZATION_CORPUS_FIXED',
      tests: Object.freeze([
        'tests/security/p2-synthetic-authorization.test.mjs',
      ]),
    }),
  ]),
});

function childEnvironment() {
  const environment = {};
  for (const name of ['HOME', 'LANG', 'LC_ALL', 'PATH', 'TMPDIR']) {
    if (process.env[name] !== undefined) {
      environment[name] = process.env[name];
    }
  }
  return environment;
}

function addResult(results, id, pass) {
  results.set(id, Object.freeze({ pass }));
}

function digest(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

async function corpusEntry(root, path) {
  return Object.freeze({
    digest: Object.freeze({
      algorithm: 'SHA-256',
      value: createHash('sha256').update(await readFile(join(root, path))).digest('hex'),
    }),
    path,
  });
}

async function createVerifiedJournalProbe(suiteId) {
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'dosai-p2-acceptance-')));
  const databasePath = join(directory, 'audit.sqlite3');
  const secretCanary = `ghp_${randomBytes(14).toString('hex')}`;
  const token = new TextEncoder().encode(secretCanary);
  let writer;
  let cleanup = false;

  try {
    writer = openAuditJournal({
      databasePath,
      sources: [Object.freeze({
        authenticationToken: token,
        provenance: 'DETERMINISTIC_DERIVATION',
        sourceGeneration: '1',
        sourceId: 'dosai.acceptance',
        wallClockUncertaintyMs: 5,
      })],
    });
    const durability = writer.durabilityStatus;
    const acknowledgement = writer.append('dosai.acceptance', token, {
      schema_id: 'urn:dosai:schema:audit-event-proposal:1',
      schema_version: 1,
      message_id: randomUUID(),
      created_at: new Date().toISOString(),
      producer: 'dosai.acceptance',
      producer_generation: '1',
      trace_id: randomUUID(),
      data_class: 'D1',
      event_kind: 'SYNTHETIC_AUDIT_PROBE',
      payload: {
        probe_id: randomUUID(),
        outcome: 'PASS',
        policy_decision_digest: {
          algorithm: 'SHA-256',
          value: digest(`DOSAI:P2:ACCEPTANCE:${suiteId}`),
        },
      },
    });
    const identity = writer.identity;
    writer.close();
    writer = undefined;

    const verification = verifyAuditJournal(databasePath, identity, {
      sequence: acknowledgement.sequence,
      eventHash: acknowledgement.event_hash,
    });
    return Object.freeze({
      journal: Object.freeze({
        assurance: verification.assurance,
        durability_profile: 'SQLITE_DELETE_EXTRA_FULLFSYNC',
        durability,
        event_count: verification.eventCount,
        head_hash: verification.headHash,
        journal_epoch_id: verification.journalEpochId,
        journal_id: verification.journalId,
        limitations: verification.limitations,
        verified_through_sequence: verification.verifiedThroughSequence,
        writer_epoch_count: verification.writerEpochCount,
      }),
      verifier: Object.freeze({
        assurance_ranges: Object.freeze({
          external_anchor: 'DEFERRED_EXTERNAL',
          hardware_key: 'DEFERRED_EXTERNAL',
          local_journal: 'LOCAL_DURABLE',
          offline_anchor_fixture: 'SOFTWARE_TEST_ONLY',
          signed_checkpoint: 'SOFTWARE_TEST_ONLY',
        }),
        local_journal: Object.freeze({
          result: 'PASS',
          verified_through_sequence: verification.verifiedThroughSequence,
        }),
        result: 'PASS_WITH_EXTERNAL_LIMITATIONS',
      }),
      secretCanary,
    });
  } finally {
    writer?.close();
    token.fill(0);
    await rm(directory, { force: true, recursive: true });
    cleanup = await lstat(directory).then(() => false, () => true);
    if (!cleanup) {
      throw new Error('P2_ACCEPTANCE_CLEANUP_FAILED');
    }
  }
}

export async function executeP2Suite(root, suiteId) {
  const groups = suiteGroups[suiteId];
  if (groups === undefined) {
    throw new Error('P2_SUITE_REJECTED');
  }

  const operations = [];
  const corpusManifest = [];
  const results = new Map();
  let errorCode;
  let journal;
  const secretCanaries = [];
  let verifier;

  try {
    for (const group of groups) {
      operations.push(group.id);
      for (const path of group.tests) {
        corpusManifest.push(await corpusEntry(root, path));
      }
      await runFixed(process.execPath, ['--test', ...group.tests], {
        cwd: root,
        env: childEnvironment(),
        timeout: 120_000,
      });
      for (const assertion of group.assertions) {
        addResult(results, assertion, true);
      }
    }

    operations.push('P2_LOCAL_JOURNAL_PROBE_FIXED');
    const probe = await createVerifiedJournalProbe(suiteId);
    journal = probe.journal;
    secretCanaries.push(probe.secretCanary);
    verifier = Object.freeze({
      ...probe.verifier,
      checks: Object.freeze([
        Object.freeze({ id: 'LOCAL_JOURNAL_CHAIN', result: 'PASS' }),
        ...groups.map(({ id }) => Object.freeze({ id, result: 'PASS' })),
      ]),
    });
    addResult(results, 'P2_LOCAL_JOURNAL_PROBE_VERIFIED', true);
    addResult(results, 'P2_CLEANUP_TEMP_STORAGE', true);
  } catch {
    errorCode = 'DOSAI_P2_EXECUTION_FAILED_0001';
  }

  return Object.freeze({
    errorCode,
    corpusManifest: Object.freeze(corpusManifest),
    journal,
    operationTimeoutMs: 120_000,
    operations: Object.freeze(operations),
    results,
    runtime: Object.freeze({
      node: process.versions.node,
      sqlite: process.versions.sqlite,
      v8: process.versions.v8,
    }),
    secretCanaries: Object.freeze(secretCanaries),
    verifier,
  });
}
