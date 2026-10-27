import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '../..');
const read = path => readFile(resolve(root, path));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const record = JSON.parse(await read('docs/architecture/p3-kernel-writer-workflow-activation-record.json'));
const host = await read('.github/workflows/p3-native-builder-host-feasibility.yml');
const workflow = await read(record.workflow_path);
const source = await read('scripts/p3-kernel-writer-diagnostic.py');

function expectedWorkflow() {
  let result = host.toString().replace('name: P3 native builder host feasibility\n', 'name: P3 kernel and writer diagnostics\n')
    .replace('group: p3-native-builder-host-feasibility\n', 'group: p3-kernel-writer-diagnostics\n');
  let program = "          timeout --signal=KILL 10s python3 -I -B - <<'DOSAI_KERNEL_WRITER_PY' || fail KERNEL_WRITER_DIAGNOSTIC_REJECTED\n";
  program += source.toString().split('\n').slice(0, -1).map(line => (line ? '          ' + line : '') + '\n').join('');
  program += '          DOSAI_KERNEL_WRITER_PY\n';
  return result.replaceAll("          timeout --signal=KILL 5s python3 -I -B - <<'DOSAI_BINFMT_PY'", program + "          timeout --signal=KILL 5s python3 -I -B - <<'DOSAI_BINFMT_PY'");
}

test('new workflow exactly embeds reviewed sources while preserving the existing host workflow', async () => {
  assert.equal(sha(host), '1e8daa3e67ff54200dda1f0c587dfc1b9501341ddfb8608d4a0b52fbb03da53c');
  assert.equal(sha(source), '6f40494ee7e3c00fa0557ef2f8779d67dd1e44dd9a1301d32b149ecc58450185');
  assert.equal(sha(workflow), '4d05e479c2009693a5d20c56fa94fdef085e2b1997ad16aaa5fbda5ca1790994');
  assert.equal(workflow.toString(), expectedWorkflow());
  for (const [path, digest] of Object.entries(record.inputs)) assert.equal(sha(await read(path)), digest, path);
});

test('manual-only two-job scope preserves all original predicates and receipts with no extra effects', () => {
  const text = workflow.toString();
  assert.match(text, /\non:\n  workflow_dispatch:\n\npermissions: \{\}/);
  assert.equal((text.match(/runs-on: ubuntu-24\.04/g) ?? []).length, 2);
  assert.equal((text.match(/cancel-in-progress: false/g) ?? []).length, 1);
  assert.equal((text.match(/timeout-minutes: 5/g) ?? []).length, 2);
  assert.equal((text.match(/timeout --signal=KILL 10s python3 -I -B -/g) ?? []).length, 2);
  const originalPredicates = [...new Set([...host.toString().matchAll(/\|\| fail ([A-Z0-9_]+)/g)].map(m => m[1]))];
  for (const code of originalPredicates) assert.equal((text.match(new RegExp('\\|\\| fail ' + code + '\\b', 'g')) ?? []).length, 2);
  assert.equal((text.match(/no_active_binfmt_misc_interpreters:true/g) ?? []).length, 2);
  assert.doesNotMatch(text, /\buses:|pull_request:|push:|continue-on-error:|\bsudo\b|secrets\./);
  assert.equal(record.status, 'PREPARED_FOR_REVIEW_NOT_DISPATCHED');
  assert.ok(Object.values(record.authorities).every(value => value === false));
  assert.ok(Object.values(record.proofs).every(value => value === false));
});

test('both full inline shell programs parse without executing collection or querying a host', () => {
  const programs = workflow.toString().split('        run: |\n').slice(1).map(segment => {
    const result = [];
    for (const line of segment.split('\n')) {
      if (line && !line.startsWith('          ')) break;
      result.push(line ? line.slice(10) : '');
    }
    return result.join('\n') + '\n';
  });
  assert.equal(programs.length, 2);
  for (const program of programs) execFileSync('/bin/bash', ['-n'], {
    input: program, timeout: 2000, maxBuffer: 64 * 1024,
    env: { LANG: 'C', LC_ALL: 'C', PATH: '/usr/bin:/bin' },
  });
});

test('byte drift in either workflow or diagnostic source cannot match activation evidence', () => {
  assert.notEqual(sha(Buffer.concat([workflow, Buffer.from('\n# drift\n')])), record.workflow_sha256);
  const changed = source.toString().replace("'single_writer_exclusion_proven': False", "'single_writer_exclusion_proven': True");
  assert.notEqual(sha(Buffer.from(changed)), record.inputs['scripts/p3-kernel-writer-diagnostic.py']);
  assert.equal(record.existing_host_workflow_unchanged, true);
  assert.equal(record.all_original_predicates_preserved, true);
  assert.equal(record.original_success_receipt_preserved, true);
  assert.equal(record.dispatches_performed, 0);
  assert.equal(record.maximum_charge_usd, 0);
});
