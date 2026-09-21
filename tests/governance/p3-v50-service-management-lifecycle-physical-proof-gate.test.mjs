import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

import { parseStrictJson } from '../../tools/dosai-acceptance/src/strict-json.mjs';

const root = resolve(import.meta.dirname, '../..');
const record = parseStrictJson(await readFile(resolve(
  root,
  'docs/architecture/p3-v50-service-management-lifecycle-physical-proof-gate.json',
)));
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

test('v50 physical lifecycle gate binds the exact validated source successor', async () => {
  assert.equal(record.status, 'AWAITING_OWNER_AUTHORIZATION');
  assert.equal(record.scope, 'ONE_ISOLATED_TEST_ONLY_SIGNED_APP_LIFECYCLE_ATTEMPT');
  assert.equal(record.subject.commit, '0585524f465231500340e592f8807aa875a739ac');
  assert.equal(
    sha256(await readFile(resolve(root, record.subject.process_ownership_path))),
    record.subject.process_ownership_sha256,
  );
  assert.ok(Object.values(record.authorities).every(value => value === false));
});

test('v50 gate fixes stable staging, one attempt, and exact clean success', () => {
  assert.equal(record.fixed_attempt.preserve_v49_package, true);
  assert.equal(record.fixed_attempt.build_new_v50_package, true);
  assert.equal(
    record.fixed_attempt.stable_test_application_path,
    '/Users/shakoure/Library/Application Support/DOSAI/TestProofs/v50/DOSAI.app',
  );
  assert.equal(record.fixed_attempt.verify_source_and_staged_bytes_match, true);
  assert.equal(record.fixed_attempt.verify_nested_and_outer_signatures_before_launch, true);
  assert.equal(record.fixed_attempt.app_launches, 1);
  assert.equal(record.fixed_attempt.app_arguments, 0);
  assert.equal(record.fixed_attempt.register_attempt_limit, 1);
  assert.equal(record.fixed_attempt.unregister_attempt_limit, 1);
  assert.equal(record.fixed_attempt.timeout_ms, 15000);
  assert.equal(record.fixed_attempt.retry_allowed, false);
  assert.equal(record.fixed_attempt.xpc_client_connection_allowed, false);
  assert.equal(record.success_receipt.result, 'REGISTERED_AND_CLEANED');
  assert.deepEqual(record.success_receipt.before, ['NOT_REGISTERED', 'NOT_FOUND']);
  assert.deepEqual(record.success_receipt.after_register, ['ENABLED', 'REQUIRES_APPROVAL']);
  assert.equal(record.success_receipt.after_unregister, 'NOT_REGISTERED');
  assert.equal(record.success_receipt.observe_attempts, 3);
  assert.equal(record.success_receipt.register_attempts, 1);
  assert.equal(record.success_receipt.unregister_attempts, 1);
});

test('v50 non-success cannot retry, recover automatically, or claim cleanup', () => {
  assert.equal(record.failure_containment.stop_on_any_non_success, true);
  assert.equal(record.failure_containment.stop_on_missing_or_malformed_receipt, true);
  assert.equal(record.failure_containment.automatic_retry, false);
  assert.equal(record.failure_containment.automatic_recovery_launch, false);
  assert.equal(record.failure_containment.preserve_signed_test_package_on_uncertainty, true);
  assert.equal(record.failure_containment.preserve_staged_test_application_on_uncertainty, true);
  assert.equal(record.failure_containment.further_runtime_action_requires_new_owner_authorization, true);
  assert.equal(
    record.next_gate,
    'EXACT_OWNER_AUTHORIZATION_REQUIRED_BEFORE_ANY_PHYSICAL_ACTION',
  );
});
