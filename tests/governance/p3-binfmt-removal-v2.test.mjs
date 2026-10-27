import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import { simulateBinfmtRemovalV2 } from '../../tools/supervised-execution/binfmt-removal-model-v2.mjs';

const root = resolve(import.meta.dirname, '../..');
const bytes = value => Buffer.from(JSON.stringify(value));
const sha = value => createHash('sha256').update(value).digest('hex');
const contractBytes = await readFile(resolve(root, 'docs/architecture/p3-exact-binfmt-removal-contract-v2.json'));
const contract = JSON.parse(contractBytes);
const codes = contract.all_original_predicates_must_be_rechecked;
const allTrue = names => Object.fromEntries(names.map(name => [name, true]));
const registry = { filesystem: 'binfmt_misc', device: '0:42', inode: '100', mount_id: '42',
  mount_namespace: 'mnt:[100]', user_namespace: 'user:[101]', effective_scope: 'SAME_EFFECTIVE_REGISTRY_FIXTURE' };
const objectIds = Object.fromEntries(contract.entries.map((entry, i) => [entry.name, `entry:${i}`]));
const inventory = entries => ({ registry: structuredClone(registry), global_enabled: true,
  entries: entries.map(entry => ({ ...structuredClone(entry), object_id: objectIds[entry.name] })) });

function fixture() {
  const host = { run_id: '123456789', run_attempt: '1', job: 'builder_host_a', sha: 'b'.repeat(40),
    runner_environment: 'github-hosted', runner_os: 'Linux', runner_arch: 'X64',
    uname_machine: 'x86_64', docker_arch: 'amd64', image_os: 'ubuntu24', image_version: '20261023.334.3',
    fresh_disposable_vm: true, kernel_release: 'SIMULATED-KERNEL', kernel_package: 'SIMULATED-PACKAGE', kernel_source_sha256: 'c'.repeat(64) };
  const boundary = { schema: 'DOSAI_BINFMT_BOUNDARY_FIXTURE_V2', fixture_only: true,
    contract_sha256: sha(contractBytes), host: structuredClone(host), registry: structuredClone(registry),
    fence: { lease_id: 'd'.repeat(64), generation: '1', state: 'ACTIVE', writer_slots: 1,
      helper_instances: 1, privilege_lifetime: 'PREPARATION_ONLY' },
    issued_at_ms: 900, expires_at_ms: 5000, writer_state: 'DOCUMENTED_ASSUMPTION_FIXTURE',
    writer_inventory_sha256: 'e'.repeat(64), kernel_match: 'REVIEWED_IDENTITY_FIXTURE',
    trust_assumption: 'PRIVILEGED_HOST_AND_PROVIDER_TRUSTED_FIXTURE', assumption_decision_sha256: 'f'.repeat(64),
    review_sha256: contract.review_input.sha256, entry_object_ids: structuredClone(objectIds), scope: contract.entries.map(e => e.name) };
  const trace = { host, boundary,
    initial: inventory(contract.entries),
    preflight: allTrue(codes.filter(c => !['BINFMT_MISC_INTERPRETER_ACTIVE', 'RECEIPT_EMISSION_FAILED'].includes(c))),
    events: contract.entries.map((entry, index) => ({ entry: entry.name,
      before: inventory(contract.entries.slice(index)), after: inventory(contract.entries.slice(index + 1)),
      descriptor_object_id: objectIds[entry.name], descriptor_preimage_sha256: entry.sha256,
      fence_generation: '1', fence_state: 'ACTIVE', attempts: 1, payload_hex: '2d310a',
      request_result: 'ACCEPTED', written_bytes: 3, elapsed_ms: index * 2 + 1,
      completed_elapsed_ms: index * 2 + 2, interference: 'NOT_DETECTED' })),
    recheck: { host: structuredClone(host), inventory: inventory([]), predicate_results: allTrue(codes),
      fence_generation: '1', fence_state: 'ACTIVE', elapsed_ms: 10, mutation_authority: 'DROPPED' } };
  const trust = { schema: 'DOSAI_BINFMT_TRUST_FIXTURE_V2', fixture_only: true, contract_sha256: sha(contractBytes),
    boundary_sha256: sha(bytes(boundary)), evaluation_time_ms: 1000, expected_host: structuredClone(host),
    expected_registry: structuredClone(registry), expected_fence_generation: '1', expected_review_sha256: contract.review_input.sha256 };
  return { trace, trust };
}
const simulate = ({ trace, trust }) => simulateBinfmtRemovalV2(contractBytes, bytes(trace), bytes(trust));
const denied = value => assert.throws(() => simulate(value));
const rebind = value => { value.trust.boundary_sha256 = sha(bytes(value.trace.boundary)); };

test('v2 separates accepted requests, absence observations and permanently unproven causality', () => {
  const f = fixture(); const original = bytes(f);
  const result = simulate(f);
  assert.equal(result.state, 'SIMULATED_RECHECK_OBSERVED_CAUSALITY_UNPROVEN');
  assert.equal(result.write_requests_accepted, 4);
  assert.equal(result.target_absence_observations, 4);
  assert.equal(result.exclusive_causal_removal, 'UNPROVEN');
  for (const key of ['execution_authorized', 'runtime_admission', 'atomic_compare_remove_proven',
    'privileged_writer_exclusion_proven', 'continuous_registry_emptiness_proven']) assert.equal(result[key], false);
  assert.equal(result.trust_authentication, 'NOT_PERFORMED_TEST_FIXTURE');
  assert.equal(result.builder_receipts, 0); assert.ok(result.simulation_only && Object.isFrozen(result));
  assert.deepEqual(bytes(f), original);
});

test('accepted byte count without a post-state observation cannot complete a target', () => {
  const f = fixture(); f.trace.events = f.trace.events.slice(0, 1);
  f.trace.events[0].after = null; f.trace.recheck = null;
  const result = simulate(f);
  assert.equal(result.write_requests_accepted, 1); assert.equal(result.target_absence_observations, 0);
  assert.equal(result.state, 'SIMULATED_ABSENCE_UNOBSERVED_NO_ADMISSION');
});

test('already-detached no-op and unseen ABA cannot acquire exclusive causality from identical observations', () => {
  // Hidden kernel histories are intentionally not caller-supplied attestations.
  // Normal removal, an already-detached no-op and an undetected ABA can have this same trace.
  for (const _hiddenHistory of ['normal', 'already-detached', 'unseen-ABA']) {
    const result = simulate(fixture());
    assert.equal(result.exclusive_causal_removal, 'UNPROVEN');
    assert.equal(result.atomic_compare_remove_proven, false);
    assert.equal(result.runtime_admission, false);
  }
});

test('stale descriptor replacement and changed enabled state are rejected', () => {
  for (const change of [
    f => { f.trace.events[0].descriptor_object_id = 'stale:object'; },
    f => { f.trace.events[0].after.entries.push({ ...contract.entries[0], object_id: 'replacement:object' }); },
    f => { f.trace.events[0].before.entries[0].enabled = false; },
    f => { f.trace.events[0].before.entries[0].sha256 = '0'.repeat(64); },
    f => { f.trace.events[0].descriptor_preimage_sha256 = '0'.repeat(64); },
  ]) { const f = fixture(); change(f); denied(f); }
});

test('detected or unknown interference quarantines and forbids any subsequent attempt', () => {
  for (const interference of ['DETECTED', 'UNKNOWN']) {
    const f = fixture(); f.trace.events = f.trace.events.slice(0, 1);
    f.trace.events[0].interference = interference; f.trace.recheck = null;
    assert.equal(simulate(f).state, 'SIMULATED_QUARANTINE_NO_RETRY');
    f.trace.events.push(fixture().trace.events[1]); denied(f);
  }
});

test('missing, expired, future-issued or unknown writer-boundary fixtures deny before request admission', () => {
  for (const change of [
    f => { f.trace.boundary = null; },
    f => { f.trace.boundary.writer_state = 'UNKNOWN'; },
    f => { f.trace.boundary.expires_at_ms = 1000; },
    f => { f.trace.boundary.issued_at_ms = 1001; },
    f => { f.trace.boundary.kernel_match = 'UNVERIFIED'; },
    f => { f.trace.boundary.trust_assumption = 'NOT_ACCEPTED'; },
    f => { f.trace.boundary.writer_inventory_sha256 = ''; },
  ]) { const f = fixture(); change(f); rebind(f); denied(f); }
});

test('boundary cannot self-authenticate or substitute the trusted fixture context', () => {
  const f = fixture(); f.trace.boundary.assumption_decision_sha256 = '1'.repeat(64); denied(f);
  for (const change of [
    f => { f.trace.boundary.host.sha = '1'.repeat(40); },
    f => { f.trace.boundary.host.kernel_source_sha256 = '1'.repeat(64); },
    f => { f.trace.boundary.review_sha256 = '1'.repeat(64); },
    f => { f.trust.fixture_only = false; },
    f => { f.trace.boundary.scope.push('register'); },
  ]) { const f = fixture(); change(f); rebind(f); denied(f); }
});

test('wrong image, emulation, stale job, kernel drift and non-disposable context fail closed', () => {
  for (const [key, value] of Object.entries({ sha: 'short', run_attempt: '2', run_id: contract.observed_run_id,
    runner_environment: 'self-hosted', runner_arch: 'ARM64', uname_machine: 'aarch64', docker_arch: 'arm64',
    image_version: 'new-image', fresh_disposable_vm: false, kernel_release: '' })) {
    const f = fixture(); f.trace.host[key] = value; denied(f);
  }
});

test('mount, registry, user namespace and effective-scope substitutions fail closed', () => {
  for (const key of ['device', 'inode', 'mount_id', 'mount_namespace', 'user_namespace', 'effective_scope']) {
    for (const section of ['initial', 'after']) {
      const f = fixture(); const snapshot = section === 'initial' ? f.trace.initial : f.trace.events[0].after;
      snapshot.registry[key] = 'substituted'; denied(f);
    }
  }
  const f = fixture(); f.trace.boundary.registry.mount_id = 'other'; rebind(f); denied(f);
  const malformed = fixture(); malformed.trust.expected_registry.user_namespace = 'arbitrary'; malformed.trace.boundary.registry.user_namespace = 'arbitrary'; rebind(malformed); denied(malformed);
});

test('cooperating fence revocation, stale generation, multiple writers and privilege drift are rejected', () => {
  for (const change of [
    f => { f.trace.boundary.fence.state = 'REVOKED'; },
    f => { f.trace.boundary.fence.generation = '2'; },
    f => { f.trace.boundary.fence.writer_slots = 2; },
    f => { f.trace.boundary.fence.helper_instances = 2; },
    f => { f.trace.boundary.fence.privilege_lifetime = 'UNBOUNDED'; },
    f => { f.trace.events[0].fence_state = 'REVOKED'; },
    f => { f.trace.events[0].fence_generation = '2'; },
    f => { f.trace.recheck.mutation_authority = 'PRESENT'; },
  ]) { const f = fixture(); change(f); rebind(f); denied(f); }
  const invalid = fixture(); invalid.trust.expected_fence_generation = '-1'; invalid.trace.boundary.fence.generation = '-1'; rebind(invalid); denied(invalid);
});

test('expiry before a request denies; expiry or timeout during a request quarantines', () => {
  const before = fixture(); before.trust.evaluation_time_ms = 5000; denied(before);
  const atRequest = fixture(); atRequest.trace.events[0].elapsed_ms = 4000; atRequest.trace.events[0].completed_elapsed_ms = 4001; denied(atRequest);
  for (const outcome of [
    { request_result: 'TIMEOUT', written_bytes: null, completed_elapsed_ms: null },
    { request_result: 'UNKNOWN', written_bytes: null, completed_elapsed_ms: null },
    { request_result: 'ERROR', written_bytes: 0 },
    { request_result: 'ACCEPTED', written_bytes: 1 },
    { completed_elapsed_ms: 4000 },
  ]) {
    const f = fixture(); f.trace.events = f.trace.events.slice(0, 1); f.trace.recheck = null;
    Object.assign(f.trace.events[0], outcome);
    assert.equal(simulate(f).state, 'SIMULATED_QUARANTINE_NO_RETRY');
  }
});

test('registration after final observation, recheck drift and any failed original predicate deny', () => {
  const f = fixture(); f.trace.recheck.inventory.entries.push({ ...contract.entries[0], object_id: objectIds[contract.entries[0].name] }); denied(f);
  for (const code of codes) {
    const f = fixture(); f.trace.recheck.predicate_results[code] = false; denied(f);
    const missing = fixture(); delete missing.trace.recheck.predicate_results[code]; denied(missing);
  }
  const moved = fixture(); moved.trace.recheck.host.job = 'builder_host_b'; denied(moved);
  const late = fixture(); late.trace.recheck.elapsed_ms = 4000; denied(late);
  // Reappearance after the last sampled instant is not detectable by this model.
  assert.equal(simulate(fixture()).continuous_registry_emptiness_proven, false);
});

test('all exact entry, payload, attempt and membership constraints remain mandatory', () => {
  for (const change of [
    f => { f.trace.events[0].entry = '../status'; },
    f => { f.trace.events[0].payload_hex = '300a'; },
    f => { f.trace.events[0].attempts = 2; },
    f => { f.trace.events.reverse(); },
    f => { f.trace.events.push(f.trace.events[0]); },
    f => { f.trace.initial.entries.pop(); },
    f => { f.trace.initial.entries.push(f.trace.initial.entries[0]); },
    f => { f.trace.events[0].after.entries[0].fields.magic = '0000'; },
  ]) { const f = fixture(); change(f); denied(f); }
});

test('incomplete preparation and an empty event list cannot gain admission', () => {
  const f = fixture(); f.trace.events = []; f.trace.recheck = null;
  const result = simulate(f);
  assert.equal(result.state, 'SIMULATED_INCOMPLETE_NO_ADMISSION');
  assert.equal(result.write_requests_accepted, 0); assert.equal(result.target_absence_observations, 0);
  assert.equal(result.runtime_admission, false);
});

test('strict bounded JSON and independent fixture inputs reject malformed or unknown data', () => {
  const f = fixture();
  for (const raw of ['x', '{"host":{},"host":{}}', ' '.repeat(65537)]) {
    assert.throws(() => simulateBinfmtRemovalV2(contractBytes, Buffer.from(raw), bytes(f.trust)));
  }
  assert.throws(() => simulateBinfmtRemovalV2(Buffer.from('{}'), bytes(f.trace), bytes(f.trust)));
  const extra = fixture(); extra.trace.unexpected = true; denied(extra);
});

test('v1 and active workflow history remain exact; v2 is inert and has no effects authority', async () => {
  const old = await readFile(resolve(root, contract.supersedes.path));
  assert.equal(sha(old), contract.supersedes.sha256);
  assert.equal(sha(await readFile(resolve(root, 'tools/supervised-execution/binfmt-removal-model.mjs'))), '2abd06bff10628aac765d70e26657d6cc2b40c6bb4a15676cd5d141dc6faa416');
  assert.equal(sha(await readFile(resolve(root, 'tests/governance/p3-exact-binfmt-removal-plan.test.mjs'))), '282604c00c20d5a1f999d4b3f24cba07df64a556b0503090e6572f37b6a1734b');
  assert.equal(sha(await readFile(resolve(root, 'docs/development/p3-exact-binfmt-removal-plan.md'))), '272ed3983ed0473d1b1f201499cbf65f67919dcd5aa09011403edaaf93aa908b');
  assert.equal(contract.record_version, 2); assert.equal(JSON.parse(old).record_version, 1);
  assert.deepEqual(contract.entries, JSON.parse(old).entries);
  const workflow = await readFile(resolve(root, '.github/workflows/p3-native-builder-host-feasibility.yml'));
  assert.equal(sha(workflow), contract.observed_workflow_sha256);
  assert.deepEqual([...new Set([...workflow.toString().matchAll(/\|\| fail ([A-Z0-9_]+)/g)].map(m => m[1]))], codes);
  assert.equal(contract.effectful_executor_status, 'NO_GO');
  assert.ok(Object.values(contract.authorities).every(value => value === false));
  const source = await readFile(resolve(root, 'tools/supervised-execution/binfmt-removal-model-v2.mjs'), 'utf8');
  assert.deepEqual([...source.matchAll(/from '([^']+)'/g)].map(m => m[1]), ['node:crypto', '../dosai-acceptance/src/strict-json.mjs']);
  assert.doesNotMatch(source, /process\.|node:fs|node:http|node:net|child_process|fetch\(|writeFile|execFile|sudo/);
});
