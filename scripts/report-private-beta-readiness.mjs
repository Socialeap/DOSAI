import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseStrictJson } from '../tools/dosai-acceptance/src/strict-json.mjs';

const root = resolve(import.meta.dirname, '..');
const statusPath = 'docs/development/private-beta-critical-path-status.json';

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

async function readJson(path) {
  return parseStrictJson(await readFile(resolve(root, path)));
}

function everyAuthorityIsFalse(record) {
  return record.authorities !== null && typeof record.authorities === 'object' &&
    Object.values(record.authorities).length > 0 &&
    Object.values(record.authorities).every(value => value === false);
}

export async function assessPrivateBetaReadiness() {
  const checkpoint = await readJson(statusPath);
  if (
    checkpoint.record_type !== 'DOSAI_SUPERVISED_PRIVATE_BETA_CRITICAL_PATH_STATUS' ||
    checkpoint.target !== 'SUPERVISED_PRIVATE_BETA_FULL_FUNCTIONALITY_TESTING' ||
    checkpoint.operational_constraints.credit_ceiling !== 120 ||
    checkpoint.operational_constraints.paid_activity_authorized !== false ||
    checkpoint.operational_constraints.merge_authorized !== false ||
    checkpoint.operational_constraints.production_use_authorized !== false
  ) {
    throw new Error('PRIVATE_BETA_CHECKPOINT_REJECTED');
  }

  const boundRecords = new Map();
  for (const binding of checkpoint.bound_inputs) {
    const bytes = await readFile(resolve(root, binding.path));
    if (sha256(bytes) !== binding.sha256) throw new Error('PRIVATE_BETA_INPUT_CHANGED');
    boundRecords.set(binding.path, parseStrictJson(bytes));
  }

  const physical = boundRecords.get(
    'docs/architecture/p3-v50-service-management-lifecycle-physical-proof-gate-v2.json',
  );
  const stagedLifecycleLauncher = boundRecords.get(
    'docs/architecture/p3-v50-stable-path-launcher-source-record.json',
  );
  const lifecycleSource = boundRecords.get('docs/architecture/process-ownership-v50.json');
  const lifecycleSourceAuthorization = boundRecords.get(
    'docs/architecture/p3-v50-first-registration-authorization-record.json',
  );
  const trustRoot = boundRecords.get(
    'docs/architecture/p3-debian-archive-trust-root-source-recommendation.json',
  );
  const builders = boundRecords.get(
    'docs/architecture/p3-linux-builder-v2-acceptance-record.json',
  );
  const builderHosts = boundRecords.get(
    'docs/architecture/p3-native-builder-host-source-recommendation.json',
  );
  const catalog = boundRecords.get('docs/testing/acceptance-test-catalog-v5.json');
  const p3AcceptanceProposal = boundRecords.get(
    'docs/architecture/p3-acceptance-fixture-generation-proposal.json',
  );
  const p3HandlerPlan = boundRecords.get(
    'docs/architecture/p3-acceptance-handler-implementation-proposal.json',
  );
  const authorization = boundRecords.get(
    'docs/architecture/private-beta-bounded-action-authorization.json',
  );
  const lifecycleResult = boundRecords.get(
    'docs/architecture/p3-v49-service-management-lifecycle-physical-proof-result.json',
  );
  const trustRootResult = boundRecords.get(
    'docs/architecture/p3-debian-archive-trust-root-observation-result.json',
  );
  const hostObservationResult = boundRecords.get(
    'docs/architecture/p3-native-builder-host-feasibility-observation-result.json',
  );
  const replacementLifecycleResult = boundRecords.get(
    'docs/architecture/p3-v49-service-management-lifecycle-replacement-result.json',
  );
  const trustRootV2 = boundRecords.get(
    'docs/architecture/p3-debian-archive-trust-root-source-recommendation-v2.json',
  );
  const trustRootV2Result = boundRecords.get(
    'docs/architecture/p3-debian-archive-trust-root-observation-v2-result.json',
  );
  const hostWorkflowPreparation = boundRecords.get(
    'docs/architecture/p3-native-builder-host-workflow-preparation-result.json',
  );
  const hostObservationVerifier = boundRecords.get(
    'docs/architecture/p3-native-builder-host-observation-verifier-source-record.json',
  );
  if (
    physical?.record_version !== 2 ||
    physical?.status !== 'AWAITING_OWNER_AUTHORIZATION' ||
    physical?.subject?.commit !== checkpoint.validated_source_baseline.head ||
    physical?.fixed_attempt?.runner_path !==
      'scripts/service-management-lifecycle-staged-proof.mjs' ||
    physical?.fixed_attempt?.stable_test_application_path !==
      '/Users/shakoure/Library/Application Support/DOSAI/TestProofs/v50/DOSAI.app' ||
    stagedLifecycleLauncher?.status !== 'IMPLEMENTED_SOURCE_ONLY_NOT_EXECUTED' ||
    stagedLifecycleLauncher?.contract?.stable_application_path !==
      physical?.fixed_attempt?.stable_test_application_path ||
    stagedLifecycleLauncher?.contract?.launch_attempt_limit !== 1 ||
    stagedLifecycleLauncher?.contract?.retry_allowed !== false ||
    !everyAuthorityIsFalse(stagedLifecycleLauncher) ||
    lifecycleSource?.status !== 'IMPLEMENTED_OWNER_AUTHORIZED_SOURCE_ONLY' ||
    lifecycleSource?.runtime_status !== 'NO_GO' ||
    Object.values(lifecycleSource?.authority ?? {}).length === 0 ||
    Object.values(lifecycleSource?.authority ?? {}).some(value => value !== false) ||
    lifecycleSourceAuthorization?.status !== 'ACCEPTED' ||
    lifecycleSourceAuthorization?.credit_ceiling !== 120 ||
    lifecycleSourceAuthorization?.paid_activity_authorized !== false ||
    Object.values(lifecycleSourceAuthorization?.denied_scope ?? {}).some(value => value !== true) ||
    trustRoot?.status !== 'PROPOSED_FOR_OWNER_REVIEW' ||
    builders?.status !== 'ACCEPTED' ||
    builderHosts?.status !== 'PROPOSED_FOR_OWNER_REVIEW' ||
    !everyAuthorityIsFalse(physical) ||
    !everyAuthorityIsFalse(trustRoot) ||
    !everyAuthorityIsFalse(builders) ||
    !everyAuthorityIsFalse(builderHosts) ||
    p3AcceptanceProposal?.status !== 'PROPOSED_FOR_OWNER_REVIEW' ||
    !everyAuthorityIsFalse(p3AcceptanceProposal) ||
    p3HandlerPlan?.status !== 'PROPOSED_SOURCE_PLAN_NOT_AUTHORIZED' ||
    p3HandlerPlan?.current_assurance?.acceptance_proven_assertion_count !== 0 ||
    !everyAuthorityIsFalse(p3HandlerPlan) ||
    authorization?.status !== 'AUTHORIZED_ACTIONS_CONSUMED_WITH_ONE_PASS_ONE_FAIL_ONE_PREPARED' ||
    authorization?.operational_constraints?.maximum_charge_usd !== 0 ||
    authorization?.operational_constraints?.retry_authorized !== false ||
    lifecycleResult?.status !== 'FAILED_CLOSED_REAUTHORIZATION_REQUIRED' ||
    lifecycleResult?.runner_result?.app_launches !== 0 ||
    trustRootResult?.status !== 'FAILED_CLOSED_REAUTHORIZATION_REQUIRED' ||
    trustRootResult?.containment?.temporary_bytes_deleted_verified !== true ||
    hostObservationResult?.status !== 'BLOCKED_BEFORE_WORKFLOW_CREATION' ||
    hostObservationResult?.observed_effects?.workflow_dispatches !== 0 ||
    replacementLifecycleResult?.status !== 'FAILED_CLOSED_PRECONDITION_NOT_FOUND' ||
    replacementLifecycleResult?.receipt?.register_attempts !== 0 ||
    trustRootV2?.status !== 'OWNER_AUTHORIZED_OBSERVATION_PENDING' ||
    trustRootV2Result?.status !== 'PASS_READ_ONLY_SOURCE_OBSERVATION' ||
    trustRootV2Result?.containment?.key_import_performed !== false ||
    hostWorkflowPreparation?.status !== 'PREPARED_UNMERGED_NOT_DISPATCHABLE' ||
    hostWorkflowPreparation?.external_effects?.workflow_dispatches !== 0 ||
    hostObservationVerifier?.status !== 'IMPLEMENTED_SOURCE_ONLY_NOT_EXECUTED' ||
    hostObservationVerifier?.contract?.success_status !== 'PASS_CANDIDATE_HOSTS_ONLY' ||
    hostObservationVerifier?.contract?.builder_receipts_produced_on_success !== 0 ||
    !everyAuthorityIsFalse(hostObservationVerifier)
  ) {
    throw new Error('PRIVATE_BETA_AUTHORITY_STATE_CHANGED');
  }

  const p3Suites = catalog.suites.filter(({ phase }) => phase === 'P3');
  if (
    p3Suites.length !== 3 ||
    p3Suites.some(({ implementation_state: state }) => state !== 'NOT_IMPLEMENTED')
  ) {
    throw new Error('PRIVATE_BETA_P3_ACCEPTANCE_STATE_CHANGED');
  }

  const blockers = checkpoint.gates
    .filter(({ status }) => status !== 'PASS')
    .map(({ blocking_evidence: evidence, id, status }) => ({ evidence, id, status }));
  return Object.freeze({
    target: checkpoint.target,
    ready: blockers.length === 0,
    release_status: blockers.length === 0 ? 'GO_FOR_SUPERVISED_FULL_FUNCTIONALITY_TESTING' : 'NO_GO',
    operational_credit_ceiling: checkpoint.operational_constraints.credit_ceiling,
    paid_activity_authorized: false,
    blockers,
  });
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  if (process.argv.length !== 2) {
    console.error('Usage: node scripts/report-private-beta-readiness.mjs');
    process.exitCode = 2;
  } else {
    try {
      const assessment = await assessPrivateBetaReadiness();
      console.log(JSON.stringify(assessment, null, 2));
      process.exitCode = assessment.ready ? 0 : 2;
    } catch {
      console.error('PRIVATE_BETA_READINESS_EVIDENCE_REJECTED');
      process.exitCode = 2;
    }
  }
}
