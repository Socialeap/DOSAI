import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import test from 'node:test';

import {
  AUDIT_SCHEMA_IDS,
  admitAuditAcknowledgement,
  admitAuditEvent,
  admitAuditEventProposal,
  canonicalAuditJson,
} from '../../native-helpers/audit/contracts.ts';
import { createSchemaValidator, requireValid } from '../../tools/dosai-acceptance/src/schema-validator.mjs';

const root = resolve(import.meta.dirname, '../..');
const commonSchema = 'docs/architecture/schemas/v1/common.schema.json';
const schemaPaths = [
  'docs/architecture/schemas/v1/audit-event-proposal.schema.json',
  'docs/architecture/schemas/v1/audit-event.schema.json',
  'docs/architecture/schemas/v1/audit-acknowledgement.schema.json',
];
const validator = await createSchemaValidator(root, [commonSchema, ...schemaPaths]);

const ids = Object.freeze({
  acknowledgement: '59ce7a65-bb5f-4b0d-84af-e5f74e14d857',
  boot: '65487b1e-9a47-4330-91da-4ed55b367b09',
  epoch: '92adcc3e-f3c8-4df7-a8bf-bb9b85047acd',
  event: 'e609683b-d3af-4790-8afe-4d6281a32e68',
  journal: '3ce5fc80-4191-4a49-93ff-d18b21e51e51',
  probe: '25f628e3-e181-49f3-878c-eeaeaa871076',
  request: '0872a205-7b0e-49c6-80fc-1cbb0d63cde2',
  trace: '3a7c965d-d898-4d58-98c0-cb44f154a623',
  writer: '58ec70b4-abd5-4d6b-bbb6-b8eca11014fa',
});
const digest = Object.freeze({ algorithm: 'SHA-256', value: 'a'.repeat(64) });

const proposal = Object.freeze({
  schema_id: AUDIT_SCHEMA_IDS.proposal,
  schema_version: 1,
  message_id: ids.request,
  created_at: '2026-07-31T22:46:28.000Z',
  producer: 'dosai.policy',
  producer_generation: '1',
  trace_id: ids.trace,
  data_class: 'D1',
  event_kind: 'SYNTHETIC_AUDIT_PROBE',
  payload: Object.freeze({
    probe_id: ids.probe,
    outcome: 'PASS',
    policy_decision_digest: digest,
  }),
});

const event = Object.freeze({
  schema_id: AUDIT_SCHEMA_IDS.event,
  schema_version: 1,
  message_id: ids.event,
  created_at: '2026-07-31T22:46:29.000Z',
  producer: 'dosai.audit-writer',
  producer_generation: '1',
  trace_id: ids.trace,
  data_class: 'D1',
  algorithm_suite: 'DOSAI-JOURNAL-SHA256-JCS-V1',
  journal_id: ids.journal,
  journal_epoch_id: ids.epoch,
  boot_id: ids.boot,
  writer_epoch_id: ids.writer,
  sequence: '2',
  source: Object.freeze({
    source_id: 'dosai.policy',
    source_generation: '1',
    provenance: 'DETERMINISTIC_DERIVATION',
  }),
  observed_at: proposal.created_at,
  wall_clock_uncertainty_ms: 5,
  monotonic_ms: '12',
  previous_event_hash: Object.freeze({ algorithm: 'SHA-256', value: 'b'.repeat(64) }),
  request_message_id: proposal.message_id,
  request_digest: digest,
  acknowledgement_message_id: ids.acknowledgement,
  event_kind: proposal.event_kind,
  payload: proposal.payload,
});

const acknowledgement = Object.freeze({
  schema_id: AUDIT_SCHEMA_IDS.acknowledgement,
  schema_version: 1,
  message_id: ids.acknowledgement,
  created_at: event.created_at,
  producer: 'dosai.audit-writer',
  producer_generation: '1',
  trace_id: ids.trace,
  data_class: 'D1',
  request_message_id: proposal.message_id,
  journal_id: ids.journal,
  journal_epoch_id: ids.epoch,
  sequence: '2',
  event_hash: digest,
  durability: 'SQLITE_DELETE_EXTRA_FULLFSYNC',
  assurance: 'LOCAL_DURABLE',
});

test('registry v7 defines only the three synchronized audit contracts', async () => {
  const [v6Bytes, v6, v7] = await Promise.all([
    readFile(join(root, 'docs/architecture/schema-registry-v6.json')),
    readFile(join(root, 'docs/architecture/schema-registry-v6.json'), 'utf8').then(JSON.parse),
    readFile(join(root, 'docs/architecture/schema-registry-v7.json'), 'utf8').then(JSON.parse),
  ]);
  assert.equal(
    createHash('sha256').update(v6Bytes).digest('hex'),
    'da06e0643ce17eaa8f081679667759433e53dc026264118632382ab9b5c7aa42',
  );
  assert.equal(v7.registry_id, 'urn:dosai:schema-registry:7');
  assert.equal(v7.supersedes, v6.registry_id);
  assert.equal(v7.status, 'ACCEPTED');

  const previous = new Map(v6.schemas.map((schema) => [schema.name, schema]));
  const changed = v7.schemas
    .filter((schema) => JSON.stringify(previous.get(schema.name)) !== JSON.stringify(schema))
    .map(({ name }) => name);
  assert.deepEqual(changed, ['audit-event-proposal', 'audit-event', 'audit-acknowledgement']);
  assert.equal(v7.schemas.find(({ name }) => name === 'audit-checkpoint').state, 'RESERVED');
});

test('proposal, canonical event, and durable acknowledgement validate strictly', () => {
  requireValid(validator, AUDIT_SCHEMA_IDS.proposal, proposal);
  requireValid(validator, AUDIT_SCHEMA_IDS.event, event);
  requireValid(validator, AUDIT_SCHEMA_IDS.acknowledgement, acknowledgement);

  assert.equal(canonicalAuditJson(admitAuditEventProposal(proposal)), canonicalAuditJson(proposal));
  assert.equal(canonicalAuditJson(admitAuditEvent(event)), canonicalAuditJson(event));
  assert.equal(
    canonicalAuditJson(admitAuditAcknowledgement(acknowledgement)),
    canonicalAuditJson(acknowledgement),
  );
});

test('audit contracts reject authority, provenance, durability, and payload spoofing', () => {
  const invalid = [
    [AUDIT_SCHEMA_IDS.proposal, { ...proposal, sequence: '1' }],
    [AUDIT_SCHEMA_IDS.proposal, { ...proposal, payload: { ...proposal.payload, secret: 'canary' } }],
    [AUDIT_SCHEMA_IDS.proposal, { ...proposal, event_kind: 'GENERIC_LOG' }],
    [AUDIT_SCHEMA_IDS.event, {
      ...event,
      event_kind: 'WRITER_EPOCH_STARTED',
      source: { ...event.source, provenance: 'OWNER_APPROVAL' },
      payload: { previous_writer_epoch_id: null },
    }],
    [AUDIT_SCHEMA_IDS.event, { ...event, previous_event_hash: { algorithm: 'SHA-256', value: 'x'.repeat(64) } }],
    [AUDIT_SCHEMA_IDS.acknowledgement, { ...acknowledgement, durability: 'BEST_EFFORT' }],
    [AUDIT_SCHEMA_IDS.acknowledgement, { ...acknowledgement, assurance: 'ANCHORED' }],
  ];

  for (const [schemaId, candidate] of invalid) {
    assert.equal(validator.getSchema(schemaId)?.(candidate), false, schemaId);
  }
});

test('runtime admission is detached, frozen, canonical, and accessor-safe', () => {
  const mutable = structuredClone(proposal);
  const admitted = admitAuditEventProposal(mutable);
  mutable.payload.outcome = 'DENIED';
  assert.equal(admitted.payload.outcome, 'PASS');
  assert.ok(Object.isFrozen(admitted));
  assert.ok(Object.isFrozen(admitted.payload));
  assert.equal(canonicalAuditJson(admitted), canonicalAuditJson(JSON.parse(canonicalAuditJson(admitted))));

  let getterCalls = 0;
  const hostile = { ...proposal };
  Object.defineProperty(hostile, 'payload', {
    enumerable: true,
    get() {
      getterCalls += 1;
      return proposal.payload;
    },
  });
  assert.throws(() => admitAuditEventProposal(hostile), /DOSAI_AUDIT_SCHEMA_0001/);
  assert.equal(getterCalls, 0);
});
