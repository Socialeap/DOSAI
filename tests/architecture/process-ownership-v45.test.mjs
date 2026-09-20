import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import { loadProofObservabilitySuccessor } from './p3-proof-observability-successor.mjs';

const root = resolve(import.meta.dirname, '../..');
const recordPath = 'docs/architecture/process-ownership-v45.json';
const read = path => readFile(resolve(root, path));
const pristine = JSON.parse(await read(recordPath));
const altered = change => {
  const candidate = structuredClone(pristine);
  change(candidate);
  return path => path === recordPath ? Buffer.from(JSON.stringify(candidate)) : read(path);
};

test('v45 binds only source-level proof attribution and grants no physical authority', async () => {
  const successor = await loadProofObservabilitySuccessor(root);
  for (const file of pristine.modified_files) {
    assert.equal(successor.expected(file.path, file.pre_sha256), file.post_sha256);
  }
  assert.equal(successor.expected('src/main/index.ts', 'unchanged'), 'unchanged');
  assert.equal(pristine.observed_attempt.attempt_count, 1);
  assert.equal(pristine.observed_attempt.authorization_exhausted, true);
  assert.deepEqual(pristine.protocol.distinct_failure_outputs, [
    'NATIVE_ADDON_LOAD_FAILED',
    'NATIVE_STATUS_CALL_FAILED',
    'ELECTRON_READINESS_FAILED',
  ]);
  assert.ok(Object.values(pristine.authority).every(value => value === false));
});

test('v45 rejects path, lineage, protocol, attempt, authority and status expansion', async () => {
  for (const change of [
    record => record.modified_files.push(record.modified_files[0]),
    record => { record.modified_files[0].path = 'src/main/index.ts'; },
    record => { record.modified_files[0].post_sha256 = 'a'.repeat(64); },
    record => { record.accepted_source_baseline.sha256 = 'a'.repeat(64); },
    record => { record.physical_evidence.sha256 = 'a'.repeat(64); },
    record => { record.observed_attempt.attempt_count = 2; },
    record => { record.observed_attempt.authorization_exhausted = false; },
    record => { record.protocol.zero_argument_native_call_limit = 2; },
    record => record.protocol.distinct_failure_outputs.push('RETRY_ALLOWED'),
    record => { record.authority.app_launch = true; },
    record => { record.status = 'ACCEPTED'; },
    record => { record.runtime_status = 'GO'; },
    record => { record.unexpected = true; },
  ]) await assert.rejects(loadProofObservabilitySuccessor(root, altered(change)));

  for (const source of ['{', '{"schema_version":45,"schema_version":45}', 'x'.repeat(262145)]) {
    await assert.rejects(loadProofObservabilitySuccessor(root, path => {
      if (path === recordPath) return Buffer.from(source);
      return read(path);
    }));
  }
});

test('v45 rejects drift in every modified or support postimage', async () => {
  for (const target of [...pristine.modified_files, ...pristine.support_files].map(file => file.path)) {
    await assert.rejects(loadProofObservabilitySuccessor(root, async path => {
      const bytes = await read(path);
      return path === target ? Buffer.concat([bytes, Buffer.from('\n// drift\n')]) : bytes;
    }));
  }
});
