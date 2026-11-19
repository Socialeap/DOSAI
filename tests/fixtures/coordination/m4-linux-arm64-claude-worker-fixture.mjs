// Inert observations for the proposed Linux guest path. Nothing in this
// fixture probes a VM, reads credentials, or reaches a provider.
import { isDeepStrictEqual } from 'node:util';

const guest = 'fixture-vm-generation-1';
const profile = 'fixture-private-profile';
const credentialFile = 'fixture-device-inode-1';
const stopSequence = [
  'STOP_REQUESTED',
  'AUTHORITY_REVOKED',
  'OWNED_PROCESS_EXITED',
  'LATE_OUTPUT_REJECTED',
  'REPLAY_REJECTED',
  'CLEANUP_VERIFIED',
];

const expected = {
  provenance: {
    schema: 'DOSAI_M4_LINUX_ARM64_CLAUDE_WORKER_FIXTURE_V1',
    origin: 'SYNTHETIC_ONLY',
    host: 'Apple M4',
    guestOS: 'linux',
    architecture: 'arm64',
    emulation: false,
    guest,
    imageDigest: 'a'.repeat(64),
    kernelDigest: 'b'.repeat(64),
    vmConfigDigest: 'c'.repeat(64),
    supervisorDigest: 'd'.repeat(64),
    worker: {
      version: '2.1.314',
      target: 'linux-arm64',
      binaryDigest: 'a66c0a8f5d0c87a439953d797985192bbcbaefbce2e0d7b2eaa8df30ef0f3ef2',
      manifestDigest: 'ded1c9a0a47ae65dc03165b0fab7b0bbd4aadd55de20b53c9f994308552d623d',
    },
  },
  isolation: {
    dedicatedDisposableGuest: true,
    account: 'NON_ADMIN',
    workspace: 'EMPTY',
    sharedDevices: [],
    hostShares: [],
    clipboard: 'DISABLED',
    fileCanaryControl: 'PRESENT',
    fileCanaryFromGuest: 'DENIED',
    connectionCanaryControl: 'REACHABLE',
    connectionCanaryFromGuest: 'DENIED',
    subprocess: 'DENIED',
  },
  signIn: {
    separateApproval: 'SYNTHETIC_ONLY',
    actor: 'LOCAL_OWNER',
    client: 'STOCK_CLAUDE_CODE',
    browser: 'DEDICATED_GUEST_PROFILE',
    egress: 'REVIEWED_VENDOR_AUTH_ONLY',
    supervisor: 'INACTIVE',
    worker: 'INACTIVE',
    authType: 'SUBSCRIPTION',
    apiKeyFallback: false,
    modelRequests: 0,
    credential: {
      source: 'VENDOR_CREATED_IN_GUEST',
      profile,
      createdIdentity: credentialFile,
      owner: 'GUEST_PROFILE_OWNER',
      mode: '0600',
      links: 1,
      symbolicLink: false,
      sharedMount: false,
      copies: 0,
    },
  },
  startup: {
    sequence: [
      'ISOLATION_CHECKED',
      'SEPARATE_OWNER_APPROVAL_MODELED',
      'OWNER_SIGN_IN_FINISHED',
      'EXTERNAL_NIC_REMOVED',
      'GUEST_EGRESS_DENIED',
      'GUEST_LOOPBACK_DENIED',
      'FIXED_STARTUP_READY',
    ],
    guest,
    profile,
    credentialIdentity: credentialFile,
    processStart: 'fixture-ready-process-start',
    subscriptionStatus: 'CACHED_ONLY',
    modelRequests: 0,
    wrongGuest: 'DENIED_BEFORE_READY',
    wrongProfile: 'DENIED_BEFORE_READY',
    wrongBinary: 'DENIED_BEFORE_READY',
    staleProcess: 'DENIED_BEFORE_READY',
  },
  stop: {
    beforeReadiness: {
      guest,
      processStart: 'fixture-pending-process-start',
      sequence: ['STARTUP_PENDING', ...stopSequence],
    },
    afterReadiness: {
      guest,
      processStart: 'fixture-ready-process-start',
      sequence: ['FIXED_STARTUP_READY', ...stopSequence],
    },
  },
  receipt: {
    origin: 'SYNTHETIC_ONLY',
    scope: 'GUEST_STARTUP_ONLY',
    bridge: 'INACTIVE',
    credentialsExported: false,
    liveLaunches: 0,
    qualifyingBuilderReceipts: 0,
  },
};

export function m4LinuxArm64ClaudeWorkerFixture() {
  return structuredClone(expected);
}

export function checkM4LinuxArm64ClaudeWorkerFixture(trace) {
  const plainTrace = trace !== null && typeof trace === 'object' &&
    Object.getPrototypeOf(trace) === Object.prototype;
  const mismatches = plainTrace
    ? Object.keys(expected).filter(check => !Object.hasOwn(trace, check) ||
        !isDeepStrictEqual(trace[check], expected[check]))
    : [];
  if (!plainTrace || Reflect.ownKeys(trace).some(key => !Object.hasOwn(expected, key))) {
    mismatches.push('unexpectedFields');
  }

  // The oracle returns fixed gate outcomes even when all fictional evidence
  // matches. It has no production caller and grants no authority.
  return {
    status: mismatches.length === 0 ? 'SYNTHETIC_EXPECTATIONS_MET' : 'HOLD',
    mismatches,
    hostQualified: false,
    guestExecutionAuthorized: false,
    signInAuthorized: false,
    liveLaunchPermitted: false,
    qualifyingBuilderReceiptsAdded: 0,
  };
}
