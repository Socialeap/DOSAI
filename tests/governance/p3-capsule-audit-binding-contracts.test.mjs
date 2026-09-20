import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

import {
  admitAuditEvent,
  admitAuditEventProposal,
  canonicalAuditJson,
} from '../../native-helpers/audit/contracts.ts';
import { createSchemaValidator, requireValid } from '../../tools/dosai-acceptance/src/schema-validator.mjs';

const root = resolve(import.meta.dirname, '../..');
const schemaPaths = [
  'docs/architecture/schemas/v1/common.schema.json',
  'docs/architecture/schemas/v2/audit-event-proposal.schema.json',
  'docs/architecture/schemas/v2/audit-event.schema.json',
];
const validator = await createSchemaValidator(root, schemaPaths);

const digest = (value) => Object.freeze({ algorithm: 'SHA-256', value: value.repeat(64) });
const ids = Object.freeze({
  acknowledgement: 'c772e45c-172d-4d77-b7a6-dbe86c50dc2e',
  boot: '2f0379ea-1bcd-41a0-bf21-a398c93b4e81',
  epoch: '075981aa-7c4e-45a3-b88d-a754bc71f4b2',
  event: '1b46e53d-bdbb-4e4b-83a3-bdb3c3d2b0db',
  journal: '962319c0-46d1-4188-a68d-364686d472ab',
  request: '33a99ef7-a017-491f-9455-d87593b93025',
  trace: '8abf5d55-74ae-4e5c-910d-ea1b7b07c947',
  writer: '2259f2d5-7974-4ee1-ac74-d789bc77f02a',
});

function committedPayload() {
  return {
    registry_schema_id: 'urn:dosai:schema:capsule-registry:1',
    registry_schema_version: 1,
    supervisor_generation: '1',
    revision: '2',
    previous_registry_digest: digest('a'),
    registry_digest: digest('b'),
    transition: 'REGISTER',
  };
}

function proposal(payload = committedPayload()) {
  return {
    schema_id: 'urn:dosai:schema:audit-event-proposal:2',
    schema_version: 2,
    message_id: ids.request,
    created_at: '2026-08-02T20:15:41.000Z',
    producer: 'dosai.capsule-registry',
    producer_generation: '1',
    trace_id: ids.trace,
    data_class: 'D1',
    event_kind: 'CAPSULE_REGISTRY_REVISION_COMMITTED',
    payload,
  };
}

function event(payload = committedPayload()) {
  return {
    schema_id: 'urn:dosai:schema:audit-event:2',
    schema_version: 2,
    message_id: ids.event,
    created_at: '2026-08-02T20:15:42.000Z',
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
    source: {
      source_id: 'dosai.capsule-registry',
      source_generation: '1',
      provenance: 'SUPERVISOR_OBSERVATION',
    },
    observed_at: '2026-08-02T20:15:41.000Z',
    wall_clock_uncertainty_ms: 5,
    monotonic_ms: '12',
    previous_event_hash: digest('c'),
    request_message_id: ids.request,
    request_digest: digest('d'),
    acknowledgement_message_id: ids.acknowledgement,
    event_kind: 'CAPSULE_REGISTRY_REVISION_COMMITTED',
    payload,
  };
}

test('registry v17 preserves immutable v16 and advances only audit events to v2', async () => {
  const v16Bytes = await readFile(resolve(root, 'docs/architecture/schema-registry-v16.json'));
  const v16 = JSON.parse(v16Bytes);
  const v17 = JSON.parse(
    await readFile(resolve(root, 'docs/architecture/schema-registry-v17.json'), 'utf8'),
  );
  assert.equal(
    createHash('sha256').update(v16Bytes).digest('hex'),
    '5fe93957da3af2eea4e1bbdd29034ab42dbe57eac747ff3f5e366eb86368144e',
  );
  assert.equal(v16.status, 'PROPOSED_FOR_OWNER_REVIEW');
  assert.equal(v17.registry_version, 17);
  assert.equal(v17.supersedes, v16.registry_id);
  assert.equal(v17.status, 'ACCEPTED');
  const changed = v17.schemas
    .filter((schema) => JSON.stringify(v16.schemas.find(({ name }) => name === schema.name)) !== JSON.stringify(schema))
    .map(({ name }) => name);
  assert.deepEqual(changed, ['audit-event-proposal', 'audit-event']);
  assert.deepEqual(
    v17.schemas.find(({ name }) => name === 'linux-builder-manifest'),
    v16.schemas.find(({ name }) => name === 'linux-builder-manifest'),
  );
});

test('capsule revision and recovery-gap proposals validate strictly', () => {
  const committed = proposal();
  requireValid(validator, committed.schema_id, committed);
  assert.equal(canonicalAuditJson(admitAuditEventProposal(committed)), canonicalAuditJson(committed));

  const gap = {
    ...proposal(),
    event_kind: 'CAPSULE_REGISTRY_RECOVERY_GAP',
    payload: {
      registry_schema_id: 'urn:dosai:schema:capsule-registry:1',
      registry_schema_version: 1,
      supervisor_generation: '2',
      revision: '7',
      last_bound_registry_digest: digest('a'),
      registry_digest: digest('b'),
      reason: 'STATE_COMMITTED_AUDIT_UNKNOWN',
    },
  };
  requireValid(validator, gap.schema_id, gap);
  assert.equal(canonicalAuditJson(admitAuditEventProposal(gap)), canonicalAuditJson(gap));
});

test('canonical v2 event validates with dedicated source and v1 hash suite', () => {
  const candidate = event();
  requireValid(validator, candidate.schema_id, candidate);
  assert.equal(canonicalAuditJson(admitAuditEvent(candidate)), canonicalAuditJson(candidate));
});

test('v2 admission rejects generic logging, authority spoofing, and payload expansion', () => {
  const invalid = [
    { ...proposal(), producer: 'dosai.main' },
    { ...proposal(), event_kind: 'SYNTHETIC_AUDIT_PROBE' },
    { ...proposal(), payload: { ...committedPayload(), transition: 'LAUNCH' } },
    { ...proposal(), payload: { ...committedPayload(), secret: 'canary' } },
    { ...proposal(), payload: { ...committedPayload(), registry_digest: digest('x') } },
    { ...event(), source: { ...event().source, provenance: 'OWNER_APPROVAL' } },
    { ...event(), source: { ...event().source, source_id: 'dosai.main' } },
    { ...event(), schema_version: 1 },
  ];
  for (const candidate of invalid) {
    const schema = validator.getSchema(candidate.schema_id);
    assert.equal(schema?.(candidate), false, JSON.stringify(schema?.errors));
    assert.throws(
      () => candidate.schema_id.endsWith('proposal:2')
        ? admitAuditEventProposal(candidate)
        : admitAuditEvent(candidate),
      /DOSAI_AUDIT_SCHEMA_0001/,
    );
  }
});
