import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

import { assessPrivateBetaReadiness } from '../../scripts/report-private-beta-readiness.mjs';
import { parseStrictJson } from '../../tools/dosai-acceptance/src/strict-json.mjs';

const root = resolve(import.meta.dirname, '../..');
const checkpoint = parseStrictJson(await readFile(resolve(
  root,
  'docs/development/private-beta-critical-path-status.json',
)));
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

test('private-beta checkpoint binds the exact current critical-path inputs', async () => {
  assert.equal(checkpoint.release_status, 'NO_GO');
  assert.deepEqual(checkpoint.operational_constraints, {
    credit_ceiling: 120,
    paid_activity_authorized: false,
    merge_authorized: false,
    production_use_authorized: false,
  });
  assert.equal(
    checkpoint.validated_source_baseline.head,
    '0585524f465231500340e592f8807aa875a739ac',
  );
  assert.equal(checkpoint.validated_source_baseline.source_validation.tests_passed, 605);
  assert.equal(checkpoint.validated_source_baseline.source_validation.typescript_projects_passed, 9);
  assert.equal(checkpoint.validated_source_baseline.source_validation.normal_builds_run, 0);
  assert.equal(checkpoint.validated_source_baseline.source_validation.build_authorized, false);
  assert.equal(checkpoint.fixture_overlay_validation.head, '0284f74d146f23581ab1833f817ac31883bcb96a');
  assert.equal(checkpoint.fixture_overlay_validation.tests_passed, 578);
  assert.equal(checkpoint.fixture_overlay_validation.integration_authorized, true);
  assert.equal(checkpoint.fixture_overlay_validation.integration_completed, true);
  assert.deepEqual(checkpoint.fixture_overlay_validation.integrated_commit_postimages, [
    'ee135d8e1bc14ded2f9a9155b3daf49a0baf1e1c',
    '7f2d52044fe28d6e8a9a24a10852fcbd9f386d44',
  ]);
  const builders = checkpoint.gates.find(({ id }) => id === 'BETA-CP-004');
  assert.equal(builders.candidate_host_source, 'TWO_STANDARD_GITHUB_HOSTED_UBUNTU_24_04_JOBS');
  assert.equal(builders.offline_verifier_status, 'IMPLEMENTED_SOURCE_ONLY_NOT_EXECUTED');
  assert.equal(builders.offline_verifier_success_claim, 'PASS_CANDIDATE_HOSTS_ONLY');
  const lifecycle = checkpoint.gates.find(({ id }) => id === 'BETA-CP-002');
  assert.equal(
    lifecycle.status,
    'SOURCE_CORRECTED_PHYSICAL_PROOF_AWAITING_OWNER_AUTHORIZATION',
  );
  assert.equal(
    lifecycle.physical_gate,
    'P3_V50_SERVICE_MANAGEMENT_LIFECYCLE_PHYSICAL_PROOF_GATE',
  );
  const p3Acceptance = checkpoint.gates.find(({ id }) => id === 'BETA-CP-005');
  assert.equal(p3Acceptance.proposal_prepared, true);
  assert.equal(p3Acceptance.handler_plan_prepared, true);
  assert.equal(p3Acceptance.declared_assertion_occurrences, 27);
  assert.equal(p3Acceptance.acceptance_proven_assertion_occurrences, 0);
  assert.equal(p3Acceptance.proposed_manifest_count, 3);
  for (const binding of checkpoint.bound_inputs) {
    assert.equal(sha256(await readFile(resolve(root, binding.path))), binding.sha256);
  }
});

test('critical-path report remains fail-closed until every required gate passes', async () => {
  const report = await assessPrivateBetaReadiness();
  assert.equal(report.ready, false);
  assert.equal(report.release_status, 'NO_GO');
  assert.equal(report.operational_credit_ceiling, 120);
  assert.equal(report.paid_activity_authorized, false);
  assert.deepEqual(report.blockers.map(({ id }) => id), [
    'BETA-CP-002',
    'BETA-CP-004',
    'BETA-CP-005',
    'BETA-CP-006',
  ]);
});

test('checkpoint never converts source or compatibility evidence into runtime authority', () => {
  assert.equal(checkpoint.validated_source_baseline.source_validation.tests_failed, 0);
  assert.equal(checkpoint.fixture_overlay_validation.tests_failed, 0);
  assert.equal(checkpoint.fixture_overlay_validation.provider_spend, 0);
  assert.equal(checkpoint.gates.find(({ id }) => id === 'BETA-CP-001').status, 'PASS');
  assert.equal(checkpoint.gates.find(({ id }) => id === 'BETA-CP-003').status, 'PASS');
  assert.ok(checkpoint.gates
    .filter(({ id }) => !['BETA-CP-001', 'BETA-CP-003'].includes(id))
    .every(({ status }) => status !== 'PASS'));
  assert.equal(checkpoint.gates.at(-1).status, 'NOT_READY');
});
