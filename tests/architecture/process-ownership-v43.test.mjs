import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import { loadLifecycleCompositionSuccessor } from './p3-lifecycle-composition-successor.mjs';
import { guardedPaths, loadGuardSuccessors } from './p3-guard-successor.mjs';

const root = resolve(import.meta.dirname, '../..');
const recordPath = 'docs/architecture/process-ownership-v43.json';
const read = path => readFile(resolve(root, path));
const pristine = JSON.parse(await read(recordPath));
const altered = change => {
  const candidate = structuredClone(pristine);
  change(candidate);
  return path => path === recordPath ? Buffer.from(JSON.stringify(candidate)) : read(path);
};

test('v43 proves exact accepted lineage, ten bounded postimages and no runtime authority', async () => {
  const lifecycleSuccessor = await loadLifecycleCompositionSuccessor(root);
  const successor = await loadGuardSuccessors(root);
  assert.equal(guardedPaths.length, 10);
  assert.deepEqual(guardedPaths, [22, 24, 26, 27, 28, 29, 30, 36, 37, 42]
    .map(version => `tests/architecture/process-ownership-v${version}.test.mjs`));
  for (const file of pristine.implemented_files) {
    assert.equal(
      successor.expected(file.path, 'old'),
      lifecycleSuccessor.expected(file.path, file.sha256),
    );
  }
  assert.equal(successor.expected('src/main/index.ts', 'unchanged'), 'unchanged');
  assert.equal(
    successor.expected('tests/architecture/process-ownership-v20.test.mjs', 'old'),
    lifecycleSuccessor.expected(
      'tests/architecture/process-ownership-v20.test.mjs',
      '91f4e30d01f03bd19d203341107cded4c5cccb4f0512453e58de826f6f8721f7',
    ),
  );
});

test('v43 rejects widened, missing, duplicate and traversal path sets before reading them', async () => {
  for (const change of [
    record => record.allowed_modified_files.push('src/main/index.ts'),
    record => record.implemented_files.pop(),
    record => { record.implemented_files[1] = record.implemented_files[0]; },
    record => { record.implemented_files[0].path = '../../outside'; },
    record => record.support_files.push({ path: 'src/main/index.ts', sha256: 'a'.repeat(64) }),
    record => { record.unexpected = true; },
  ]) {
    const fixtureRead = altered(change);
    const opened = [];
    await assert.rejects(loadGuardSuccessors(root, path => {
      opened.push(path);
      return fixtureRead(path);
    }));
    assert.ok(!opened.includes('../../outside'));
    assert.ok(!opened.includes('src/main/index.ts'));
  }
});

test('v43 rejects altered lineage, authority expansion and false owner acceptance', async () => {
  for (const change of [
    record => { record.accepted_lineage_head.sha256 = 'a'.repeat(64); },
    record => { record.preserved_proposal.sha256 = 'a'.repeat(64); },
    record => { record.preimplementation_files[0].sha256 = 'a'.repeat(64); },
    record => { record.authority.vm_control = true; },
    record => { record.status = 'ACCEPTED'; },
    record => { record.runtime_status = 'GO'; },
    record => { record.full_manifest_replacement = true; },
  ]) await assert.rejects(loadGuardSuccessors(root, altered(change)));
});

test('v43 rejects any changed guard or support postimage, accepted v20 or unaffected historical file', async () => {
  const targets = [...pristine.implemented_files, ...pristine.support_files].map(file => file.path);
  targets.push('tests/architecture/process-ownership-v20.test.mjs', 'tests/architecture/process-ownership-v21.test.mjs');
  for (const target of targets) {
    await assert.rejects(loadGuardSuccessors(root, async path => {
      const bytes = await read(path);
      return path === target ? Buffer.concat([bytes, Buffer.from('\n// unexpected drift\n')]) : bytes;
    }));
  }
  await assert.rejects(loadGuardSuccessors(root, altered(record => {
    record.implemented_files[0].sha256 = 'a'.repeat(64);
  })));
});

test('v43 rejects malformed and duplicate-key records without opening proposed postimage paths', async () => {
  for (const source of ['{', '{"schema_version":43,"schema_version":43}', 'x'.repeat(262145)]) {
    const opened = [];
    await assert.rejects(loadGuardSuccessors(root, async path => {
      opened.push(path);
      return path === recordPath ? Buffer.from(source) : read(path);
    }));
    assert.equal(opened.at(-1), recordPath);
    assert.equal(opened.includes('../../outside'), false);
    assert.equal(opened.includes('src/main/index.ts'), false);
  }
});
