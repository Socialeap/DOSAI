import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import { loadStatusProofSuccessor } from './p3-status-proof-successor.mjs';

const root = resolve(import.meta.dirname, '../..');
const recordPath = 'docs/architecture/process-ownership-v44.json';
const read = path => readFile(resolve(root, path));
const pristine = JSON.parse(await read(recordPath));
const altered = change => {
  const candidate = structuredClone(pristine);
  change(candidate);
  return path => path === recordPath ? Buffer.from(JSON.stringify(candidate)) : read(path);
};

test('v44 binds only the authorized CommonJS proof startup repair and grants no runtime authority', async () => {
  const successor = await loadStatusProofSuccessor(root);
  for (const file of pristine.modified_files) {
    assert.equal(successor.expected(file.path, file.pre_sha256), file.post_sha256);
  }
  assert.equal(successor.expected('src/main/index.ts', 'unchanged'), 'unchanged');
  assert.equal(pristine.authority.package_or_signing, false);
  assert.equal(pristine.authority.app_launch, false);
  assert.equal(pristine.authority.native_module_load, false);
  assert.equal(pristine.authority.status_call, false);
});

test('v44 rejects changed paths, lineage, postimages, authority, status and malformed records', async () => {
  for (const change of [
    record => record.modified_files.push(record.modified_files[0]),
    record => { record.modified_files[0].path = 'src/main/index.ts'; },
    record => { record.modified_files[0].post_sha256 = 'a'.repeat(64); },
    record => { record.accepted_proof_baseline.sha256 = 'a'.repeat(64); },
    record => { record.guard_reconciliation.sha256 = 'a'.repeat(64); },
    record => { record.authority.app_launch = true; },
    record => { record.status = 'ACCEPTED'; },
    record => { record.runtime_status = 'GO'; },
    record => { record.unexpected = true; },
  ]) await assert.rejects(loadStatusProofSuccessor(root, altered(change)));

  for (const source of ['{', '{"schema_version":44,"schema_version":44}', 'x'.repeat(262145)]) {
    await assert.rejects(loadStatusProofSuccessor(root, path => {
      if (path === recordPath) return Buffer.from(source);
      return read(path);
    }));
  }
});

test('v44 rejects drift in every modified or support postimage', async () => {
  for (const target of [...pristine.modified_files, ...pristine.support_files].map(file => file.path)) {
    await assert.rejects(loadStatusProofSuccessor(root, async path => {
      const bytes = await read(path);
      return path === target ? Buffer.concat([bytes, Buffer.from('\n// drift\n')]) : bytes;
    }));
  }
});
