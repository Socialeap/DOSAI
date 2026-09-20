import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '../..');
const v38Path = resolve(root, 'docs/architecture/process-ownership-v38.json');
const v37Path = resolve(root, 'docs/architecture/process-ownership-v37.json');
const v38 = JSON.parse(await readFile(v38Path, 'utf8'));

const digest = async (path) =>
  createHash('sha256').update(await readFile(resolve(root, path))).digest('hex');

test('accepted process ownership v38 binds accepted v37, v8, ADR 0003, and the accepted evaluation', async () => {
  assert.equal(v38.schema_version, 38);
  assert.equal(v38.status, 'ACCEPTED');
  assert.equal(v38.full_manifest_replacement, false);
  assert.deepEqual(v38.supersedes, {
    path: 'docs/architecture/process-ownership-v37.json',
    sha256: await digest('docs/architecture/process-ownership-v37.json'),
  });
  assert.equal(JSON.parse(await readFile(v37Path, 'utf8')).status, 'ACCEPTED');
  for (const baseline of v38.governed_baselines) {
    assert.equal(await digest(baseline.path), baseline.sha256, baseline.path);
  }
  const evaluation = await readFile(
    resolve(root, 'docs/development/p3-capsule-cancellation-escalation-evaluation.md'),
    'utf8',
  );
  assert.match(evaluation, /\*\*Status:\*\* `OWNER_ACCEPTED`/);
});

test('v38 preserves its preimages and hash-binds only the two accepted inert cancellation postimages', async () => {
  assert.deepEqual(v38.proposed_implementation_files, [
    'src/main/execution/capsule-supervisor.ts',
    'tests/security/p3-capsule-supervisor.test.mjs',
  ]);
  assert.deepEqual(v38.preimplementation_files, [
    {
      path: 'src/main/execution/capsule-supervisor.ts',
      sha256: 'cb325b8ae9bd2f6c3432405e8f83b4087c98fecef6e6ec31ac2384628cd912cf',
    },
    {
      path: 'tests/security/p3-capsule-supervisor.test.mjs',
      sha256: '2027558f38e08e9c6c1f84b0e00e8a38ace757f04a13ae28a96890ea927cba59',
    },
  ]);
  assert.deepEqual(
    v38.implemented_files.map((file) => file.path),
    v38.proposed_implementation_files,
  );
  for (const file of v38.implemented_files) {
    assert.equal(await digest(file.path), file.sha256, file.path);
  }
});

test('v38 fixes bounded reduction semantics and denies every adjacent runtime authority', () => {
  assert.deepEqual(v38.required_contract, {
    grace_period_ms: 250,
    graceful_stop_attempt_limit: 1,
    force_stop_attempt_limit: 1,
    concurrent_callers_share_one_reduction: true,
    forced_cleanup_after_grace_timeout: true,
    stopped_requires_not_alive_observation: true,
    uncertain_cleanup_state: 'QUARANTINED',
    uncertain_cleanup_label: 'UNCERTAIN',
  });
  assert.equal(v38.required_adversarial_cases.length, 6);
  assert.ok(v38.required_adversarial_cases.includes('NEVER_SETTLING_GRACEFUL_STOP_REACHES_ONE_FORCE_ATTEMPT'));
  assert.ok(v38.required_adversarial_cases.includes('ORDINARY_WATCHDOG_AND_EMERGENCY_CALLERS_SHARE_ONE_BOUNDED_REDUCTION'));
  assert.ok(Object.values(v38.authority).every((value) => value === false));
  assert.equal(v38.implementation_authorization, 'OWNER_ACCEPTED_INERT_SUPERVISOR_TEST_ONLY');
  assert.equal(v38.implementation_outcome, 'IMPLEMENTED_NO_RUNTIME_AUTHORITY');
});
