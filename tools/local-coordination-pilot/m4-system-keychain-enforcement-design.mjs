// Source-only review of a hypothetical, Keychain-denied worker. No native caller.
import { isDeepStrictEqual } from 'node:util';
import { m4SystemKeychainPolicy } from './m4-system-keychain-policy.mjs';

const sourceRevision = '80b02a206e8d521c34091b722ff9ced18af35553';
const claudeDigest = '21d6e7b9a6f07b4cfcb7df13760b3b72aa25e084e13a5354413382987ba832ed';

function exactFields(value, fields) {
  return value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype
    && Object.keys(value).length === fields.length && fields.every(field => Object.hasOwn(value, field));
}

function result(rehearsal, reason) {
  return {
    status: 'HOLD',
    scope: 'SOURCE_ONLY',
    rehearsal,
    blockedStage: m4SystemKeychainPolicy.blockedStage,
    reason,
    credentialServiceAccess: m4SystemKeychainPolicy.credentialServiceAccess,
    systemCredentialDenialVerified: false,
    hostQualified: false,
    signInAuthorized: false,
    liveLaunchPermitted: false,
    qualifyingBuilderReceiptsAdded: 0,
  };
}

export function rehearseM4SystemKeychainEnforcement(input) {
  const fields = ['version', 'origin', 'binding', 'auth', 'denials', 'control', 'm4Enforcement', 'stop'];
  if (!exactFields(input, fields) || input.version !== 1 || input.origin !== 'SYNTHETIC_ONLY'
    || !exactFields(input.binding, ['run', 'sourceRevision', 'claudeDigest', 'policyDigest'])
    || typeof input.binding.run !== 'string' || !/^fixture-[a-z0-9-]{1,48}$/.test(input.binding.run)
    || input.binding.sourceRevision !== sourceRevision || input.binding.claudeDigest !== claudeDigest
    || typeof input.binding.policyDigest !== 'string' || !/^[a-f0-9]{64}$/.test(input.binding.policyDigest)) {
    return result('STOPPED', 'INVALID_SYNTHETIC_INPUT');
  }

  const { run, policyDigest } = input.binding;
  const requirements = [
    ['auth', {
      provider: 'CLAUDE_SUBSCRIPTION',
      storage: 'VENDOR_CREATED_PROFILE_FILE',
      supportForPinnedClient: 'MODELED_CONFIRMED',
      fileIdentity: 'OWNER_ONLY_SINGLE_LINK_STABLE',
      credentialUseByController: 'NONE',
      fallback: 'DENIED',
    }, 'ISOLATED_SUBSCRIPTION_FILE_UNPROVEN'],
    ['denials', {
      keychainServices: 'DENIED',
      inheritedCredentialHandles: 'DENIED',
      credentialRelays: 'DENIED',
      directSystemStore: 'DENIED',
      alternateStorePath: 'DENIED',
      ordinaryUserStore: 'DENIED',
      offProfileFileAccess: 'DENIED',
      childExecution: 'DENIED',
      networkIncludingLoopback: 'DENIED',
    }, 'CREDENTIAL_OR_HOST_PATH_NOT_DENIED'],
    ['control', {
      environment: 'SYNTHETIC_DISPOSABLE',
      policyDigest,
      owner: { item: 'fixture-system-credential', outcome: 'PRESENT_READABLE' },
      worker: { item: 'fixture-system-credential', outcome: 'ACCESS_DENIED' },
    }, 'DISPOSABLE_CONTROL_INCONCLUSIVE'],
    ['m4Enforcement', {
      environment: 'SYNTHETIC_M4_POLICY_BOUND',
      workerIdentity: 'PINNED_SAME_PROCESS',
      run,
      beforeStartPolicy: policyDigest,
      atReadyPolicy: policyDigest,
      systemCredentialRoutes: 'DENIED_BY_EFFECTIVE_POLICY',
    }, 'M4_WORKER_ENFORCEMENT_UNPROVEN'],
    ['stop', {
      authority: 'REVOKED',
      worker: 'EXITED',
      lateOutput: 'REJECTED',
      keychainAndBillingSettings: 'UNCHANGED',
      modelRequests: 0,
    }, 'STOP_OR_NO_REQUEST_UNPROVEN'],
  ];

  for (const [section, expected, reason] of requirements) {
    if (!isDeepStrictEqual(input[section], expected)) return result('STOPPED', reason);
  }
  return result('COMPLETE', 'SYNTHETIC_RESULTS_ONLY');
}
