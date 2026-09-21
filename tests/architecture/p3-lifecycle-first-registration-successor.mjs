import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { parseStrictJson } from '../../tools/dosai-acceptance/src/strict-json.mjs';

const recordPath = 'docs/architecture/process-ownership-v50.json';
const authorizationPath =
  'docs/architecture/p3-v50-first-registration-authorization-record.json';
const modifiedPreimages = new Map([
  [
    'src/main/execution/service-management-lifecycle-core.ts',
    'f4baaa90c804eb1b5c1351b329b62423aeea4a29acf569f764dddae22ec75be7',
  ],
  [
    'tests/security/p3-service-management-lifecycle-core.test.mjs',
    '34a84971186e8b73cad6d51408dfb2a0c684294e198ed714ed27671017f8636f',
  ],
  [
    'tests/security/p3-service-management-lifecycle-proof-entry.test.mjs',
    '40f298f53e839e9f216de7f365aea100ee159e3deffe0b2b494a3d9b9a7ee63f',
  ],
  [
    'scripts/service-management-lifecycle-proof.mjs',
    'e86755efd3ef6286573b199792fcb9e7ea7a1d139edd750b8ab9be4f704f4278',
  ],
  [
    'tests/security/p3-service-management-lifecycle-composition.test.mjs',
    'ee12e0c1d68c35438baf8fdec23c7ddbacdb04279c3fc4b9b58a0f9ea7837193',
  ],
  [
    'tests/architecture/process-ownership-v46.test.mjs',
    '2bca4c739c339a1dcb9460bda1eb169cffc1a863532e1afba46d6ce473112efa',
  ],
  [
    'tests/architecture/p3-lifecycle-composition-successor.mjs',
    'de6c527daf24700af047b47d66a549561912bd14f178c3d2189760b84ad7e491',
  ],
  [
    'tests/architecture/process-ownership-v49.test.mjs',
    '683eedd32bd818d83652d12cb0da9f190fd2980f73e3c4789dac50e96b469414',
  ],
]);
const newPaths = Object.freeze([
  'tests/architecture/p3-lifecycle-first-registration-successor.mjs',
  'tests/architecture/process-ownership-v50.test.mjs',
  'docs/development/p3-v50-first-registration-implementation-evidence.md',
]);
const recordKeys = Object.freeze([
  'schema_version',
  'status',
  'scope',
  'implementation_authorization',
  'accepted_source_baseline',
  'diagnosis_input',
  'proposal_input',
  'authorization_record',
  'protocol',
  'modified_files',
  'new_files',
  'source_validation',
  'authority',
  'runtime_status',
].sort());
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

export async function loadLifecycleFirstRegistrationSuccessor(
  root,
  readBytes = path => readFile(resolve(root, path)),
) {
  const recordBytes = await readBytes(recordPath);
  assert.ok(recordBytes.byteLength <= 65_536, 'oversized governance record');
  const record = parseStrictJson(recordBytes);
  assert.deepEqual(Object.keys(record).sort(), recordKeys);
  assert.equal(record.schema_version, 50);
  assert.equal(record.status, 'IMPLEMENTED_OWNER_AUTHORIZED_SOURCE_ONLY');
  assert.equal(record.scope, 'P3_FIRST_SEEN_SERVICE_PRECONDITION_SOURCE_ONLY');
  assert.equal(
    record.implementation_authorization,
    'OWNER_AUTHORIZED_EXACT_SOURCE_ONLY_V50_2026_09_21',
  );
  assert.equal(record.runtime_status, 'NO_GO');
  assert.deepEqual(record.accepted_source_baseline, {
    path: 'docs/architecture/process-ownership-v49.json',
    sha256: 'ba1a5d6248df83e6bd2af4852b97f37fe13bdfdef075b20a392aeb524b0cc020',
  });
  assert.deepEqual(record.diagnosis_input, {
    path: 'docs/architecture/p3-v49-not-found-source-diagnosis.json',
    sha256: '2558f04d2d207a9f34c12ab7972816f397898cbe5f924b99798fc52d869bd179',
  });
  assert.deepEqual(record.proposal_input, {
    path: 'docs/architecture/p3-v50-first-registration-successor-proposal.json',
    sha256: 'e72339e2ef42a6ca09ec12c356cecbbf1d48ef39efe129fe4981199dcb655ace',
  });
  assert.deepEqual(record.authorization_record, {
    path: authorizationPath,
    sha256: sha256(await readBytes(authorizationPath)),
  });
  for (const reference of [
    record.accepted_source_baseline,
    record.diagnosis_input,
    record.proposal_input,
  ]) assert.equal(sha256(await readBytes(reference.path)), reference.sha256, reference.path);

  const authorization = parseStrictJson(await readBytes(authorizationPath));
  assert.equal(authorization.status, 'ACCEPTED');
  assert.equal(authorization.authorized_scope.source_only_v50_correction, true);
  assert.ok(Object.values(authorization.denied_scope).every(value => value === true));
  assert.equal(authorization.credit_ceiling, 120);
  assert.equal(authorization.paid_activity_authorized, false);

  assert.deepEqual(record.modified_files.map(file => file.path), [...modifiedPreimages.keys()]);
  assert.deepEqual(record.new_files.map(file => file.path), newPaths);
  assert.deepEqual(record.protocol, {
    single_use: true,
    eligible_initial_statuses: ['NOT_REGISTERED', 'NOT_FOUND'],
    dirty_initial_statuses: ['ENABLED', 'REQUIRES_APPROVAL'],
    register_attempt_limit: 1,
    unregister_attempt_limit: 1,
    operation_argument_count: 0,
    cleanup_trigger: 'REGISTER_TRUE_OR_ACTIVE_POST_STATUS',
    successful_post_register_statuses: ['ENABLED', 'REQUIRES_APPROVAL'],
    clean_terminal_status: 'NOT_REGISTERED',
    retry_allowed: false,
    ambiguous_status_fails_closed: true,
  });
  assert.ok(Object.values(record.authority).every(value => value === false));

  for (const file of record.modified_files) {
    assert.deepEqual(Object.keys(file).sort(), ['path', 'post_sha256', 'pre_sha256']);
    assert.equal(file.pre_sha256, modifiedPreimages.get(file.path), file.path);
    assert.match(file.post_sha256, /^[0-9a-f]{64}$/);
    assert.notEqual(file.post_sha256, file.pre_sha256, file.path);
    assert.equal(sha256(await readBytes(file.path)), file.post_sha256, file.path);
  }
  for (const file of record.new_files) {
    assert.deepEqual(Object.keys(file).sort(), ['path', 'sha256']);
    assert.match(file.sha256, /^[0-9a-f]{64}$/);
    assert.equal(sha256(await readBytes(file.path)), file.sha256, file.path);
  }

  const postimages = new Map(record.modified_files.map(file => [file.path, file.post_sha256]));
  return Object.freeze({
    expected(path, historicalHash) {
      return postimages.get(path) ?? historicalHash;
    },
  });
}
