import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseStrictJson } from '../../tools/dosai-acceptance/src/strict-json.mjs';
import { loadStatusProofSuccessor } from './p3-status-proof-successor.mjs';

export const guardedPaths = Object.freeze([22, 24, 26, 27, 28, 29, 30, 36, 37, 42]
  .map(version => `tests/architecture/process-ownership-v${version}.test.mjs`));
const supportPaths = Object.freeze([
  'tests/architecture/p3-guard-successor.mjs',
  'tests/architecture/process-ownership-v43.test.mjs',
]);
const acceptedHead = Object.freeze({
  path: 'docs/architecture/process-ownership-v41.json',
  sha256: 'eab6cd2acd9b729a42760237a82a8536d897d3471a3629d70b5ed27c7abe2d42',
});
const preservedProposal = Object.freeze({
  path: 'docs/architecture/process-ownership-v42.json',
  sha256: 'c39b65583c9bb7786bcdc342054d2ad8a7a211d90180b22fe3c41e0b09be5e4b',
});
const v20Path = 'tests/architecture/process-ownership-v20.test.mjs';
const v20Hash = '91f4e30d01f03bd19d203341107cded4c5cccb4f0512453e58de826f6f8721f7';
const v42TestPreimage = '3eafa6facb426b6cb275cb67bf373dfb266c9dddbb19aa146a8f1e2a9f25000a';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const recordKeys = [
  'schema_version', 'status', 'scope', 'full_manifest_replacement', 'implementation_authorization',
  'accepted_lineage_head', 'preserved_proposal', 'allowed_modified_files', 'preimplementation_files',
  'implemented_files', 'support_files', 'authority', 'runtime_status',
].sort();

// Architecture-test support only. Passing a candidate test does not accept a phase or grant effects.
export async function loadGuardSuccessors(root, readBytes = path => readFile(resolve(root, path))) {
  let proofSuccessor;
  const load = async path => {
    const bytes = await readBytes(path);
    assert.ok(bytes.byteLength <= 262144, 'oversized governance record');
    return parseStrictJson(bytes);
  };
  const exactFile = async file => {
    assert.deepEqual(Object.keys(file).sort(), ['path', 'sha256']);
    assert.match(file.sha256, /^[0-9a-f]{64}$/);
    assert.equal(
      hash(await readBytes(file.path)),
      proofSuccessor.expected(file.path, file.sha256),
      file.path,
    );
  };
  const record = await load('docs/architecture/process-ownership-v43.json');
  assert.deepEqual(Object.keys(record).sort(), recordKeys);
  assert.equal(record.schema_version, 43);
  assert.equal(record.status, 'IMPLEMENTED_PENDING_OWNER_REVIEW');
  assert.equal(record.scope, 'P3_HISTORICAL_GUARD_POSTIMAGE_RECONCILIATION_ONLY');
  assert.equal(record.full_manifest_replacement, false);
  assert.equal(record.implementation_authorization, 'OWNER_DIRECTED_TEST_ONLY_REPAIR_2026_09_20');
  assert.equal(record.runtime_status, 'NO_GO');
  assert.deepEqual(record.accepted_lineage_head, acceptedHead);
  assert.deepEqual(record.preserved_proposal, preservedProposal);
  proofSuccessor = await loadStatusProofSuccessor(root, readBytes);
  await exactFile(acceptedHead);
  await exactFile(preservedProposal);
  const v41 = await load(acceptedHead.path);
  const v42 = await load(preservedProposal.path);
  assert.equal(v41.status, 'ACCEPTED');
  assert.equal(v42.status, 'PROPOSED_FOR_OWNER_REVIEW');
  assert.deepEqual(v42.supersedes, acceptedHead);
  assert.deepEqual(v41.implemented_files, [{ path: v20Path, sha256: v20Hash }]);
  await exactFile(v41.implemented_files[0]);
  for (const input of [...v41.governed_baselines, ...v42.governed_baselines]) await exactFile(input);
  assert.deepEqual(record.authority, v42.authority);
  assert.ok(Object.values(record.authority).every(value => value === false));

  // Validate exact path sets BEFORE reading any paths supplied by the new record.
  assert.deepEqual(record.allowed_modified_files, guardedPaths);
  assert.deepEqual(record.preimplementation_files.map(file => file.path), guardedPaths);
  assert.deepEqual(record.implemented_files.map(file => file.path), guardedPaths);
  assert.deepEqual(record.support_files.map(file => file.path), supportPaths);
  const v37 = await load('docs/architecture/process-ownership-v37.json');
  assert.equal(v37.status, 'ACCEPTED');
  const preimages = new Map([
    ...v42.preimplementation_files,
    ...v37.governance_maintenance_files.filter(file => [27, 29]
      .some(version => file.path === `tests/architecture/process-ownership-v${version}.test.mjs`)),
    { path: guardedPaths.at(-1), sha256: v42TestPreimage },
  ].map(file => [file.path, file.sha256]));
  assert.deepEqual(record.preimplementation_files, guardedPaths.map(path => ({ path, sha256: preimages.get(path) })));
  for (const file of [...record.implemented_files, ...record.support_files]) await exactFile(file);
  for (let index = 0; index < guardedPaths.length; index++) {
    assert.notEqual(record.implemented_files[index].sha256, record.preimplementation_files[index].sha256);
  }

  const postimages = new Map(record.implemented_files.map(file => [file.path, file.sha256]));
  for (const file of v37.governance_maintenance_files) {
    if (file.path === v20Path) continue; // Already pinned to the accepted v41 postimage above.
    if (postimages.has(file.path)) {
      assert.equal(record.preimplementation_files.find(item => item.path === file.path)?.sha256, file.sha256);
    } else {
      await exactFile(file); // Every unaffected accepted governance hash stays exact.
    }
  }
  return Object.freeze({
    expected(path, historicalHash) {
      if (path === v20Path) return v20Hash;
      return postimages.get(path) ?? historicalHash;
    },
  });
}
