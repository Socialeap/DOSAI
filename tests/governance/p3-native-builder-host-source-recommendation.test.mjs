import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

import { parseStrictJson } from '../../tools/dosai-acceptance/src/strict-json.mjs';

const root = resolve(import.meta.dirname, '../..');
const record = parseStrictJson(await readFile(resolve(
  root,
  'docs/architecture/p3-native-builder-host-source-recommendation.json',
)));
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

test('builder-host recommendation binds accepted ADR and no-authority builder state', async () => {
  assert.equal(record.status, 'PROPOSED_FOR_OWNER_REVIEW');
  assert.equal(record.scope, 'HOST_FEASIBILITY_OBSERVATION_RECOMMENDATION_ONLY');
  for (const binding of record.preconditions) {
    assert.equal(sha256(await readFile(resolve(root, binding.path))), binding.sha256);
  }
  assert.ok(Object.values(record.authorities).every(value => value === false));
});

test('candidate fixes two standard x64 GitHub-hosted jobs without claiming proof', () => {
  assert.deepEqual(record.candidate, {
    provider: 'GITHUB_HOSTED_STANDARD',
    runner_label: 'ubuntu-24.04',
    expected_runner_environment: 'github-hosted',
    expected_os: 'Linux',
    expected_architecture: 'X64',
    required_jobs: 2,
    same_provider_allowed_by_adr: true,
    distinct_fresh_vm_required_per_job: true,
    candidate_only: true,
    physical_linux_builder_verified: false,
  });
  assert.deepEqual(record.repository_observation, {
    repository: 'Socialeap/DOSAI',
    observed_at: '2026-09-21T01:20:10-04:00',
    visibility: 'PUBLIC',
    actions_enabled: true,
    allowed_actions: 'all',
    workflow_files_at_observation: 0,
    observation_is_mutable_external_state: true,
  });
  assert.equal(record.official_references.length, 4);
  assert.ok(record.official_references.every(({ url }) => url.startsWith('https://')));
});

test('future observation is manual, zero-cost, identity-strict, and non-executing', () => {
  const contract = record.future_host_observation_contract;
  assert.equal(contract.trigger, 'WORKFLOW_DISPATCH_ONLY');
  assert.equal(contract.workflow_permissions, 'NONE');
  assert.equal(contract.third_party_actions, false);
  assert.equal(contract.repository_checkout, false);
  assert.equal(contract.secrets_consumed, false);
  assert.equal(contract.artifact_uploaded, false);
  assert.equal(contract.larger_or_paid_runner_allowed, false);
  assert.equal(contract.maximum_charge_usd, 0);
  assert.deepEqual(contract.jobs, ['BUILDER_HOST_A', 'BUILDER_HOST_B']);
  assert.equal(contract.runner_name_is_identity, false);
  assert.equal(contract.distinct_identity_rule, 'NONEMPTY_DMI_PRODUCT_UUIDS_MUST_DIFFER');
  assert.equal(contract.stop_if_identity_missing_or_equal, true);
  assert.equal(contract.stop_if_emulation_detected, true);
  assert.equal(contract.host_observation_satisfies_builder_receipt, false);
  assert.equal(contract.builder_image_or_guest_execution_allowed, false);
  assert.equal(
    record.next_gate,
    'OWNER_ACCEPTANCE_AND_SEPARATE_ZERO_COST_HOST_OBSERVATION_AUTHORIZATION_REQUIRED',
  );
});
