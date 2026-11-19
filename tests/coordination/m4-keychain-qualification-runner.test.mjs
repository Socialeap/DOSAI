import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { rehearseM4KeychainQualification, sourceM4QualificationStatus }
  from '../../tools/local-coordination-pilot/m4-keychain-qualification-runner.mjs';
import { m4KeychainIsolationFixture, checkM4KeychainIsolationFixture }
  from '../fixtures/coordination/m4-keychain-isolation-fixture.mjs';

const stages = [
  'LOGIN_AND_WORKER_IDENTITY',
  'USER_KEYCHAIN_CONTROLS',
  'DISPOSABLE_SYSTEM_KEYCHAIN_CONTROL',
  'M4_SYSTEM_KEYCHAIN_POLICY',
  'HOST_AND_NETWORK_DENIAL',
  'STARTUP_STOP_AND_REVOCATION',
  'OWNED_CLEANUP',
];
const noAuthority = {
  hostQualified: false,
  hostMutationAuthorized: false,
  signInAuthorized: false,
  liveLaunchPermitted: false,
  qualifyingBuilderReceiptsAdded: 0,
};

function runFixture(caseId = 'fixture-ordered') {
  const trace = m4KeychainIsolationFixture();
  assert.equal(checkM4KeychainIsolationFixture(trace).status, 'SYNTHETIC_EXPECTATIONS_MET');
  const origin = 'SYNTHETIC_ONLY';
  const version = 1;
  const binding = {
    caseId,
    sourceRevision: 'cf97bd5247ecf0158a27a28445b0b408b0e511ff',
    claudeDigest: trace.identity.executableDigest,
    policyDigest: trace.provenance.policyDigest,
  };
  const digest = createHash('sha256').update(JSON.stringify([
    version, origin, caseId, binding.sourceRevision, binding.claudeDigest, binding.policyDigest,
  ])).digest('hex');
  const observations = stages.map(stage => ({ stage, bindingDigest: digest, verdict: 'MATCHED' }));
  return { version, origin, binding, observations };
}

function expectNoAuthority(result) {
  assert.equal(result.status, 'HOLD');
  assert.equal(result.scope, 'SOURCE_ONLY');
  for (const [key, value] of Object.entries(noAuthority)) assert.equal(result[key], value);
}

test('the staged rehearsal completes while the physical policy gate stays held', () => {
  const result = rehearseM4KeychainQualification(runFixture());
  expectNoAuthority(result);
  assert.equal(result.rehearsal, 'COMPLETE');
  assert.deepEqual(result.completedStages, stages);
  assert.equal(result.blockedStage, 'M4_SYSTEM_KEYCHAIN_POLICY');
  assert.equal(result.reason, 'SYNTHETIC_RESULTS_ONLY');
});

test('disposable System Keychain evidence cannot skip the M4 policy observation', () => {
  const fixture = runFixture();
  fixture.observations.length = 3;
  const result = rehearseM4KeychainQualification(fixture);
  expectNoAuthority(result);
  assert.equal(result.rehearsal, 'STOPPED');
  assert.deepEqual(result.completedStages, stages.slice(0, 3));
  assert.equal(result.blockedStage, 'M4_SYSTEM_KEYCHAIN_POLICY');
  assert.equal(result.reason, 'OBSERVATION_MISSING');
});

for (const [description, index, change, reason] of [
  ['unavailable identity', 0, row => { row.verdict = 'UNAVAILABLE'; }, 'UNAVAILABLE'],
  ['refuted cross-user control', 1, row => { row.verdict = 'CONTRADICTED'; }, 'CONTRADICTED'],
  ['M4 policy scoped to another run', 3, row => {
    row.bindingDigest = runFixture('fixture-other').observations[3].bindingDigest;
  }, 'OBSERVATION_REJECTED'],
  ['duplicated stage', 3, row => { row.stage = stages[2]; }, 'OBSERVATION_REJECTED'],
  ['out-of-order stage', 4, row => { row.stage = stages[6]; }, 'OBSERVATION_REJECTED'],
  ['late output accepted', 5, row => { row.verdict = 'CONTRADICTED'; }, 'CONTRADICTED'],
  ['uncertain cleanup', 6, row => { row.verdict = 'UNAVAILABLE'; }, 'UNAVAILABLE'],
  ['caller-provided authority', 6, row => { row.signInAuthorized = true; }, 'OBSERVATION_REJECTED'],
]) {
  test(`stop at the first gate on ${description}`, () => {
    const fixture = runFixture();
    change(fixture.observations[index]);
    const result = rehearseM4KeychainQualification(fixture);
    expectNoAuthority(result);
    assert.equal(result.rehearsal, 'STOPPED');
    assert.deepEqual(result.completedStages, stages.slice(0, index));
    assert.equal(result.blockedStage, stages[index]);
    assert.equal(result.reason, reason);
  });
}

test('live provenance, source drift, and a changed client pin cannot enter rehearsal', () => {
  const cases = [
    { ...runFixture(), origin: 'LIVE' },
    runFixture(),
    runFixture(),
  ];
  cases[1].binding.sourceRevision = 'c'.repeat(40);
  cases[2].binding.claudeDigest = 'd'.repeat(64);
  for (const input of cases) {
    const result = rehearseM4KeychainQualification(input);
    expectNoAuthority(result);
    assert.deepEqual(result.completedStages, []);
    assert.equal(result.reason, 'INVALID_SYNTHETIC_INPUT');
  }
});

const cli = fileURLToPath(new URL('../../tools/local-coordination-pilot/m4-keychain-qualification-runner.mjs', import.meta.url));

test('the CLI reports a hold even with a complete trace on stdin', () => {
  const result = spawnSync(process.execPath, [cli], { input: JSON.stringify(runFixture()), encoding: 'utf8', timeout: 3000 });
  assert.ifError(result.error);
  assert.equal(result.status, 2);
  assert.equal(result.stderr, '');
  assert.deepEqual(JSON.parse(result.stdout), sourceM4QualificationStatus());
  expectNoAuthority(JSON.parse(result.stdout));
});

test('the CLI rejects requested activation or caller paths without echoing them', () => {
  for (const arg of ['--execute', '--profile=/private/tmp/invalid']) {
    const result = spawnSync(process.execPath, [cli, arg], { encoding: 'utf8', timeout: 3000 });
    assert.ifError(result.error);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.equal(result.stderr, 'Invalid M4 qualification invocation.\n');
  }
});
