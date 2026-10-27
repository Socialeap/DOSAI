import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import { simulateExactBinfmtRemoval } from '../../tools/supervised-execution/binfmt-removal-model.mjs';

const root = resolve(import.meta.dirname, '../..');
const planBytes = await readFile(resolve(root, 'docs/architecture/p3-exact-binfmt-removal-plan.json'));
const plan = JSON.parse(planBytes);
const bytes = value => Buffer.from(JSON.stringify(value));
const inventory = entries => ({ global_enabled: true, entries: structuredClone(entries) });
const predicates = codes => Object.fromEntries(codes.map(code => [code, true]));
function fixture() {
  const host = { run_id: '123456789', run_attempt: '1', job: 'builder_host_a', sha: 'b'.repeat(40),
    runner_environment: 'github-hosted', runner_os: 'Linux', runner_arch: 'X64',
    uname_machine: 'x86_64', docker_arch: 'amd64', image_os: 'ubuntu24',
    image_version: '20261023.334.3', fresh_disposable_vm: true };
  return { host,
    preflight: predicates(plan.all_original_predicates_must_be_rechecked.filter(code =>
      !['BINFMT_MISC_INTERPRETER_ACTIVE', 'RECEIPT_EMISSION_FAILED'].includes(code))),
    initial: inventory(plan.entries),
    events: plan.entries.map((entry, index) => ({ entry: entry.name,
      before: inventory(plan.entries.slice(index)), after: inventory(plan.entries.slice(index + 1)),
      descriptor_preimage_sha256: entry.sha256, descriptor_identity_unchanged: true,
      attempts: 1, result: 'WRITTEN', written_bytes: 3, elapsed_ms: index + 1, payload_hex: '2d310a' })),
    recheck: { host: structuredClone(host), predicate_results: predicates(plan.all_original_predicates_must_be_rechecked), inventory: inventory([]) },
  };
}
const simulate = trace => simulateExactBinfmtRemoval(planBytes, bytes(trace));
const denied = trace => assert.throws(() => simulate(trace));

test('exact four-entry success remains simulation-only with no runtime authority', () => {
  const trace = fixture();
  const before = bytes(trace);
  const result = simulate(trace);
  assert.equal(result.state, 'SIMULATED_RECHECK_COMPLETE_NOT_RUNTIME_EVIDENCE');
  assert.equal(result.simulation_only, true);
  assert.equal(result.execution_authorized, false);
  assert.equal(result.runtime_admission, false);
  assert.equal(result.builder_receipts, 0);
  assert.deepEqual(bytes(trace), before);
  assert.ok(Object.isFrozen(result));
});

test('plan pins the four observed preimages and all original predicates', async () => {
  assert.deepEqual(plan.entries.map(entry => entry.name), [
    'llvm-16-runtime.binfmt', 'llvm-17-runtime.binfmt', 'llvm-18-runtime.binfmt', 'python3.12',
  ]);
  for (const entry of plan.entries) {
    const raw = `enabled\ninterpreter ${entry.fields.interpreter}\nflags: \noffset 0\nmagic ${entry.fields.magic}\n`;
    assert.equal(createHash('sha256').update(raw).digest('hex'), entry.sha256);
  }
  const workflow = await readFile(resolve(root, '.github/workflows/p3-native-builder-host-feasibility.yml'));
  assert.equal(createHash('sha256').update(workflow).digest('hex'), plan.observed_workflow_sha256);
  const codes = [...new Set([...workflow.toString().matchAll(/\|\| fail ([A-Z0-9_]+)/g)].map(match => match[1]))];
  assert.deepEqual(plan.all_original_predicates_must_be_rechecked, codes);
  assert.equal(codes.length, 16);
  assert.ok(Object.values(plan.authorities).every(value => value === false));
});

test('missing, extra, duplicated, disabled or changed initial entries fail before any modeled removal', () => {
  const changes = [
    trace => trace.initial.entries.pop(),
    trace => trace.initial.entries.push({ ...plan.entries[0], name: 'qemu-aarch64' }),
    trace => { trace.initial.entries[1] = trace.initial.entries[0]; },
    trace => { trace.initial.entries[0].enabled = false; },
    trace => { trace.initial.entries[0].sha256 = '0'.repeat(64); },
    trace => { trace.initial.entries[0].fields.interpreter = '/bin/other'; },
    trace => { trace.initial.global_enabled = false; },
  ];
  for (const change of changes) { const trace = fixture(); change(trace); denied(trace); }
});

test('emulated, stale, non-disposable, wrong-image or substituted host contexts fail closed', () => {
  for (const [key, value] of Object.entries({ runner_environment: 'self-hosted', runner_os: 'Darwin', runner_arch: 'ARM64',
    uname_machine: 'aarch64', docker_arch: 'arm64', image_version: 'new-image', image_os: 'ubuntu26',
    fresh_disposable_vm: false, run_attempt: '2', run_id: plan.observed_run_id, sha: 'abbreviated' })) {
    const trace = fixture(); trace.host[key] = value; denied(trace);
  }
  const trace = fixture(); trace.recheck.host.job = 'builder_host_b'; denied(trace);
});

test('every non-registry preflight and every original post-preparation predicate is mandatory', () => {
  for (const section of ['preflight', 'predicate_results']) {
    const baseline = fixture();
    const target = section === 'preflight' ? baseline.preflight : baseline.recheck.predicate_results;
    for (const code of Object.keys(target)) {
      for (const missing of [false, true]) {
        const trace = fixture(); const results = section === 'preflight' ? trace.preflight : trace.recheck.predicate_results;
        if (missing) delete results[code]; else results[code] = false;
        denied(trace);
      }
    }
  }
});

test('wrong payload, path-like entry, descriptor drift, repeated or reordered removal is rejected', () => {
  const changes = [
    trace => { trace.events[0].entry = '../status'; },
    trace => { trace.events[0].entry = 'register'; },
    trace => { trace.events[0].payload_hex = '300a'; },
    trace => { trace.events[0].descriptor_identity_unchanged = false; },
    trace => { trace.events[0].descriptor_preimage_sha256 = '0'.repeat(64); },
    trace => { trace.events[0].attempts = 2; },
    trace => { trace.events.reverse(); },
    trace => { trace.events.push(trace.events[0]); },
    trace => { trace.events[1].entry = trace.events[0].entry; },
  ];
  for (const change of changes) { const trace = fixture(); change(trace); denied(trace); }
});

test('partial, failed, timed out or uncertain write stops without a later attempt or rollback', () => {
  for (const outcome of [{ result: 'ERROR', written_bytes: 0 }, { result: 'TIMEOUT', written_bytes: null },
    { result: 'UNKNOWN', written_bytes: null }, { result: 'WRITTEN', written_bytes: 1 },
    { result: 'WRITTEN', written_bytes: 3, elapsed_ms: 5001 }]) {
    const trace = fixture(); Object.assign(trace.events[1], outcome);
    trace.events = trace.events.slice(0, 2); trace.recheck = null;
    const result = simulate(trace);
    assert.equal(result.state, 'SIMULATED_QUARANTINE_NO_RETRY');
    assert.equal(result.simulated_completed_entries, 1);
    trace.events.push(fixture().events[2]); denied(trace);
  }
});

test('membership races, reappearance and post-write changes never pass admission', () => {
  for (const change of [
    trace => { trace.events[1].before = inventory(plan.entries); },
    trace => { trace.events[0].after.entries.push(plan.entries[0]); },
    trace => { trace.events[0].after.entries[0].fields.magic = '0000'; },
    trace => { trace.recheck.inventory = inventory([plan.entries[0]]); },
  ]) { const trace = fixture(); change(trace); denied(trace); }
});

test('incomplete preparation cannot skip directly to recheck', () => {
  const trace = fixture(); trace.events.pop(); denied(trace);
  trace.recheck = null;
  assert.equal(simulate(trace).state, 'SIMULATED_INCOMPLETE_NO_ADMISSION');
});

test('oversized, malformed, duplicate-key and changed-plan inputs are rejected', () => {
  assert.throws(() => simulateExactBinfmtRemoval(Buffer.from('{}'), bytes(fixture())));
  for (const input of ['x', '{"host":{},"host":{}}', ' '.repeat(65537)]) {
    assert.throws(() => simulateExactBinfmtRemoval(planBytes, Buffer.from(input)));
  }
  const trace = fixture(); trace.extra = true; denied(trace);
});

test('model has no CLI, filesystem, subprocess, network or mutation implementation', async () => {
  const source = await readFile(resolve(root, 'tools/supervised-execution/binfmt-removal-model.mjs'), 'utf8');
  assert.deepEqual([...source.matchAll(/from '([^']+)'/g)].map(match => match[1]), [
    'node:crypto', '../dosai-acceptance/src/strict-json.mjs',
  ]);
  assert.doesNotMatch(source, /process\.|child_process|node:fs|node:http|node:net|fetch\(|writeFile|execFile|sudo/);
});
