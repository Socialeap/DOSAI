import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

import { parseStrictJson } from '../../tools/dosai-acceptance/src/strict-json.mjs';

const root = resolve(import.meta.dirname, '../..');
const record = parseStrictJson(await readFile(resolve(
  root,
  'docs/architecture/p3-v49-service-management-lifecycle-physical-proof-gate.json',
)));
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

test('physical lifecycle gate is bound to the exact reviewed v49 subject', async () => {
  assert.equal(record.status, 'AWAITING_OWNER_AUTHORIZATION');
  assert.equal(record.scope, 'ONE_TEST_ONLY_SIGNED_APP_LIFECYCLE_ATTEMPT');
  assert.equal(record.subject.commit, 'ec470119051e227409c4e994dc74743c7fe9e0bc');
  assert.equal(
    sha256(await readFile(resolve(root, record.subject.process_ownership_path))),
    record.subject.process_ownership_sha256,
  );
  assert.ok(Object.values(record.authorities).every(value => value === false));
});

test('physical lifecycle gate fixes identities, one attempt, and exact success', () => {
  assert.deepEqual(record.fixed_identities, {
    signing_identity_selector: 'UMXN25Z493',
    team_identifier: '3RD3TADLRY',
    outer_app_identifier: 'com.socialeap.dosai',
    lifecycle_addon_identifier: 'com.socialeap.dosai.service-management-lifecycle-addon',
    launch_agent_identifier: 'com.socialeap.dosai.execution-service-fixture',
    launch_agent_plist: 'com.socialeap.dosai.execution-service-fixture.plist',
  });
  assert.deepEqual(record.fixed_attempt, {
    package_argument: '--signed-app-service-management-lifecycle-proof-fixture',
    app_launches: 1,
    app_arguments: 0,
    observe_attempt_limit: 3,
    register_attempt_limit: 1,
    unregister_attempt_limit: 1,
    timeout_ms: 15000,
    timeout_signal: 'SIGKILL',
    retry_allowed: false,
    launch_agent_may_bootstrap_as_registration_consequence: true,
    xpc_client_connection_allowed: false,
  });
  assert.equal(record.success_receipt.result, 'REGISTERED_AND_CLEANED');
  assert.deepEqual(record.success_receipt.after_register, ['ENABLED', 'REQUIRES_APPROVAL']);
  assert.equal(record.success_receipt.after_unregister, 'NOT_REGISTERED');
  assert.equal(record.success_receipt.observe_attempts, 3);
  assert.equal(record.success_receipt.register_attempts, 1);
  assert.equal(record.success_receipt.unregister_attempts, 1);
});

test('non-success cannot retry or silently claim recovery', () => {
  assert.deepEqual(record.failure_containment, {
    stop_on_any_non_success: true,
    stop_on_missing_or_malformed_receipt: true,
    automatic_retry: false,
    automatic_recovery_launch: false,
    preserve_signed_test_package_on_uncertainty: true,
    uncertain_state_label: 'RESIDUAL_BACKGROUND_ITEM_STATE_UNKNOWN',
    further_runtime_action_requires_new_owner_authorization: true,
  });
  assert.equal(
    record.next_gate,
    'EXACT_OWNER_AUTHORIZATION_REQUIRED_BEFORE_ANY_PHYSICAL_ACTION',
  );
});
