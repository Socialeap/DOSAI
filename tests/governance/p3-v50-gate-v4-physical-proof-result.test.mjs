import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

import { parseStrictJson } from '../../tools/dosai-acceptance/src/strict-json.mjs';

const root = resolve(import.meta.dirname, '../..');
const record = parseStrictJson(await readFile(resolve(
  root,
  'docs/architecture/p3-v50-gate-v4-physical-proof-result.json',
)));
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

test('v50 gate-v4 binds the exact reuse-only gate and verified package', async () => {
  assert.equal(record.status, 'PASS_REGISTERED_AND_CLEANED');
  assert.equal(record.subjects.gate_commit, '9d500945c9c00bcd82ffa8a92bbe172aa3c7cac0');
  assert.equal(
    sha256(await readFile(resolve(root, record.subjects.gate_path))),
    record.subjects.gate_sha256,
  );
  assert.equal(record.preflight.executions, 1);
  assert.equal(record.preflight.result, 'PASS');
  assert.equal(record.preserved_package_verification.executions, 1);
  assert.equal(record.preserved_package_verification.result, 'PASS');
  assert.equal(record.staging.application_copy_attempts, 1);
  assert.equal(record.staging.application_copy_completions, 1);
  assert.equal(record.staged_package_verification.executions, 1);
  assert.equal(record.staged_package_verification.result, 'PASS');
  assert.equal(
    record.preserved_package_verification.manifest_sha256,
    record.staged_package_verification.manifest_sha256,
  );
});

test('v50 gate-v4 proves one exact registered-and-cleaned lifecycle', () => {
  assert.deepEqual(record.receipt, {
    result: 'REGISTERED_AND_CLEANED',
    before: 'NOT_FOUND',
    after_register: 'ENABLED',
    after_unregister: 'NOT_REGISTERED',
    observe_attempts: 3,
    observe_completions: 3,
    register_attempts: 1,
    register_completions: 1,
    unregister_attempts: 1,
    unregister_completions: 1,
    consumed: true,
  });
  assert.equal(record.observed_effects.package_builds, 0);
  assert.equal(record.observed_effects.signing_operations, 0);
  assert.equal(record.observed_effects.application_launches, 1);
  assert.equal(record.observed_effects.xpc_client_connections, 0);
  assert.equal(record.observed_effects.provider_charge_usd, 0);
  assert.equal(record.containment.timeout_triggered, false);
  assert.equal(record.containment.retry_performed, false);
  assert.equal(record.containment.automatic_recovery_performed, false);
  assert.equal(record.containment.terminal_background_item_status, 'NOT_REGISTERED');
  assert.equal(record.containment.clean_unregistration_proven, true);
  assert.equal(record.containment.residual_background_item_state_unknown, false);
  assert.equal(
    record.next_gate,
    'ADVANCE_TO_TWO_INDEPENDENT_NATIVE_AMD64_LINUX_BUILDER_RECEIPTS',
  );
});
