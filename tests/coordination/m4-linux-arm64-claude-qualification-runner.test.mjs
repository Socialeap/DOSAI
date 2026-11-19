import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  rehearseM4LinuxArm64ClaudeQualification,
  sourceM4LinuxArm64ClaudeQualificationStatus,
} from '../../tools/local-coordination-pilot/m4-linux-arm64-claude-qualification-runner.mjs';
import {
  checkM4LinuxArm64ClaudeWorkerFixture,
  m4LinuxArm64ClaudeWorkerFixture,
} from '../fixtures/coordination/m4-linux-arm64-claude-worker-fixture.mjs';

const stagesBySection = [
  ['NATIVE_GUEST_IDENTITY', 'provenance'],
  ['GUEST_ISOLATION', 'isolation'],
  ['OWNER_SIGN_IN_BOUNDARY', 'signIn'],
  ['NETWORK_DENIED_STARTUP', 'startup'],
  ['STOP_REVOCATION_AND_CLEANUP', 'stop'],
  ['SANITIZED_RECEIPT', 'receipt'],
];
const stages = stagesBySection.map(([stage]) => stage);
const physicalGate = 'PHYSICAL_GUEST_QUALIFICATION';
const cli = fileURLToPath(new URL(
  '../../tools/local-coordination-pilot/m4-linux-arm64-claude-qualification-runner.mjs', import.meta.url,
));

function runFixture(trace = m4LinuxArm64ClaudeWorkerFixture(), caseId = 'fixture-one') {
  const { provenance, startup, stop } = trace;
  const version = 1;
  const origin = 'SYNTHETIC_ONLY';
  const binding = {
    sourceRevision: '4035b055f1f9ea9a99b0be1bd8fa883f8589c945',
    target: provenance.worker.target,
    binaryDigest: provenance.worker.binaryDigest,
    manifestDigest: provenance.worker.manifestDigest,
    caseId,
    guest: provenance.guest,
    profile: startup.profile,
    credentialIdentity: startup.credentialIdentity,
    pendingProcessStart: stop.beforeReadiness.processStart,
    readyProcessStart: stop.afterReadiness.processStart,
    imageDigest: provenance.imageDigest,
    kernelDigest: provenance.kernelDigest,
    vmConfigDigest: provenance.vmConfigDigest,
    supervisorDigest: provenance.supervisorDigest,
  };
  const bindingDigest = createHash('sha256').update(JSON.stringify([
    'DOSAI_M4_LINUX_ARM64_CLAUDE_QUALIFICATION', version, origin, ...Object.values(binding),
  ])).digest('hex');
  const { mismatches } = checkM4LinuxArm64ClaudeWorkerFixture(trace);
  const observations = stagesBySection.map(([stage, section]) => ({
    stage, bindingDigest, verdict: mismatches.includes(section) ? 'CONTRADICTED' : 'MATCHED',
  }));
  return { version, origin, binding, observations };
}

function expectedReport(rehearsal, completedStages, blockedStage, reason) {
  return {
    version: 1,
    status: 'HOLD',
    scope: 'SOURCE_ONLY',
    rehearsal,
    completedStages,
    blockedStage,
    reason,
    hostQualified: false,
    provisioningAuthorized: false,
    hostMutationAuthorized: false,
    guestExecutionAuthorized: false,
    signInAuthorized: false,
    modelRequestsAuthorized: false,
    bridgeActivationAuthorized: false,
    liveLaunchPermitted: false,
    qualifyingBuilderReceiptsAdded: 0,
  };
}

function assertStopped(input, index, reason) {
  assert.deepEqual(
    rehearseM4LinuxArm64ClaudeQualification(input),
    expectedReport('STOPPED', stages.slice(0, index), stages[index], reason),
  );
}

test('complete merged fixture rehearses all stages with physical qualification held', () => {
  assert.deepEqual(
    rehearseM4LinuxArm64ClaudeQualification(runFixture()),
    expectedReport('COMPLETE', stages, physicalGate, 'SYNTHETIC_RESULTS_ONLY'),
  );
});

for (const [index, stage] of stages.entries()) {
  test(`holds at missing ${stage}`, () => {
    const input = runFixture();
    input.observations.length = index;
    assertStopped(input, index, 'OBSERVATION_MISSING');
  });
}

for (const [description, index, change] of [
  ['guest emulation', 0, trace => { trace.provenance.emulation = true; }],
  ['mounted host workspace', 1, trace => { trace.isolation.hostShares = ['HOST_REPOSITORY']; }],
  ['active worker at owner sign-in', 2, trace => { trace.signIn.worker = 'ACTIVE'; }],
  ['missing guest loopback denial', 3, trace => { trace.startup.sequence.splice(5, 1); }],
  ['cleanup unverified after Stop', 4, trace => { trace.stop.afterReadiness.sequence.pop(); }],
  ['receipt claims native-builder credit', 5, trace => { trace.receipt.qualifyingBuilderReceipts = 1; }],
]) {
  test(`stops when the worker fixture detects ${description}`, () => {
    const trace = m4LinuxArm64ClaudeWorkerFixture();
    change(trace);
    assertStopped(runFixture(trace), index, 'CONTRADICTED');
  });
}

for (const [description, index, change, reason] of [
  ['foreign case row', 1, input => {
    input.observations[1] = runFixture(m4LinuxArm64ClaudeWorkerFixture(), 'fixture-other').observations[1];
  }, 'OBSERVATION_REJECTED'],
  ['changed guest profile', 0, input => {
    input.binding.profile = 'fixture-alternate-profile';
  }, 'OBSERVATION_REJECTED'],
  ['changed guest generation', 0, input => {
    input.binding.guest = 'fixture-vm-generation-2';
  }, 'OBSERVATION_REJECTED'],
  ['changed synthetic credential file identity', 0, input => {
    input.binding.credentialIdentity = 'fixture-device-inode-2';
  }, 'OBSERVATION_REJECTED'],
  ['stale ready process', 0, input => {
    input.binding.readyProcessStart = 'fixture-stale-process';
  }, 'OBSERVATION_REJECTED'],
  ['substituted guest image', 0, input => {
    input.binding.imageDigest = 'f'.repeat(64);
  }, 'OBSERVATION_REJECTED'],
  ['duplicated stage', 2, input => {
    input.observations[2] = input.observations[1];
  }, 'OBSERVATION_REJECTED'],
  ['out-of-order stage', 2, input => {
    [input.observations[2], input.observations[3]] = [input.observations[3], input.observations[2]];
  }, 'OBSERVATION_REJECTED'],
  ['sparse stage with later rows present', 2, input => {
    delete input.observations[2];
  }, 'OBSERVATION_MISSING'],
  ['unavailable startup result', 3, input => {
    input.observations[3].verdict = 'UNAVAILABLE';
  }, 'UNAVAILABLE'],
  ['unknown verdict', 4, input => {
    input.observations[4].verdict = 'APPROVED';
  }, 'OBSERVATION_REJECTED'],
  ['receipt with injected authority', 5, input => {
    Object.defineProperty(input.observations[5], 'liveLaunchPermitted', { value: true });
  }, 'OBSERVATION_REJECTED'],
]) {
  test(`holds for ${description}`, () => {
    const input = runFixture();
    change(input);
    assertStopped(input, index, reason);
  });
}

test('unsupported envelopes and altered pins fail before any stage completes', () => {
  assertStopped(null, 0, 'INVALID_SYNTHETIC_INPUT');
  for (const change of [
    input => { input.origin = 'PHYSICAL'; },
    input => { input.version = 2; },
    input => { input.binding.sourceRevision = '0'.repeat(40); },
    input => { input.binding.target = 'linux-x64'; },
    input => { input.binding.binaryDigest = '0'.repeat(64); },
    input => { input.binding.manifestDigest = '0'.repeat(64); },
    input => { input.binding.caseId = '/private/unsafe-input'; },
    input => { input.binding.pendingProcessStart = input.binding.readyProcessStart; },
    input => { input.binding.vmConfigDigest = 'g'.repeat(64); },
    input => { input.observations.push(input.observations.at(-1)); },
    input => { input.observations.signInAuthorized = true; },
  ]) {
    const input = runFixture();
    change(input);
    assertStopped(input, 0, 'INVALID_SYNTHETIC_INPUT');
  }
});

test('observation getters are rejected without invocation', () => {
  const input = runFixture();
  Object.defineProperty(input.observations, '1', { get: () => assert.fail('observation getter ran') });
  assertStopped(input, 1, 'OBSERVATION_REJECTED');

  const accessor = runFixture();
  Object.defineProperty(accessor.observations[2], 'verdict', { get: () => assert.fail('verdict getter ran') });
  assertStopped(accessor, 2, 'OBSERVATION_REJECTED');
});

test('CLI returns the physical hold and ignores a complete rehearsal on stdin', () => {
  const result = spawnSync(process.execPath, [cli], {
    input: JSON.stringify(runFixture()), encoding: 'utf8', timeout: 3000,
  });
  assert.ifError(result.error);
  assert.equal(result.status, 2);
  assert.equal(result.stderr, '');
  const expected = expectedReport('NOT_RUN', [], physicalGate, 'PHYSICAL_GUEST_BOUNDARY_UNVERIFIED');
  assert.deepEqual(sourceM4LinuxArm64ClaudeQualificationStatus(), expected);
  assert.deepEqual(JSON.parse(result.stdout), expected);
});

test('CLI rejects execution flags and caller paths with a fixed error', () => {
  for (const arg of ['--execute', '--sign-in', '--profile=/private/unsafe-input']) {
    const result = spawnSync(process.execPath, [cli, arg], { encoding: 'utf8', timeout: 3000 });
    assert.ifError(result.error);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.equal(result.stderr, 'Invalid Linux ARM64 Claude qualification invocation.\n');
  }
});
