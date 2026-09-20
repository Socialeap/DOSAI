import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '../..');
const v38Path = resolve(root, 'docs/architecture/process-ownership-v38.json');
const v39Path = resolve(root, 'docs/architecture/process-ownership-v39.json');
const v39 = JSON.parse(await readFile(v39Path, 'utf8'));

const digest = async (path) =>
  createHash('sha256').update(await readFile(resolve(root, path))).digest('hex');

test('accepted process ownership v39 binds accepted v38, v37, ADR 0020, and the accepted dispatch evaluation', async () => {
  assert.equal(v39.schema_version, 39);
  assert.equal(v39.status, 'ACCEPTED');
  assert.equal(v39.full_manifest_replacement, false);
  assert.deepEqual(v39.supersedes, {
    path: 'docs/architecture/process-ownership-v38.json',
    sha256: await digest('docs/architecture/process-ownership-v38.json'),
  });
  assert.equal(JSON.parse(await readFile(v38Path, 'utf8')).status, 'ACCEPTED');
  assert.deepEqual(
    v39.governed_baselines.map((baseline) => baseline.path),
    [
      'docs/architecture/process-ownership-v37.json',
      'docs/decisions/0020-per-user-execution-service-watchdog-control-lane.md',
      'docs/development/p3-watchdog-client-sequence-integrity-evaluation.md',
    ],
  );
  for (const baseline of v39.governed_baselines) {
    assert.equal(await digest(baseline.path), baseline.sha256, baseline.path);
  }
  const evaluation = await readFile(
    resolve(root, 'docs/development/p3-watchdog-client-sequence-integrity-evaluation.md'),
    'utf8',
  );
  assert.match(evaluation, /\*\*Status:\*\* `OWNER_ACCEPTED`/);
});

test('v39 preserves exact proposal preimages and hash-binds only the accepted injection-only client postimages', async () => {
  assert.deepEqual(v39.proposed_implementation_files, [
    'src/main/execution/watchdog-control-client.ts',
    'tests/security/p3-watchdog-control-client.test.mjs',
  ]);
  assert.deepEqual(v39.preimplementation_files, [
    {
      path: 'src/main/execution/watchdog-control-client.ts',
      sha256: 'bcbc9f508398a8df67812401d82d3686d6fe4cbaf8fca70427755535f2943007',
    },
    {
      path: 'tests/security/p3-watchdog-control-client.test.mjs',
      sha256: '8436f52c05a64b219e244063b28db1ea40b3e8d0e305c92ec9ea0cbffae38942',
    },
  ]);
  assert.deepEqual(v39.implemented_files.map((file) => file.path), v39.proposed_implementation_files);
  for (const file of v39.implemented_files) {
    assert.equal(await digest(file.path), file.sha256, file.path);
  }
});

test('v39 requires priority-aware bounded dispatch while denying all adjacent authority', () => {
  assert.deepEqual(v39.required_contract, {
    ordinary_in_flight_limit: 1,
    request_identity_assignment: 'DISPATCH_TIME_ONLY',
    sequence_assignment: 'DISPATCH_TIME_ONLY',
    emergency_stop_all_priority: 'BEFORE_UNISSUED_ORDINARY_ONLY',
    dispatched_request_preemption: false,
    response_timeout_ms: 1000,
    timeout_or_invalid_response_closes_client: true,
    closed_client_dispatches_no_queued_request: true,
    queued_intent_limit: 64,
  });
  assert.equal(v39.required_adversarial_cases.length, 6);
  assert.ok(v39.required_adversarial_cases.includes('CONCURRENT_ORDINARY_CALLS_NEVER_OVERLAP_TRANSPORT_DISPATCH'));
  assert.ok(v39.required_adversarial_cases.includes('EMERGENCY_STOP_ALL_PRECEDES_UNISSUED_ORDINARY_AND_RECEIVES_NEXT_SEQUENCE'));
  assert.ok(v39.required_adversarial_cases.includes('TIMEOUT_OR_INVALID_RESPONSE_CLOSES_CLIENT_AND_REJECTS_QUEUED_WORK_WITHOUT_DISPATCH'));
  assert.ok(Object.values(v39.authority).every((value) => value === false));
  assert.equal(v39.implementation_authorization, 'OWNER_ACCEPTED_INJECTION_ONLY_CLIENT_TEST_ONLY');
  assert.equal(v39.implementation_outcome, 'IMPLEMENTED_NO_RUNTIME_AUTHORITY');
});
