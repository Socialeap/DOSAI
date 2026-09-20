import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseStrictJson } from '../../tools/dosai-acceptance/src/strict-json.mjs';

const recordPath = 'docs/architecture/process-ownership-v44.json';
const modifiedPaths = Object.freeze([
  'src/main/execution/service-management-status-proof-entry.ts',
  'tests/security/p3-service-management-status-addon-physical-proof-candidate.test.mjs',
  'tests/architecture/process-ownership-v37.test.mjs',
  'tests/architecture/process-ownership-v42.test.mjs',
  'tests/architecture/p3-guard-successor.mjs',
]);
const supportPaths = Object.freeze([
  'tests/architecture/p3-status-proof-successor.mjs',
  'tests/architecture/process-ownership-v44.test.mjs',
]);
const recordKeys = Object.freeze([
  'schema_version',
  'status',
  'scope',
  'implementation_authorization',
  'accepted_proof_baseline',
  'guard_reconciliation',
  'modified_files',
  'support_files',
  'authority',
  'runtime_status',
].sort());
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

export async function loadStatusProofSuccessor(
  root,
  readBytes = path => readFile(resolve(root, path)),
) {
  const load = async path => {
    const bytes = await readBytes(path);
    assert.ok(bytes.byteLength <= 262144, 'oversized governance record');
    return parseStrictJson(bytes);
  };
  const exactReference = async reference => {
    assert.deepEqual(Object.keys(reference).sort(), ['path', 'sha256']);
    assert.match(reference.sha256, /^[0-9a-f]{64}$/);
    assert.equal(sha256(await readBytes(reference.path)), reference.sha256, reference.path);
  };

  const record = await load(recordPath);
  assert.deepEqual(Object.keys(record).sort(), recordKeys);
  assert.equal(record.schema_version, 44);
  assert.equal(record.status, 'IMPLEMENTED_OWNER_AUTHORIZED_SOURCE_REPAIR');
  assert.equal(record.scope, 'P3_STATUS_PROOF_COMMONJS_STARTUP_REPAIR_ONLY');
  assert.equal(record.implementation_authorization, 'OWNER_AUTHORIZED_BOUNDED_SOURCE_REPAIR_2026_09_20');
  assert.equal(record.runtime_status, 'NO_GO');
  assert.deepEqual(record.modified_files.map(file => file.path), modifiedPaths);
  assert.deepEqual(record.support_files.map(file => file.path), supportPaths);
  assert.ok(Object.values(record.authority).every(value => value === false));
  await exactReference(record.accepted_proof_baseline);
  await exactReference(record.guard_reconciliation);

  const v37 = await load(record.accepted_proof_baseline.path);
  assert.equal(v37.schema_version, 37);
  assert.equal(v37.status, 'ACCEPTED');
  const addon = v37.native_helpers.find(candidate => candidate.id === 'service-management-status-addon');
  const historical = new Map(addon.physical_proof_implemented_files.map(file => [file.path, file.sha256]));
  historical.set(
    'tests/architecture/process-ownership-v37.test.mjs',
    '837408fe8f97be9f90cb6ff6f9321ef300d4e796a49abc0e18dd7a804b1e8dee',
  );
  historical.set(
    'tests/architecture/p3-guard-successor.mjs',
    '32b57febbfd143779037d6b4dde46cfcd83fc35ae769482f8971fe44c6c82f40',
  );
  historical.set(
    'tests/architecture/process-ownership-v42.test.mjs',
    '918bf42ba91e9f39126e8042ce78e46cfef939acd786737c954480cfeb40a26f',
  );
  for (const file of record.modified_files) {
    assert.deepEqual(Object.keys(file).sort(), ['path', 'post_sha256', 'pre_sha256']);
    assert.match(file.pre_sha256, /^[0-9a-f]{64}$/);
    assert.match(file.post_sha256, /^[0-9a-f]{64}$/);
    assert.equal(file.pre_sha256, historical.get(file.path), file.path);
    assert.notEqual(file.post_sha256, file.pre_sha256, file.path);
    assert.equal(sha256(await readBytes(file.path)), file.post_sha256, file.path);
  }
  for (const file of record.support_files) await exactReference(file);

  const postimages = new Map(record.modified_files.map(file => [file.path, file.post_sha256]));
  return Object.freeze({
    expected(path, historicalHash) {
      return postimages.get(path) ?? historicalHash;
    },
  });
}
