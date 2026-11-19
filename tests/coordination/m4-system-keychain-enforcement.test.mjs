import assert from 'node:assert/strict';
import test from 'node:test';
import { rehearseM4SystemKeychainEnforcement }
  from '../../tools/local-coordination-pilot/m4-system-keychain-enforcement-design.mjs';
import { sourceM4QualificationStatus }
  from '../../tools/local-coordination-pilot/m4-keychain-qualification-runner.mjs';

function designFixture() {
  const binding = {
    run: 'fixture-file-backend',
    sourceRevision: '80b02a206e8d521c34091b722ff9ced18af35553',
    claudeDigest: '21d6e7b9a6f07b4cfcb7df13760b3b72aa25e084e13a5354413382987ba832ed',
    policyDigest: 'a'.repeat(64),
  };
  return {
    version: 1,
    origin: 'SYNTHETIC_ONLY',
    binding,
    auth: {
      provider: 'CLAUDE_SUBSCRIPTION',
      storage: 'VENDOR_CREATED_PROFILE_FILE',
      supportForPinnedClient: 'MODELED_CONFIRMED',
      fileIdentity: 'OWNER_ONLY_SINGLE_LINK_STABLE',
      credentialUseByController: 'NONE',
      fallback: 'DENIED',
    },
    denials: Object.fromEntries([
      'keychainServices', 'inheritedCredentialHandles', 'credentialRelays', 'directSystemStore',
      'alternateStorePath', 'ordinaryUserStore', 'offProfileFileAccess', 'childExecution', 'networkIncludingLoopback',
    ].map(path => [path, 'DENIED'])),
    control: {
      environment: 'SYNTHETIC_DISPOSABLE',
      policyDigest: binding.policyDigest,
      owner: { item: 'fixture-system-credential', outcome: 'PRESENT_READABLE' },
      worker: { item: 'fixture-system-credential', outcome: 'ACCESS_DENIED' },
    },
    m4Enforcement: {
      environment: 'SYNTHETIC_M4_POLICY_BOUND',
      workerIdentity: 'PINNED_SAME_PROCESS',
      run: binding.run,
      beforeStartPolicy: binding.policyDigest,
      atReadyPolicy: binding.policyDigest,
      systemCredentialRoutes: 'DENIED_BY_EFFECTIVE_POLICY',
    },
    stop: { authority: 'REVOKED', worker: 'EXITED', lateOutput: 'REJECTED',
      keychainAndBillingSettings: 'UNCHANGED', modelRequests: 0 },
  };
}

function assertHeld(receipt) {
  assert.equal(receipt.status, 'HOLD');
  assert.equal(receipt.scope, 'SOURCE_ONLY');
  assert.equal(receipt.blockedStage, 'M4_SYSTEM_KEYCHAIN_POLICY');
  assert.equal(receipt.credentialServiceAccess, 'DENY_ALL');
  assert.equal(receipt.systemCredentialDenialVerified, false);
  assert.equal(receipt.hostQualified, false);
  assert.equal(receipt.signInAuthorized, false);
  assert.equal(receipt.liveLaunchPermitted, false);
  assert.equal(receipt.qualifyingBuilderReceiptsAdded, 0);
}

test('completing the synthetic design leaves the existing runner and credential gate held', () => {
  const before = sourceM4QualificationStatus();
  const result = rehearseM4SystemKeychainEnforcement(designFixture());
  assertHeld(result);
  assert.equal(result.rehearsal, 'COMPLETE');
  assert.equal(result.reason, 'SYNTHETIC_RESULTS_ONLY');
  assert.deepEqual(sourceM4QualificationStatus(), before);
});

const cases = [
  ['live provenance', 'INVALID_SYNTHETIC_INPUT', f => { f.origin = 'LIVE'; }],
  ['a changed vendor binary', 'INVALID_SYNTHETIC_INPUT', f => { f.binding.claudeDigest = 'b'.repeat(64); }],
  ['a caller-provided override', 'INVALID_SYNTHETIC_INPUT', f => { f.signInAuthorized = true; }],
  ['the current Keychain-only login', 'ISOLATED_SUBSCRIPTION_FILE_UNPROVEN', f => { f.auth.storage = 'KEYCHAIN'; }],
  ['credentials copied from another login', 'ISOLATED_SUBSCRIPTION_FILE_UNPROVEN', f => { f.auth.storage = 'COPIED'; }],
  ['cached login support absent for the pinned client', 'ISOLATED_SUBSCRIPTION_FILE_UNPROVEN', f => {
    f.auth.supportForPinnedClient = 'UNKNOWN';
  }],
  ['file replacement or multiply linked credentials', 'ISOLATED_SUBSCRIPTION_FILE_UNPROVEN', f => {
    f.auth.fileIdentity = 'PATH_ONLY';
  }],
  ['a controller that reads the credentials', 'ISOLATED_SUBSCRIPTION_FILE_UNPROVEN', f => {
    f.auth.credentialUseByController = 'READ';
  }],
  ['an alternate authentication method', 'ISOLATED_SUBSCRIPTION_FILE_UNPROVEN', f => { f.auth.fallback = 'ALLOWED'; }],
  ['a Keychain Mach service allow rule', 'CREDENTIAL_OR_HOST_PATH_NOT_DENIED', f => {
    f.denials.keychainServices = 'ALLOWED';
  }],
  ['an inherited credential-capable handle', 'CREDENTIAL_OR_HOST_PATH_NOT_DENIED', f => {
    f.denials.inheritedCredentialHandles = 'UNVERIFIED';
  }],
  ['a credential relay', 'CREDENTIAL_OR_HOST_PATH_NOT_DENIED', f => { f.denials.credentialRelays = 'ALLOWED'; }],
  ['absence from the default search list', 'CREDENTIAL_OR_HOST_PATH_NOT_DENIED', f => {
    f.denials.directSystemStore = 'NOT_OBSERVED';
  }],
  ['unverified alternate store paths', 'CREDENTIAL_OR_HOST_PATH_NOT_DENIED', f => {
    f.denials.alternateStorePath = 'UNVERIFIED';
  }],
  ['loopback access', 'CREDENTIAL_OR_HOST_PATH_NOT_DENIED', f => { f.denials.networkIncludingLoopback = 'ALLOWED'; }],
  ['a missing positive canary control', 'DISPOSABLE_CONTROL_INCONCLUSIVE', f => {
    f.control.owner.outcome = 'NOT_FOUND';
  }],
  ['item not found reported as access denial', 'DISPOSABLE_CONTROL_INCONCLUSIVE', f => {
    f.control.worker.outcome = 'NOT_FOUND';
  }],
  ['a denied query for a different synthetic item', 'DISPOSABLE_CONTROL_INCONCLUSIVE', f => {
    f.control.worker.item = 'fixture-other-credential';
  }],
  ['a disposable result substituted for M4 enforcement', 'M4_WORKER_ENFORCEMENT_UNPROVEN', f => {
    f.m4Enforcement.environment = 'SYNTHETIC_DISPOSABLE';
  }],
  ['a policy change between launch and readiness', 'M4_WORKER_ENFORCEMENT_UNPROVEN', f => {
    f.m4Enforcement.atReadyPolicy = 'c'.repeat(64);
  }],
  ['a different worker at readiness', 'M4_WORKER_ENFORCEMENT_UNPROVEN', f => {
    f.m4Enforcement.workerIdentity = 'CHANGED';
  }],
  ['output accepted after Stop', 'STOP_OR_NO_REQUEST_UNPROVEN', f => { f.stop.lateOutput = 'ACCEPTED'; }],
  ['a settings change', 'STOP_OR_NO_REQUEST_UNPROVEN', f => { f.stop.keychainAndBillingSettings = 'CHANGED'; }],
  ['a model request', 'STOP_OR_NO_REQUEST_UNPROVEN', f => { f.stop.modelRequests = 1; }],
];

for (const [description, reason, change] of cases) {
  test(`hold on ${description}`, () => {
    const fixture = designFixture();
    change(fixture);
    const result = rehearseM4SystemKeychainEnforcement(fixture);
    assertHeld(result);
    assert.equal(result.rehearsal, 'STOPPED');
    assert.equal(result.reason, reason);
  });
}
