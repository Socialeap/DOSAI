import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

import { parseStrictJson } from '../../tools/dosai-acceptance/src/strict-json.mjs';

const root = resolve(import.meta.dirname, '../..');
const readRecord = async path => parseStrictJson(await readFile(resolve(root, path)));
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

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

test('replacement v49 launch fails closed before lifecycle mutation', async () => {
  const record = await readRecord(
    'docs/architecture/p3-v49-service-management-lifecycle-replacement-result.json',
  );
  assert.equal(record.status, 'FAILED_CLOSED_PRECONDITION_NOT_FOUND');
  assert.equal(record.app_launches, 1);
  assert.equal(record.receipt.result, 'PRECONDITION_FAILED');
  assert.equal(record.receipt.observe_attempts, 1);
  assert.equal(record.receipt.register_attempts, 0);
  assert.equal(record.receipt.unregister_attempts, 0);
  assert.equal(record.containment.retry_performed, false);
});

test('corrected Debian observation matches every key and deletes temporary bytes', async () => {
  const record = await readRecord(
    'docs/architecture/p3-debian-archive-trust-root-observation-v2-result.json',
  );
  assert.equal(record.status, 'PASS_READ_ONLY_SOURCE_OBSERVATION');
  assert.equal(record.attempts, 1);
  assert.equal(record.automatic_retries, 0);
  assert.equal(record.key_observations.length, 3);
  assert.ok(record.key_observations.every(({ reference_match }) => reference_match === true));
  assert.ok(record.references.every(({ comparison_passed }) => comparison_passed === true));
  assert.equal(record.containment.temporary_bytes_deleted_verified, true);
  assert.equal(record.containment.key_import_performed, false);
});

test('historical workflow preparation record remains bounded after its source successor', async () => {
  const record = await readRecord(
    'docs/architecture/p3-native-builder-host-workflow-preparation-result.json',
  );
  assert.equal(record.status, 'PREPARED_UNMERGED_NOT_DISPATCHABLE');
  assert.equal(record.workflow.trigger, 'workflow_dispatch');
  assert.equal(record.workflow.permissions, 'NONE');
  assert.equal(record.workflow.maximum_charge_usd, 0);
  assert.equal(record.workflow.sha256, '04c1220cf1d6919c663aa678cc8ab51a05e2478ea4a99fa88ce6aa342b2830d3');
  assert.notEqual(sha256(await readFile(resolve(root, record.workflow.path))), record.workflow.sha256);
  assert.equal(record.external_effects.workflow_dispatches, 0);
  assert.equal(record.external_effects.runner_allocations, 0);
  assert.equal(record.merge_authorized, false);
  assert.equal(record.default_branch_change_authorized, false);
});
