import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

import { parseStrictJson } from '../../tools/dosai-acceptance/src/strict-json.mjs';

const root = resolve(import.meta.dirname, '../..');
const readRecord = async path => parseStrictJson(await readFile(resolve(root, path)));

test('v49 NOT_FOUND diagnosis preserves the fail-closed result without inventing a package defect', async () => {
  const record = await readRecord(
    'docs/architecture/p3-v49-not-found-source-diagnosis.json',
  );
  assert.equal(record.status, 'DIAGNOSED_NO_RUNTIME_ACTION');
  assert.equal(record.diagnosis.package_layout_defect_proven, false);
  assert.equal(record.diagnosis.signature_defect_proven, false);
  assert.equal(record.safety_conclusion.registration_occurred, false);
  assert.equal(record.safety_conclusion.unregistration_occurred, false);
  assert.equal(record.safety_conclusion.retry_authorized, false);
  assert.equal(record.authoritative_findings.length, 4);
});

test('v50 proposal admits only clean or first-seen preconditions and retains exact cleanup bounds', async () => {
  const record = await readRecord(
    'docs/architecture/p3-v50-first-registration-successor-proposal.json',
  );
  assert.equal(record.status, 'PROPOSED_FOR_OWNER_AUTHORIZATION');
  assert.deepEqual(
    record.proposed_source_change.initial_statuses_eligible_for_one_registration_attempt,
    ['NOT_REGISTERED', 'NOT_FOUND'],
  );
  assert.deepEqual(
    record.proposed_source_change.initial_statuses_that_stop_without_mutation,
    ['ENABLED', 'REQUIRES_APPROVAL'],
  );
  assert.equal(record.proposed_source_change.register_attempt_limit, 1);
  assert.equal(record.proposed_source_change.unregister_attempt_limit, 1);
  assert.equal(record.proposed_source_change.retry_allowed, false);
  assert.equal(
    record.proposed_source_change.ambiguous_outcome,
    'CLEANUP_UNVERIFIED_STOP_NO_RETRY',
  );
  assert.ok(Object.values(record.authorities).every(value => value === false));
});

test('future physical v50 proof remains separately gated and isolated from production', async () => {
  const record = await readRecord(
    'docs/architecture/p3-v50-first-registration-successor-proposal.json',
  );
  assert.deepEqual(record.future_physical_gate_requirements, {
    new_owner_authorization_required: true,
    exact_successor_commit_required: true,
    preserve_v49_signed_package: true,
    build_new_successor_package: true,
    stage_at_separate_stable_test_application_path: true,
    verify_staged_bytes_and_signatures_before_launch: true,
    app_launch_limit: 1,
    timeout_ms: 15000,
    retry_allowed: false,
    production_path_allowed: false,
    xpc_client_connection_allowed: false,
  });
  assert.equal(
    record.next_gate,
    'EXPLICIT_OWNER_AUTHORIZATION_REQUIRED_FOR_V50_SOURCE_IMPLEMENTATION',
  );
});
