import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '../..');
const read = path => readFile(resolve(root, path));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const workflowPath = '.github/workflows/p3-kernel-writer-attribution-diagnostics.yml';
const workflowDigest = '0b3b12bb600a67274acb8a7e211edf22cc4741539fbe8189c75da0595d2646b6';
const record = JSON.parse(await read('docs/architecture/p3-kernel-writer-attribution-workflow-activation-record.json'));
const sourceRecord = JSON.parse(await read('docs/architecture/p3-kernel-writer-attribution-source-record.json'));
const predecessor = await read('.github/workflows/p3-kernel-writer-diagnostics.yml');
const v1 = await read('scripts/p3-kernel-writer-diagnostic.py');
const source = await read('scripts/p3-kernel-writer-diagnostic-v2.py');
const workflow = await read(workflowPath);
const inline = bytes => bytes.toString().split('\n').slice(0, -1)
  .map(line => (line ? '          ' + line : '') + '\n').join('');
const authorityKeys = ['merge', 'workflow_activation', 'workflow_dispatch', 'executor', 'host_mutation',
  'build', 'guest_execution', 'paid_activity', 'capability_acceptance'].sort();

function validateScope(candidate, metadata) {
  assert.equal(metadata.status, 'PREPARED_FOR_REVIEW_NOT_DISPATCHED');
  assert.equal(metadata.based_on, '1d512f883d9dbd5d34849b67e84cb75453e7a323');
  assert.equal(metadata.workflow_path, workflowPath);
  assert.equal(metadata.workflow_sha256, workflowDigest);
  assert.equal(sha(candidate), workflowDigest);
  assert.equal(predecessor.toString().split(inline(v1)).length - 1, 2);
  const expected = predecessor.toString()
    .replace('name: P3 kernel and writer diagnostics\n', 'name: P3 kernel and writer attribution diagnostics\n')
    .replaceAll(inline(v1), inline(source));
  assert.equal(candidate.toString(), expected);
  assert.deepEqual(Object.keys(metadata.authorities).sort(), authorityKeys);
  assert.ok(Object.values(metadata.authorities).every(value => value === false));
  assert.deepEqual(metadata.proofs, {
    source_match_verified: false, single_writer_exclusion_proven: false,
    runtime_admission: false, execution_authorized: false,
  });
  assert.equal(metadata.dispatches_performed, 0);
  assert.equal(metadata.maximum_charge_usd, 0);
}

function programs() {
  return workflow.toString().split('        run: |\n').slice(1).map(segment => {
    const result = [];
    for (const line of segment.split('\n')) {
      if (line && !line.startsWith('          ')) break;
      result.push(line ? line.slice(10) : '');
    }
    return result.join('\n') + '\n';
  });
}

test('attribution workflow embeds the exact merged successor and preserves both earlier workflows', async () => {
  validateScope(workflow, record);
  assert.equal(sha(source), '9d1805b38d2c4fe299d86e696ae2993324bd1403e4f2dff3140bc8b560234294');
  assert.equal(sha(v1), '6f40494ee7e3c00fa0557ef2f8779d67dd1e44dd9a1301d32b149ecc58450185');
  assert.equal(sha(predecessor), '4d05e479c2009693a5d20c56fa94fdef085e2b1997ad16aaa5fbda5ca1790994');
  assert.equal(sha(await read('.github/workflows/p3-native-builder-host-feasibility.yml')),
    '1e8daa3e67ff54200dda1f0c587dfc1b9501341ddfb8608d4a0b52fbb03da53c');
  for (const [path, digest] of Object.entries(record.inputs)) assert.equal(sha(await read(path)), digest, path);
  assert.equal(record.success_prefix, sourceRecord.success_prefix);
  assert.equal(record.failure_prefix, sourceRecord.failure_prefix);
  assert.deepEqual(record.failure_codes, sourceRecord.failure_codes);
});

test('native-only predicates, manual trigger, timeouts, receipts and queue boundaries remain intact', () => {
  const text = workflow.toString();
  assert.match(text, /\non:\n  workflow_dispatch:\n\npermissions: \{\}/);
  assert.match(text, /group: p3-kernel-writer-diagnostics\n  cancel-in-progress: false/);
  for (const expression of [/runs-on: ubuntu-24\.04/g, /timeout-minutes: 5/g,
    /timeout --signal=KILL 10s python3 -I -B -/g,
    /timeout --signal=KILL 5s python3 -I -B -/g,
    /no_active_binfmt_misc_interpreters:true/g]) {
    assert.equal((text.match(expression) ?? []).length, 2);
  }
  const originalCodes = new Set([...predecessor.toString().matchAll(/\|\| fail ([A-Z0-9_]+)/g)].map(m => m[1]));
  for (const code of originalCodes) {
    assert.equal((text.match(new RegExp('\\|\\| fail ' + code + '\\b', 'g')) ?? []).length, 2, code);
  }
  assert.doesNotMatch(text, /\buses:|pull_request:|push:|schedule:|workflow_call:|continue-on-error:|\bsudo\b|secrets\./);
  assert.equal(record.existing_workflows_unchanged, true);
  assert.equal(record.all_original_predicates_preserved, true);
  assert.equal(record.original_success_receipt_preserved, true);
  assert.equal(record.rejection_stage_known, false);
});

test('two complete shell programs and their inline Python parse without executing diagnostics', () => {
  const bodies = programs();
  assert.equal(bodies.length, 2);
  const python = [];
  for (const program of bodies) {
    execFileSync('/bin/bash', ['-n'], { input: program, timeout: 2000, maxBuffer: 64 * 1024,
      env: { LANG: 'C', LC_ALL: 'C', PATH: '/usr/bin:/bin' } });
    const match = program.match(/<<'DOSAI_KERNEL_WRITER_PY'[^\n]*\n([\s\S]*?)\nDOSAI_KERNEL_WRITER_PY\n/);
    assert.ok(match);
    assert.equal(match[1] + '\n', source.toString());
    python.push(match[1]);
  }
  execFileSync('/usr/bin/python3', ['-B', '-c',
    'import ast,json,sys; [ast.parse(source) for source in json.load(sys.stdin)]'], {
    input: JSON.stringify(python), timeout: 2000, maxBuffer: 64 * 1024,
    env: { LANG: 'C', LC_ALL: 'C', PATH: '/usr/bin:/bin' },
  });
});

test('inert wrapper fixtures retain each fixed failure line and stop before later observations', () => {
  const launch = programs()[0].split('\n').find(line => line.startsWith('timeout --signal=KILL 10s'));
  assert.equal(launch, "timeout --signal=KILL 10s python3 -I -B - <<'DOSAI_KERNEL_WRITER_PY' || fail KERNEL_WRITER_DIAGNOSTIC_REJECTED");
  // A shell function consumes inert fixture text. It never invokes timeout, Python or any query.
  for (const code of [...record.failure_codes, null]) {
    assert.ok(code === null || /^[A-Z0-9_]+$/.test(code));
    const fixed = code === null ? '' : `printf '%s\\n' '${record.failure_prefix}${code}' >&2`;
    const script = `fail() { printf 'DOSAI_HOST_OBSERVATION_FAILURE_V1:%s\\n' "$1" >&2; exit 1; }
timeout() {
  test "$*" = '--signal=KILL 10s python3 -I -B -' || exit 90
  while IFS= read -r ignored; do :; done
  ${fixed}
  return ${code === null ? 137 : 2}
}
${launch}
INERT_FIXTURE_NEVER_EXECUTED
DOSAI_KERNEL_WRITER_PY
printf 'LATER_OBSERVATION_MUST_NOT_RUN\\n'
`;
    const result = spawnSync('/bin/bash', ['--noprofile', '--norc', '-euo', 'pipefail', '-c', script], {
      timeout: 2000, maxBuffer: 4096, encoding: 'utf8',
      env: { LANG: 'C', LC_ALL: 'C', PATH: '/usr/bin:/bin' },
    });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.equal(result.stderr, (code === null ? '' : record.failure_prefix + code + '\n')
      + 'DOSAI_HOST_OBSERVATION_FAILURE_V1:KERNEL_WRITER_DIAGNOSTIC_REJECTED\n');
  }
});

test('changed workflows, suppressed gates and forged authority cannot match activation scope', () => {
  for (const candidate of [
    workflow.toString().replace('|| fail UNAME_MACHINE_MISMATCH', '|| true'),
    workflow.toString().replace('|| fail BINFMT_MISC_INTERPRETER_ACTIVE', '|| true'),
    workflow.toString().replace('|| fail KERNEL_WRITER_DIAGNOSTIC_REJECTED', '|| true'),
    workflow.toString().replace('runs-on: ubuntu-24.04', 'runs-on: ubuntu-latest'),
    workflow.toString().replace('permissions: {}', 'permissions: write-all'),
    workflow.toString() + '\n# drift\n',
  ]) assert.throws(() => validateScope(Buffer.from(candidate), record));
  for (const authority of authorityKeys) {
    const forged = structuredClone(record);
    forged.authorities[authority] = true;
    assert.throws(() => validateScope(workflow, forged));
  }
});

test('guard successor changes only the reviewed activation block and preserves its historical preimage', async () => {
  const transition = JSON.parse(await read('tests/fixtures/p3/kernel-writer-attribution-guard-transition.json'));
  const guardPath = 'tests/governance/p3-kernel-writer-attribution.test.py';
  assert.equal(transition.path, guardPath);
  assert.equal(transition.preimage_sha256, '50f27caa4f251024d4731fdf853e80f59174d233b1642a82e44a9da4e49b63a2');
  assert.equal(transition.preimage_sha256, sourceRecord.inputs[guardPath]);
  assert.deepEqual(record.guard_transition, {
    path: guardPath, preimage_sha256: transition.preimage_sha256,
    postimage_sha256: transition.postimage_sha256,
    fixture_path: 'tests/fixtures/p3/kernel-writer-attribution-guard-transition.json',
  });
  const current = (await read(guardPath)).toString();
  assert.equal(sha(current), transition.postimage_sha256);
  assert.equal(current.split(transition.after).length - 1, 1);
  assert.equal(sha(current.replace(transition.after, transition.before)), transition.preimage_sha256);
  assert.ok(transition.after.includes(`workflow_path = '${workflowPath}'`));
  assert.ok(transition.after.includes(`workflow_digest = '${workflowDigest}'`));
  assert.ok(transition.after.includes("if path == ROOT / workflow_path:"));
  assert.ok(transition.after.includes("self.assertNotIn('DOSAI_KERNEL_WRITER_DIAGNOSTIC_FAILURE_V2', path.read_text())"));
  for (const [path, digest] of Object.entries(sourceRecord.inputs)) {
    if (path !== guardPath) assert.equal(sha(await read(path)), digest, path);
  }
});
