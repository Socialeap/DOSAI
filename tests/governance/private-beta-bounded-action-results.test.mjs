import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

import { parseStrictJson } from '../../tools/dosai-acceptance/src/strict-json.mjs';

const root = resolve(import.meta.dirname, '../..');
const readRecord = async path => parseStrictJson(await readFile(resolve(root, path)));

test('v49 attempt is stopped before launch and cannot be retried implicitly', async () => {
  const record = await readRecord(
    'docs/architecture/p3-v49-service-management-lifecycle-physical-proof-result.json',
  );
  assert.equal(record.status, 'FAILED_CLOSED_REAUTHORIZATION_REQUIRED');
  assert.equal(record.package_result.test_signed, true);
  assert.equal(record.runner_result.attempts, 1);
  assert.equal(record.runner_result.lifecycle_receipt_produced, false);
  assert.equal(record.runner_result.app_launches, 0);
  assert.equal(record.runner_result.retry_performed, false);
  assert.equal(record.containment.further_runtime_action_requires_new_owner_authorization, true);
});

test('trust-root attempt records matched keys but rejects incomplete independent comparison', async () => {
  const record = await readRecord(
    'docs/architecture/p3-debian-archive-trust-root-observation-result.json',
  );
  assert.equal(record.status, 'FAILED_CLOSED_REAUTHORIZATION_REQUIRED');
  assert.equal(record.key_observations.length, 3);
  assert.ok(record.key_observations.every(({ expected_fingerprint_matched }) => (
    expected_fingerprint_matched === true
  )));
  assert.equal(record.independent_reference.comparison_result, 'INCOMPLETE_NO_SUCCESS_RECEIPT');
  assert.equal(record.containment.temporary_bytes_deleted_verified, true);
  assert.equal(record.containment.retry_performed, false);
});

test('GitHub host observation is blocked without creating or dispatching a workflow', async () => {
  const record = await readRecord(
    'docs/architecture/p3-native-builder-host-feasibility-observation-result.json',
  );
  assert.equal(record.status, 'BLOCKED_BEFORE_WORKFLOW_CREATION');
  assert.equal(record.observed_effects.workflow_created, false);
  assert.equal(record.observed_effects.workflow_dispatches, 0);
  assert.equal(record.observed_effects.runner_allocations, 0);
  assert.equal(record.observed_effects.provider_charge_usd, 0);
});
