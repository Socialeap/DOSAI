// Source-only rehearsal. Physical collectors, credential handling, and a guest
// transport require separate review and are outside this module.
import { createHash } from 'node:crypto';

const sourceRevision = '4035b055f1f9ea9a99b0be1bd8fa883f8589c945';
const target = 'linux-arm64';
const binaryDigest = 'a66c0a8f5d0c87a439953d797985192bbcbaefbce2e0d7b2eaa8df30ef0f3ef2';
const manifestDigest = 'ded1c9a0a47ae65dc03165b0fab7b0bbd4aadd55de20b53c9f994308552d623d';

const stages = [
  'NATIVE_GUEST_IDENTITY',
  'GUEST_ISOLATION',
  'OWNER_SIGN_IN_BOUNDARY',
  'NETWORK_DENIED_STARTUP',
  'STOP_REVOCATION_AND_CLEANUP',
  'SANITIZED_RECEIPT',
];
const observationIndexes = stages.map((_, index) => String(index));
const physicalGate = 'PHYSICAL_GUEST_QUALIFICATION';
const syntheticIds = ['caseId', 'guest', 'profile', 'credentialIdentity', 'pendingProcessStart', 'readyProcessStart'];
const guestDigests = ['imageDigest', 'kernelDigest', 'vmConfigDigest', 'supervisorDigest'];
const bindingFields = ['sourceRevision', 'target', 'binaryDigest', 'manifestDigest', ...syntheticIds, ...guestDigests];

function exactFields(value, fields) {
  return value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype &&
    Reflect.ownKeys(value).length === fields.length &&
    fields.every(field => Object.hasOwn(Object.getOwnPropertyDescriptor(value, field) ?? {}, 'value'));
}

function validInput(input) {
  if (!exactFields(input, ['version', 'origin', 'binding', 'observations']) ||
      input.version !== 1 || input.origin !== 'SYNTHETIC_ONLY') return false;

  const { binding, observations } = input;
  return exactFields(binding, bindingFields) &&
    binding.sourceRevision === sourceRevision && binding.target === target &&
    binding.binaryDigest === binaryDigest && binding.manifestDigest === manifestDigest &&
    syntheticIds.every(field => typeof binding[field] === 'string' && /^fixture-[a-z0-9-]{1,48}$/.test(binding[field])) &&
    binding.pendingProcessStart !== binding.readyProcessStart &&
    guestDigests.every(field => typeof binding[field] === 'string' && /^[a-f0-9]{64}$/.test(binding[field])) &&
    Array.isArray(observations) && Object.getPrototypeOf(observations) === Array.prototype &&
    observations.length <= stages.length &&
    Reflect.ownKeys(observations).every(key => key === 'length' || observationIndexes.includes(key));
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

export function sourceM4LinuxArm64ClaudeQualificationStatus() {
  return report('NOT_RUN', [], physicalGate, 'PHYSICAL_GUEST_BOUNDARY_UNVERIFIED');
}

// The digest correlates rows within an offline rehearsal. A caller can compute
// it, so it provides neither an attestation nor a grant.
export function rehearseM4LinuxArm64ClaudeQualification(input) {
  if (!validInput(input)) {
    return report('STOPPED', [], stages[0], 'INVALID_SYNTHETIC_INPUT');
  }

  const { version, origin, binding, observations } = input;
  const boundary = bindingFields.map(field => binding[field]);
  const bindingDigest = createHash('sha256')
    .update(JSON.stringify(['DOSAI_M4_LINUX_ARM64_CLAUDE_QUALIFICATION', version, origin, ...boundary]))
    .digest('hex');

  const completedStages = [];
  for (const [index, stage] of stages.entries()) {
    const row = Object.getOwnPropertyDescriptor(observations, index);
    if (row === undefined) {
      return report('STOPPED', completedStages, stage, 'OBSERVATION_MISSING');
    }
    const observation = row.value;
    if (!exactFields(observation, ['stage', 'bindingDigest', 'verdict']) ||
        observation.stage !== stage || observation.bindingDigest !== bindingDigest ||
        !['MATCHED', 'UNAVAILABLE', 'CONTRADICTED'].includes(observation.verdict)) {
      return report('STOPPED', completedStages, stage, 'OBSERVATION_REJECTED');
    }
    if (observation.verdict !== 'MATCHED') {
      return report('STOPPED', completedStages, stage, observation.verdict);
    }
    completedStages.push(stage);
  }

  return report('COMPLETE', completedStages, physicalGate, 'SYNTHETIC_RESULTS_ONLY');
}

if (import.meta.main) {
  if (process.argv.length !== 2 || process.versions.node !== '24.18.0') {
    console.error('Invalid Linux ARM64 Claude qualification invocation.');
    process.exitCode = 1;
  } else {
    console.log(JSON.stringify(sourceM4LinuxArm64ClaudeQualificationStatus()));
    process.exitCode = 2;
  }
}
