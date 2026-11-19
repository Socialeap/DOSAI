import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  checkM4LinuxArm64ClaudeWorkerFixture,
  m4LinuxArm64ClaudeWorkerFixture,
} from '../fixtures/coordination/m4-linux-arm64-claude-worker-fixture.mjs';

const heldGates = {
  hostQualified: false,
  guestExecutionAuthorized: false,
  signInAuthorized: false,
  liveLaunchPermitted: false,
  qualifyingBuilderReceiptsAdded: 0,
};

function assertHold(trace, mismatch) {
  assert.deepEqual(checkM4LinuxArm64ClaudeWorkerFixture(trace), {
    status: 'HOLD',
    mismatches: [mismatch],
    ...heldGates,
  });
}

test('matching synthetic worker evidence keeps all real gates held', () => {
  assert.deepEqual(checkM4LinuxArm64ClaudeWorkerFixture(m4LinuxArm64ClaudeWorkerFixture()), {
    status: 'SYNTHETIC_EXPECTATIONS_MET',
    mismatches: [],
    ...heldGates,
  });
});

const mutations = [
  ['live-looking provenance', 'provenance', ({ provenance }) => { provenance.origin = 'HOST_COLLECTED'; }],
  ['AMD64 guest', 'provenance', ({ provenance }) => { provenance.architecture = 'amd64'; }],
  ['emulated guest', 'provenance', ({ provenance }) => { provenance.emulation = true; }],
  ['changed VM configuration', 'provenance', ({ provenance }) => { provenance.vmConfigDigest = 'e'.repeat(64); }],
  ['macOS executable substituted', 'provenance', ({ provenance }) => {
    provenance.worker.binaryDigest = '21d6e7b9a6f07b4cfcb7df13760b3b72aa25e084e13a5354413382987ba832ed';
  }],
  ['privileged guest account', 'isolation', ({ isolation }) => { isolation.account = 'ADMIN'; }],
  ['host repository mount', 'isolation', ({ isolation }) => { isolation.hostShares = ['HOST_REPOSITORY']; }],
  ['shared credential device', 'isolation', ({ isolation }) => { isolation.sharedDevices = ['HOST_KEYCHAIN']; }],
  ['host clipboard shared', 'isolation', ({ isolation }) => { isolation.clipboard = 'SHARED'; }],
  ['missing canary positive control', 'isolation', ({ isolation }) => { delete isolation.fileCanaryControl; }],
  ['guest reaches connection canary', 'isolation', ({ isolation }) => {
    isolation.connectionCanaryFromGuest = 'REACHABLE';
  }],
  ['subprocess executes', 'isolation', ({ isolation }) => { isolation.subprocess = 'STARTED'; }],
  ['missing sign-in approval', 'signIn', ({ signIn }) => { delete signIn.separateApproval; }],
  ['inference egress during sign-in', 'signIn', ({ signIn }) => { signIn.egress = 'AUTH_AND_INFERENCE'; }],
  ['supervisor active during sign-in', 'signIn', ({ signIn }) => { signIn.supervisor = 'ACTIVE'; }],
  ['worker active during sign-in', 'signIn', ({ signIn }) => { signIn.worker = 'ACTIVE'; }],
  ['API key fallback', 'signIn', ({ signIn }) => { signIn.apiKeyFallback = true; }],
  ['sign-in sends a model request', 'signIn', ({ signIn }) => { signIn.modelRequests = 1; }],
  ['world-readable login file', 'signIn', ({ signIn }) => { signIn.credential.mode = '0644'; }],
  ['hard-linked login file', 'signIn', ({ signIn }) => { signIn.credential.links = 2; }],
  ['symlinked login file', 'signIn', ({ signIn }) => { signIn.credential.symbolicLink = true; }],
  ['copied login file', 'signIn', ({ signIn }) => {
    signIn.credential.source = 'IMPORTED_HOST_FILE';
    signIn.credential.copies = 1;
  }],
  ['external NIC left attached', 'startup', ({ startup }) => { startup.sequence.splice(3, 1); }],
  ['startup before loopback denial', 'startup', ({ startup }) => {
    startup.sequence.splice(5, 2, 'FIXED_STARTUP_READY', 'GUEST_LOOPBACK_DENIED');
  }],
  ['missing guest egress denial', 'startup', ({ startup }) => { startup.sequence.splice(4, 1); }],
  ['swapped VM generation', 'startup', ({ startup }) => { startup.guest = 'fixture-vm-generation-2'; }],
  ['profile substitution', 'startup', ({ startup }) => { startup.profile = 'fixture-unapproved-profile'; }],
  ['login file replaced after sign-in', 'startup', ({ startup }) => {
    startup.credentialIdentity = 'fixture-replacement-inode';
  }],
  ['stale process accepted', 'startup', ({ startup }) => { startup.staleProcess = 'READY'; }],
  ['startup sends a model request', 'startup', ({ startup }) => { startup.modelRequests = 1; }],
  ['pending worker exits before revocation', 'stop', ({ stop }) => {
    stop.beforeReadiness.sequence.splice(2, 2, 'OWNED_PROCESS_EXITED', 'AUTHORITY_REVOKED');
  }],
  ['ready Stop refers to a different process', 'stop', ({ stop }) => {
    stop.afterReadiness.processStart = 'fixture-pending-process-start';
  }],
  ['late ready-worker output accepted', 'stop', ({ stop }) => {
    stop.afterReadiness.sequence.splice(4, 1, 'LATE_OUTPUT_ACCEPTED');
  }],
  ['pending receipt replay accepted', 'stop', ({ stop }) => {
    stop.beforeReadiness.sequence.splice(5, 1, 'REPLAY_ACCEPTED');
  }],
  ['cleanup unverified', 'stop', ({ stop }) => { stop.afterReadiness.sequence.pop(); }],
  ['bridge started', 'receipt', ({ receipt }) => { receipt.bridge = 'ACTIVE'; }],
  ['credentials exported', 'receipt', ({ receipt }) => { receipt.credentialsExported = true; }],
  ['receipt reports a live launch', 'receipt', ({ receipt }) => { receipt.liveLaunches = 1; }],
  ['claim of native-builder evidence', 'receipt', ({ receipt }) => {
    receipt.qualifyingBuilderReceipts = 1;
  }],
  ['forged launch authority', 'unexpectedFields', trace => { trace.liveLaunchPermitted = true; }],
];

for (const [description, section, mutate] of mutations) {
  test(`holds for ${description}`, () => {
    const trace = m4LinuxArm64ClaudeWorkerFixture();
    mutate(trace);
    assertHold(trace, section);
  });
}

test('missing section and non-record evidence both hold', () => {
  const trace = m4LinuxArm64ClaudeWorkerFixture();
  delete trace.stop;
  assertHold(trace, 'stop');
  assertHold(null, 'unexpectedFields');
  assertHold([], 'unexpectedFields');
  assertHold(Object.create(m4LinuxArm64ClaudeWorkerFixture()), 'unexpectedFields');
});
