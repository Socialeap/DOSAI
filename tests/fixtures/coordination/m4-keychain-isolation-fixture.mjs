// Inert qualification evidence for ADR 0022. These values simulate an OS
// boundary and cannot establish that one exists on any host.
import { isDeepStrictEqual } from 'node:util';

const executableDigest = '21d6e7b9a6f07b4cfcb7df13760b3b72aa25e084e13a5354413382987ba832ed';
const scope = {
  host: 'synthetic-m4',
  osBuild: 'synthetic-build',
  policyDigest: 'a'.repeat(64),
};

const stopped = ['STOP_REQUESTED', 'AUTHORITY_REVOKED', 'WORKER_EXITED',
  'LATE_OUTPUT_REJECTED', 'REPLAY_REJECTED'];

const expected = {
  provenance: {
    schema: 'DOSAI_M4_CLAUDE_KEYCHAIN_FIXTURE_V1',
    origin: 'SYNTHETIC_ONLY',
    ...scope,
  },
  identity: {
    standardUser: true,
    dedicatedUid: 601,
    controlUid: 602,
    loginSession: 'fixture-login-1',
    processStart: 'fixture-worker-start-1',
    executableDigest,
    supervisorDigest: 'b'.repeat(64),
    channel: 'fixture-private-inherited-channel',
    wrongUid: 'DENIED_BEFORE_READY',
    wrongSession: 'DENIED_BEFORE_READY',
    staleProcess: 'DENIED_BEFORE_READY',
    changedExecutable: 'DENIED_BEFORE_READY',
  },
  userKeychains: {
    dedicated: { item: 'fixture-user-1', candidate: 'PRESENT' },
    crossUserControl: { item: 'fixture-user-2', owner: 'PRESENT' },
    crossUserCandidate: { item: 'fixture-user-2', candidate: 'ACCESS_DENIED' },
  },
  systemKeychain: {
    fixtureControl: { item: 'fixture-system-1', environment: 'synthetic-disposable', owner: 'PRESENT' },
    fixtureCandidate: { item: 'fixture-system-1', environment: 'synthetic-disposable', candidate: 'ACCESS_DENIED' },
    policyBinding: {
      origin: 'SYNTHETIC_M4_ENFORCEMENT_MODEL',
      ...scope,
      unrelatedSystemCredentialAccess: 'DENIED_BY_REVIEWED_POLICY',
    },
  },
  hostAccess: {
    ordinaryHome: 'DENIED',
    offProfileRead: 'DENIED',
    offProfileWrite: 'DENIED',
    codexProfile: 'DENIED',
    childExecution: 'DENIED',
    network: 'DENIED',
    loopback: 'DENIED',
  },
  stop: {
    beforeReadiness: ['STARTUP_PENDING', ...stopped],
    afterReadiness: ['PINNED_WORKER_READY', ...stopped],
  },
  cleanup: {
    ownedWorker: 'EXITED',
    syntheticFixtures: 'REMOVED',
    existingKeychainSettings: 'UNCHANGED',
    billingSettings: 'UNCHANGED',
    modelRequests: 0,
    subscriptionAttached: false,
  },
};

export function m4KeychainIsolationFixture() {
  return structuredClone(expected);
}

export function checkM4KeychainIsolationFixture(trace) {
  const plainTrace = trace !== null && typeof trace === 'object' &&
    Object.getPrototypeOf(trace) === Object.prototype;
  const mismatches = plainTrace
    ? Object.keys(expected).filter(check => !Object.hasOwn(trace, check) ||
        !isDeepStrictEqual(trace[check], expected[check]))
    : [];
  if (!plainTrace || Object.keys(trace).some(key => !Object.hasOwn(expected, key))) {
    mismatches.push('unexpectedFields');
  }

  // This test oracle compares synthetic observations only. Its result is
  // intentionally incapable of admitting a host, authorizing sign-in, or
  // clearing any execution or builder gate.
  return {
    status: mismatches.length === 0 ? 'SYNTHETIC_EXPECTATIONS_MET' : 'HOLD',
    mismatches,
    hostQualified: false,
    signInAuthorized: false,
    liveLaunchPermitted: false,
    qualifyingBuilderReceiptsAdded: 0,
  };
}
