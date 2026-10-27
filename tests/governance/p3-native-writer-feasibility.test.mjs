import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import { simulateBinfmtRemovalV2 } from '../../tools/supervised-execution/binfmt-removal-model-v2.mjs';
import { nativeBoundaryFixture } from '../fixtures/p3/native-writer-boundary-fixture.mjs';

const root = resolve(import.meta.dirname, '../..');
const read = path => readFile(resolve(root, path));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const bytes = value => Buffer.from(JSON.stringify(value));
const packet = JSON.parse(await read('docs/architecture/p3-native-writer-feasibility-packet.json'));
const cases = JSON.parse(await read('tests/fixtures/p3/native-writer-feasibility-cases.json'));
const contractBytes = await read('docs/architecture/p3-exact-binfmt-removal-contract-v2.json');
const contract = JSON.parse(contractBytes);
const simulate = fixture => simulateBinfmtRemovalV2(contractBytes, bytes(fixture.trace), bytes(fixture.trust));
const noAuthority = result => {
  assert.equal(result.simulation_only, true);
  assert.equal(result.runtime_admission, false);
  assert.equal(result.execution_authorized, false);
  assert.equal(result.builder_receipts, 0);
  assert.equal(result.trust_authentication, 'NOT_PERFORMED_TEST_FIXTURE');
  for (const key of ['privileged_writer_exclusion_proven', 'atomic_compare_remove_proven',
    'continuous_registry_emptiness_proven']) assert.equal(result[key], false);
};

test('consolidated packet binds accepted gates and all protected historical inputs without runtime authority', async () => {
  assert.equal(packet.status, 'SOURCE_ONLY_FEASIBILITY_PACKET_PENDING_OWNER_REVIEW');
  assert.equal(packet.based_on, '3b273cb8d861be3810918118f02187fa27b812c4');
  assert.equal(packet.current_runtime_decision, 'NO_GO');
  assert.equal(packet.operational_credit_ceiling, 120);
  assert.equal(packet.maximum_charge_usd, 0);
  assert.deepEqual(packet.requirements.map(item => item.id),
    ['NH-01', 'NH-02', 'NH-03', 'NH-04', 'NH-05', 'NH-06', 'NH-07', 'NH-08', 'NH-09']);
  assert.deepEqual(Object.keys(packet.authorities).sort(), ['merge', 'workflow_activation', 'workflow_dispatch',
    'executor', 'host_mutation', 'build', 'guest_execution', 'paid_activity', 'capability_acceptance', 'provisioning'].sort());
  assert.ok(Object.values(packet.authorities).every(value => value === false));
  assert.deepEqual(packet.proofs, { source_match_verified: false, single_writer_exclusion_proven: false,
    runtime_admission: false, execution_authorized: false });
  for (const [path, digest] of Object.entries(packet.inputs)) assert.equal(hash(await read(path)), digest, path);
  assert.deepEqual(packet.removal_contract_requirements, contract.boundary_requirements);
  assert.deepEqual(packet.original_predicates, contract.all_original_predicates_must_be_rechecked);
  assert.deepEqual(packet.additional_active_predicates, ['KERNEL_WRITER_DIAGNOSTIC_REJECTED']);
});

test('observed stage, historical inventories and proposed native alternatives never manufacture evidence', () => {
  const latest = packet.observations.find(item => item.run_id === '40568691301');
  assert.equal(latest.rejection_code, 'MOUNTINFO_TARGET_FS_OR_ROOT');
  assert.equal(latest.exact_topology_known, false);
  assert.equal(latest.registration_inventory_available, false);
  assert.equal(latest.kernel_writer_record_available, false);
  const prior = packet.observations.find(item => item.run_id === '40552566410');
  assert.equal(prior.registration_count, 4);
  assert.equal(prior.is_current_host_state, false);
  assert.equal(packet.recommended_route, 'REVIEW_PREPROVISIONED_CLEAN_NATIVE_HOST_PROFILE');
  assert.equal(packet.alternative_host_availability, 'NOT_ESTABLISHED');
  assert.equal(packet.alternative_zero_cost_eligibility, 'NOT_ESTABLISHED');
  assert.equal(packet.owner_host_provider_trust_decision, 'NOT_ACCEPTED');
  assert.equal(packet.diagnostics_can_satisfy_writer_boundary, false);
  assert.equal(packet.qualifying_builder_receipts, 0);
});

test('plausible metadata, snapshot and cooperative-lock substitutions deny even after fixture digest rebinding', () => {
  assert.equal(cases.fixture_only, true);
  assert.equal(cases.cases.length, 15);
  const requirements = new Set(packet.requirements.map(item => item.id));
  for (const candidate of cases.cases) {
    assert.ok(requirements.has(candidate.requirement), candidate.id);
    const fixture = nativeBoundaryFixture(contractBytes);
    for (const patch of candidate.patches) {
      let parent = fixture;
      for (const part of patch.path.slice(0, -1)) {
        assert.ok(Object.hasOwn(parent, part));
        parent = parent[part];
      }
      const key = patch.path.at(-1);
      assert.ok(Object.hasOwn(parent, key));
      parent[key] = structuredClone(patch.value);
    }
    fixture.trust.boundary_sha256 = hash(bytes(fixture.trace.boundary));
    assert.throws(() => simulate(fixture), { message: 'BINFMT_V2_FIXTURE_REJECTED' }, candidate.id);
  }
});

test('every original predicate remains mandatory even when the fixture boundary looks complete', () => {
  for (const code of contract.all_original_predicates_must_be_rechecked) {
    for (const change of [value => { value[code] = false; }, value => { delete value[code]; }]) {
      const fixture = nativeBoundaryFixture(contractBytes);
      change(fixture.trace.recheck.predicate_results);
      assert.throws(() => simulate(fixture), { message: 'BINFMT_V2_FIXTURE_REJECTED' }, code);
    }
  }
});

test('complete and indistinguishable fixture histories still yield zero authenticated host or builder proof', () => {
  for (const hiddenHistory of ['normal', 'already-detached-no-op', 'unseen-ABA', 'later-registration']) {
    const fixture = nativeBoundaryFixture(contractBytes);
    const result = simulate(fixture); // These hidden histories can share the same visible samples.
    assert.equal(result.state, 'SIMULATED_RECHECK_OBSERVED_CAUSALITY_UNPROVEN', hiddenHistory);
    assert.equal(result.exclusive_causal_removal, 'UNPROVEN');
    noAuthority(result);
  }
});

test('an accepted request without absence evidence cannot advance the consolidated feasibility decision', () => {
  const fixture = nativeBoundaryFixture(contractBytes);
  fixture.trace.events = fixture.trace.events.slice(0, 1);
  fixture.trace.events[0].after = null;
  fixture.trace.recheck = null;
  const result = simulate(fixture);
  assert.equal(result.write_requests_accepted, 1);
  assert.equal(result.target_absence_observations, 0);
  assert.equal(result.state, 'SIMULATED_ABSENCE_UNOBSERVED_NO_ADMISSION');
  noAuthority(result);
});

test('combined mount ambiguity and incomplete observation fixtures run without live host queries', () => {
  execFileSync('/usr/bin/python3', ['-B', resolve(root, 'tests/governance/p3-native-writer-feasibility.test.py'), '-v'], {
    cwd: root, timeout: 10_000, maxBuffer: 64 * 1024,
    env: { LANG: 'C', LC_ALL: 'C', PATH: '/usr/bin:/bin' },
  });
});

test('new fixture support is unreachable from application code and contains no host operations', async () => {
  const fixture = (await read('tests/fixtures/p3/native-writer-boundary-fixture.mjs')).toString();
  assert.doesNotMatch(fixture, /node:fs|child_process|fetch\(|node:https?|process\.|execFile|spawn/);
  const module = (await read('tools/supervised-execution/binfmt-removal-model-v2.mjs')).toString();
  assert.doesNotMatch(module, /node:fs|child_process|fetch\(|node:https?|process\./);
  const { collectFiles, importedModules } = await import('../architecture/source-graph.mjs');
  for (const path of await collectFiles(resolve(root, 'src'))) {
    if (!/\.[cm]?[jt]sx?$/.test(path)) continue;
    for (const name of importedModules((await readFile(path)).toString(), path)) {
      assert.doesNotMatch(name, /native-writer-boundary-fixture|binfmt-removal-model-v2/);
    }
  }
});
