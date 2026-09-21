import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

import { parseStrictJson } from '../../tools/dosai-acceptance/src/strict-json.mjs';

const root = resolve(import.meta.dirname, '../..');
const record = parseStrictJson(await readFile(resolve(
  root,
  'docs/architecture/p3-v50-stable-path-launcher-source-record.json',
)));
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

test('stable-path launcher source record binds the exact diagnosis and files', async () => {
  assert.equal(record.status, 'IMPLEMENTED_SOURCE_ONLY_NOT_EXECUTED');
  assert.equal(record.scope, 'FIXED_STAGED_APPLICATION_LIFECYCLE_PROOF_LAUNCHER');
  assert.equal(
    record.diagnosis.mismatch,
    'HISTORICAL_RUNNER_DID_NOT_LAUNCH_THE_GATE_REQUIRED_STABLE_PATH',
  );
  assert.equal(
    record.contract.stable_application_path,
    '/Users/shakoure/Library/Application Support/DOSAI/TestProofs/v50/DOSAI.app',
  );
  assert.equal(
    record.contract.stable_executable_path,
    '/Users/shakoure/Library/Application Support/DOSAI/TestProofs/v50/DOSAI.app/Contents/MacOS/DOSAI',
  );
  for (const binding of [...record.bound_inputs, ...record.source_files]) {
    assert.equal(sha256(await readFile(resolve(root, binding.path))), binding.sha256, binding.path);
  }
});

test('stable-path launcher remains bounded and has no physical authority', () => {
  assert.deepEqual(record.contract, {
    stable_application_path:
      '/Users/shakoure/Library/Application Support/DOSAI/TestProofs/v50/DOSAI.app',
    stable_executable_path:
      '/Users/shakoure/Library/Application Support/DOSAI/TestProofs/v50/DOSAI.app/Contents/MacOS/DOSAI',
    caller_selected_path_allowed: false,
    application_argument_count: 0,
    launch_attempt_limit: 1,
    timeout_ms: 15000,
    timeout_signal: 'SIGKILL',
    retry_allowed: false,
    receipt_admission_reused_from_v50: true,
    staging_performed_by_runner: false,
    signature_verification_performed_by_runner: false,
  });
  assert.ok(Object.values(record.observed_effects).every(value => value === 0));
  assert.ok(Object.values(record.authorities).every(value => value === false));
  assert.equal(
    record.next_gate,
    'REBIND_EXACT_PHYSICAL_PROOF_PACKET_TO_THIS_SOURCE_COMMIT_BEFORE_OWNER_AUTHORIZATION',
  );
});
