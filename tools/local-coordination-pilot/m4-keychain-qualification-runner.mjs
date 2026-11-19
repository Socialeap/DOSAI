// Source-only staging runner for the M4 Claude Code qualification proposal.
// Physical collectors and a reviewed credential boundary are separate work.
import { createHash } from 'node:crypto';
import { m4SystemKeychainPolicy } from './m4-system-keychain-policy.mjs';

const revision = 'cf97bd5247ecf0158a27a28445b0b408b0e511ff';
const claudeDigest = '21d6e7b9a6f07b4cfcb7df13760b3b72aa25e084e13a5354413382987ba832ed';
const stages = [
  'LOGIN_AND_WORKER_IDENTITY',
  'USER_KEYCHAIN_CONTROLS',
  'DISPOSABLE_SYSTEM_KEYCHAIN_CONTROL',
  m4SystemKeychainPolicy.blockedStage,
  'HOST_AND_NETWORK_DENIAL',
  'STARTUP_STOP_AND_REVOCATION',
  'OWNED_CLEANUP',
];
const verdicts = ['MATCHED', 'UNAVAILABLE', 'CONTRADICTED'];

function exactFields(value, fields) {
  return value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype
    && Object.keys(value).length === fields.length && fields.every(field => Object.hasOwn(value, field));
}

function report(rehearsal, completedStages, blockedStage, reason) {
  return {
    version: 1,
    status: 'HOLD',
    scope: 'SOURCE_ONLY',
    rehearsal,
    completedStages,
    blockedStage,
    reason,
    hostQualified: false,
    hostMutationAuthorized: false,
    signInAuthorized: false,
    liveLaunchPermitted: false,
    qualifyingBuilderReceiptsAdded: 0,
  };
}

export function sourceM4QualificationStatus() {
  return report('NOT_RUN', [], m4SystemKeychainPolicy.blockedStage, m4SystemKeychainPolicy.reason);
}

// Accept only synthetic stage results from offline tests. The digest binds
// stages to one fictional run. It is not an attestation or an approval.
export function rehearseM4KeychainQualification(input) {
  if (!exactFields(input, ['version', 'origin', 'binding', 'observations'])
    || input.version !== 1 || input.origin !== 'SYNTHETIC_ONLY'
    || !exactFields(input.binding, ['caseId', 'sourceRevision', 'claudeDigest', 'policyDigest'])
    || typeof input.binding.caseId !== 'string' || !/^fixture-[a-z0-9-]{1,48}$/.test(input.binding.caseId)
    || input.binding.sourceRevision !== revision || input.binding.claudeDigest !== claudeDigest
    || typeof input.binding.policyDigest !== 'string' || !/^[a-f0-9]{64}$/.test(input.binding.policyDigest)
    || !Array.isArray(input.observations) || input.observations.length > stages.length) {
    return report('STOPPED', [], stages[0], 'INVALID_SYNTHETIC_INPUT');
  }

  const { caseId, sourceRevision, policyDigest } = input.binding;
  const bindingDigest = createHash('sha256')
    .update(JSON.stringify([1, input.origin, caseId, sourceRevision, claudeDigest, policyDigest])).digest('hex');
  const completedStages = [];
  for (const [index, stage] of stages.entries()) {
    const observation = input.observations[index];
    if (observation === undefined) {
      return report('STOPPED', completedStages, stage, 'OBSERVATION_MISSING');
    }
    if (!exactFields(observation, ['stage', 'bindingDigest', 'verdict'])
      || observation.stage !== stage || observation.bindingDigest !== bindingDigest
      || !verdicts.includes(observation.verdict)) {
      return report('STOPPED', completedStages, stage, 'OBSERVATION_REJECTED');
    }
    if (observation.verdict !== 'MATCHED') {
      return report('STOPPED', completedStages, stage, observation.verdict);
    }
    completedStages.push(stage);
  }

  return report('COMPLETE', completedStages, m4SystemKeychainPolicy.blockedStage, 'SYNTHETIC_RESULTS_ONLY');
}

// Operator entry point. No input stream, native driver, authentication call,
// network access, subprocess launch, or configuration write is reachable here.
if (import.meta.main) {
  if (process.argv.length !== 2 || process.versions.node !== '24.18.0') {
    console.error('Invalid M4 qualification invocation.');
    process.exitCode = 1;
  } else {
    console.log(JSON.stringify(sourceM4QualificationStatus()));
    process.exitCode = 2;
  }
}
