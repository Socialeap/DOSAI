import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

import { parseStrictJson } from '../../tools/dosai-acceptance/src/strict-json.mjs';

const root = resolve(import.meta.dirname, '../..');
const record = parseStrictJson(await readFile(resolve(
  root,
  'docs/architecture/p3-v50-gate-v3-physical-proof-result.json',
)));
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

test('v50 gate-v3 passed preflight and build but stopped before staging copy', async () => {
  assert.equal(
    record.status,
    'FAILED_CLOSED_STAGING_PARENT_PERMISSION_REAUTHORIZATION_REQUIRED',
  );
  assert.equal(record.governed_preflight.executions, 1);
  assert.equal(record.governed_preflight.result, 'PASS');
  assert.equal(record.preserved_package.builds, 1);
  assert.equal(record.preserved_package.test_signing_sequences_completed, 1);
  assert.equal(record.preserved_package.manifest_entries, 606);
  assert.equal(
    record.preserved_package.manifest_sha256,
    '9a842b75f49aaf26c1f58e8fe83f654d1940310afbfe5606b7247a781bdc31e7',
  );
  assert.equal(record.failure.staging_parent_creation_attempts, 1);
  assert.equal(record.failure.staging_parent_creation_completions, 0);
  assert.equal(record.failure.staged_application_copy_attempts, 0);
  assert.equal(
    sha256(await readFile(resolve(root, record.subjects.gate_path))),
    record.subjects.gate_sha256,
  );
});

test('v50 gate-v3 failure is contained before every runtime effect', () => {
  assert.equal(record.failure.physical_proof_attempt_consumed, true);
  assert.equal(record.failure.lifecycle_receipt_produced, false);
  assert.equal(record.post_failure_observation.staging_parent_present, false);
  assert.equal(record.post_failure_observation.staged_application_present, false);
  assert.equal(record.post_failure_observation.signature_reverification_success_claim, false);
  assert.equal(record.containment.stopped_before_staging_copy, true);
  assert.equal(record.containment.stopped_before_launch, true);
  assert.equal(record.containment.retry_performed, false);
  assert.equal(record.containment.automatic_recovery_performed, false);
  assert.equal(record.containment.background_item_state, 'UNCHANGED_NO_APP_LAUNCH');
  assert.equal(record.observed_effects.staged_application_copies, 0);
  assert.equal(record.observed_effects.application_launches, 0);
  assert.equal(record.observed_effects.native_module_loads, 0);
  assert.equal(record.observed_effects.status_observations, 0);
  assert.equal(record.observed_effects.registration_attempts, 0);
  assert.equal(record.observed_effects.unregistration_attempts, 0);
  assert.equal(record.observed_effects.provider_charge_usd, 0);
  assert.equal(
    record.next_gate,
    'BIND_PRESERVED_PACKAGE_AND_EXACT_PARENT_PERMISSION_BEFORE_REUSE_ONLY_OWNER_REAUTHORIZATION',
  );
});
