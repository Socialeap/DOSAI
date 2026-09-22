import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

import { parseStrictJson } from '../../tools/dosai-acceptance/src/strict-json.mjs';

const root = resolve(import.meta.dirname, '../..');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const readRecord = async path => parseStrictJson(await readFile(resolve(root, path)));

test('attempt one records one failed-closed dispatch without candidate or builder evidence', async () => {
  const result = await readRecord(
    'docs/architecture/p3-native-builder-host-observation-attempt-1-result.json',
  );
  assert.equal(result.status, 'FAILED_CLOSED_UNATTRIBUTED_ASSERTION');
  assert.equal(result.workflow.run_id, '35669182950');
  assert.equal(result.workflow.run_attempt, '1');
  assert.equal(result.workflow.head_sha, '6495ffe787189c9836af4d6a5be4e480bc9f38f1');
  assert.equal(result.workflow.conclusion, 'failure');
  assert.deepEqual(result.jobs.map(job => job.name), ['BUILDER_HOST_A', 'BUILDER_HOST_B']);
  assert.ok(result.jobs.every(job => (
    job.observation_step_conclusion === 'failure' &&
    job.process_exit_code === 1 &&
    job.success_receipt_lines === 0 &&
    job.attributed_failure_code_lines === 0
  )));
  assert.equal(result.evidence_result.candidate_host_receipts, 0);
  assert.equal(result.evidence_result.builder_receipts_produced, 0);
  assert.equal(result.evidence_result.beta_cp_004_satisfied, false);
  assert.equal(result.containment.manual_dispatches_observed, 1);
  assert.equal(result.containment.automatic_retries, 0);
  assert.equal(result.containment.reruns, 0);
});

test('source-only repair adds fixed failure codes without broadening workflow authority', async () => {
  const record = await readRecord(
    'docs/architecture/p3-native-builder-host-observability-repair-source-record.json',
  );
  const workflow = await readFile(resolve(root, record.workflow.path));
  const failedAttempt = await readFile(resolve(root, record.failed_attempt.path));
  const source = workflow.toString('utf8');

  assert.equal(record.status, 'IMPLEMENTED_SOURCE_ONLY_NOT_DISPATCHED');
  assert.equal(sha256(workflow), record.workflow.repaired_sha256);
  assert.equal(sha256(failedAttempt), record.failed_attempt.sha256);
  assert.equal(record.failure_contract.fixed_codes.length, 15);
  assert.equal(record.failure_contract.dynamic_host_data_in_failure_line, false);
  assert.equal(record.failure_contract.existing_success_receipt_changed, false);
  assert.equal(record.failure_contract.existing_host_predicates_removed, false);
  assert.equal(record.failure_contract.failure_still_exits_nonzero, true);
  for (const code of record.failure_contract.fixed_codes) {
    assert.equal((source.match(new RegExp(`\\|\\| fail ${code}\\b`, 'g')) ?? []).length, 2, code);
  }
  assert.ok(Object.values(record.authorities).every(value => value === false));
});
