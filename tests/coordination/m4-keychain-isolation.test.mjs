import assert from 'node:assert/strict';
import test from 'node:test';
import {
  checkM4KeychainIsolationFixture,
  m4KeychainIsolationFixture,
} from '../fixtures/coordination/m4-keychain-isolation-fixture.mjs';

const noAuthority = {
  hostQualified: false,
  signInAuthorized: false,
  liveLaunchPermitted: false,
  qualifyingBuilderReceiptsAdded: 0,
};

test('the complete synthetic trace grants no host, sign-in, launch or builder authority', () => {
  assert.deepEqual(checkM4KeychainIsolationFixture(m4KeychainIsolationFixture()), {
    status: 'SYNTHETIC_EXPECTATIONS_MET',
    mismatches: [],
    ...noAuthority,
  });
});

const adversarialCases = [
  ['a non-synthetic origin', 'provenance', f => { f.provenance.origin = 'LIVE'; }],
  ['a different login UID', 'identity', f => { f.identity.dedicatedUid = f.identity.controlUid; }],
  ['a replaced login session', 'identity', f => { f.identity.loginSession = 'fixture-other-login'; }],
  ['a reused process identity', 'identity', f => { f.identity.staleProcess = 'ACCEPTED'; }],
  ['a changed executable', 'identity', f => { f.identity.executableDigest = 'c'.repeat(64); }],
  ['an unbound channel', 'identity', f => { delete f.identity.channel; }],
  ['a missing intended login fixture', 'userKeychains', f => { f.userKeychains.dedicated.candidate = 'MISSING'; }],
  ['a cross-user read', 'userKeychains', f => { f.userKeychains.crossUserCandidate.candidate = 'PRESENT'; }],
  ['a missing cross-user positive control', 'userKeychains', f => { f.userKeychains.crossUserControl.owner = 'MISSING'; }],
  ['an absent cross-user item reported as denial', 'userKeychains', f => { f.userKeychains.crossUserCandidate.candidate = 'MISSING'; }],
  ['a cross-user denial against the wrong item', 'userKeychains', f => { f.userKeychains.crossUserCandidate.item = 'fixture-user-3'; }],
  ['an unrelated System credential read', 'systemKeychain', f => { f.systemKeychain.fixtureCandidate.candidate = 'PRESENT'; }],
  ['a System canary missing from its control', 'systemKeychain', f => { f.systemKeychain.fixtureControl.owner = 'MISSING'; }],
  ['a System canary queried in another environment', 'systemKeychain', f => { f.systemKeychain.fixtureCandidate.environment = 'synthetic-other'; }],
  ['disposable System evidence without policy binding', 'systemKeychain', f => { delete f.systemKeychain.policyBinding; }],
  ['a System policy bound to another OS build', 'systemKeychain', f => { f.systemKeychain.policyBinding.osBuild = 'synthetic-other-build'; }],
  ['a stale System policy digest', 'systemKeychain', f => { f.systemKeychain.policyBinding.policyDigest = 'd'.repeat(64); }],
  ['an unknown shared System credential path', 'systemKeychain', f => {
    f.systemKeychain.policyBinding.unrelatedSystemCredentialAccess = 'UNKNOWN';
  }],
  ['access to the ordinary home', 'hostAccess', f => { f.hostAccess.ordinaryHome = 'ALLOWED'; }],
  ['access to the Codex profile', 'hostAccess', f => { f.hostAccess.codexProfile = 'ALLOWED'; }],
  ['a subprocess launch', 'hostAccess', f => { f.hostAccess.childExecution = 'ALLOWED'; }],
  ['loopback access', 'hostAccess', f => { f.hostAccess.loopback = 'ALLOWED'; }],
  ['no cancellation before readiness', 'stop', f => { delete f.stop.beforeReadiness; }],
  ['late output before revocation', 'stop', f => {
    f.stop.afterReadiness = ['PINNED_WORKER_READY', 'STOP_REQUESTED', 'LATE_OUTPUT_REJECTED',
      'WORKER_EXITED', 'AUTHORITY_REVOKED', 'REPLAY_REJECTED'];
  }],
  ['replayed output after Stop', 'stop', f => { f.stop.afterReadiness[5] = 'REPLAY_ACCEPTED'; }],
  ['an unconfirmed worker exit', 'cleanup', f => { f.cleanup.ownedWorker = 'UNKNOWN'; }],
  ['uncertain fixture cleanup', 'cleanup', f => { f.cleanup.syntheticFixtures = 'UNKNOWN'; }],
  ['a model request', 'cleanup', f => { f.cleanup.modelRequests = 1; }],
  ['a real subscription attached to the fixture', 'cleanup', f => { f.cleanup.subscriptionAttached = true; }],
  ['a Keychain settings change', 'cleanup', f => { f.cleanup.existingKeychainSettings = 'CHANGED'; }],
  ['a billing settings change', 'cleanup', f => { f.cleanup.billingSettings = 'CHANGED'; }],
  ['a forged authority field', 'unexpectedFields', f => { f.signInAuthorized = true; }],
];

for (const [description, check, mutate] of adversarialCases) {
  test(`hold on ${description}`, () => {
    const trace = m4KeychainIsolationFixture();
    mutate(trace);
    assert.deepEqual(checkM4KeychainIsolationFixture(trace), {
      status: 'HOLD',
      mismatches: [check],
      ...noAuthority,
    });
  });
}

test('inherited observations cannot stand in for the required trace', () => {
  assert.deepEqual(checkM4KeychainIsolationFixture(Object.create(m4KeychainIsolationFixture())), {
    status: 'HOLD',
    mismatches: ['unexpectedFields'],
    ...noAuthority,
  });
});
