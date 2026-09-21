import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

import { parseStrictJson } from '../../tools/dosai-acceptance/src/strict-json.mjs';

const root = resolve(import.meta.dirname, '../..');
const record = parseStrictJson(await readFile(resolve(
  root,
  'docs/architecture/p3-v50-gate-v2-physical-proof-result.json',
)));

test('v50 gate-v2 attempt stopped before every physical effect', () => {
  assert.equal(record.status, 'FAILED_CLOSED_PREFLIGHT_TOOL_PATH_REAUTHORIZATION_REQUIRED');
  assert.equal(record.failure.stage, 'PRE_BUILD_PREFLIGHT');
  assert.equal(record.failure.code, 'PREFLIGHT_EXECUTABLE_NOT_FOUND');
  assert.equal(record.failure.missing_executable, '/usr/bin/test');
  assert.equal(record.failure.physical_proof_attempt_consumed, true);
  assert.equal(record.failure.lifecycle_receipt_produced, false);
  assert.ok(Object.values(record.observed_effects).every(value => value === 0));
});

test('v50 gate-v2 containment preserves artifacts and requires reauthorization', () => {
  assert.equal(record.containment.stopped_before_build, true);
  assert.equal(record.containment.retry_performed, false);
  assert.equal(record.containment.automatic_recovery_performed, false);
  assert.equal(record.containment.preserved_v49_package_present, true);
  assert.equal(record.containment.v50_staged_application_absent, true);
  assert.equal(record.containment.background_item_state, 'UNCHANGED_BY_ATTEMPT');
  assert.equal(record.containment.further_physical_action_requires_new_owner_authorization, true);
  assert.equal(
    record.next_gate,
    'IMPLEMENT_FIXED_SOURCE_PREFLIGHT_THEN_OBTAIN_NEW_EXACT_OWNER_AUTHORIZATION',
  );
});
