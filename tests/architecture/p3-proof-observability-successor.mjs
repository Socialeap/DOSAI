import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseStrictJson } from '../../tools/dosai-acceptance/src/strict-json.mjs';
import { loadLifecycleCompositionSuccessor } from './p3-lifecycle-composition-successor.mjs';

const recordPath = 'docs/architecture/process-ownership-v45.json';
const modifiedPaths = Object.freeze([
  'src/main/execution/service-management-status-proof-entry.ts',
  'scripts/service-management-status-proof.mjs',
  'tests/security/p3-service-management-status-addon-physical-proof-candidate.test.mjs',
  'tests/architecture/p3-status-proof-successor.mjs',
  'tests/architecture/process-ownership-v44.test.mjs',
]);
const supportPaths = Object.freeze([
  'tests/architecture/p3-proof-observability-successor.mjs',
  'tests/architecture/process-ownership-v45.test.mjs',
]);
const historicalHashes = new Map([
  [modifiedPaths[0], '0a6bf35a6d80e495b3c6a3d1799788dcacfe40425d8340208c60d19644dbb389'],
  [modifiedPaths[1], '53a4669c945122e98abdd44228af25e5cdf6b8db1b472aaff308d65b5d04fdc6'],
  [modifiedPaths[2], '3822b844a4275552f6b0ed1fa359125f8ac6bbfe01d04edb7f99b6b5ed68fb37'],
  [modifiedPaths[3], 'f601c1afbdc8a00cd41a0dac535036c789967d0841fe4d948d5ef1da20e843be'],
  [modifiedPaths[4], '367d5e9a4ed57a8e67a67c8d523a95d34f17ccb433a2dc8e459f055699f69f5c'],
]);
const recordKeys = Object.freeze([
  'schema_version',
  'status',
  'scope',
  'implementation_authorization',
  'accepted_source_baseline',
  'physical_evidence',
  'observed_attempt',
  'protocol',
  'modified_files',
  'support_files',
  'authority',
  'runtime_status',
].sort());
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

export async function loadProofObservabilitySuccessor(
  root,
  readBytes = path => readFile(resolve(root, path)),
) {
  const lifecycleSuccessor = await loadLifecycleCompositionSuccessor(root, readBytes);
  const load = async path => {
    const bytes = await readBytes(path);
    assert.ok(bytes.byteLength <= 262144, 'oversized governance record');
    return parseStrictJson(bytes);
  };
  const exactReference = async reference => {
    assert.deepEqual(Object.keys(reference).sort(), ['path', 'sha256']);
    assert.match(reference.sha256, /^[0-9a-f]{64}$/);
    assert.equal(
      sha256(await readBytes(reference.path)),
      lifecycleSuccessor.expected(reference.path, reference.sha256),
      reference.path,
    );
  };

  const record = await load(recordPath);
  assert.deepEqual(Object.keys(record).sort(), recordKeys);
  assert.equal(record.schema_version, 45);
  assert.equal(record.status, 'IMPLEMENTED_OWNER_AUTHORIZED_SOURCE_REPAIR');
  assert.equal(record.scope, 'P3_STATUS_PROOF_FAILURE_ATTRIBUTION_ONLY');
  assert.equal(
    record.implementation_authorization,
    'OWNER_AUTHORIZED_BOUNDED_SOURCE_ONLY_V45_OBSERVABILITY_REPAIR_2026_09_20',
  );
  assert.equal(record.runtime_status, 'NO_GO');
  assert.deepEqual(record.modified_files.map(file => file.path), modifiedPaths);
  assert.deepEqual(record.support_files.map(file => file.path), supportPaths);
  assert.ok(Object.values(record.authority).every(value => value === false));
  await exactReference(record.accepted_source_baseline);
  await exactReference(record.physical_evidence);

  const v44 = await load(record.accepted_source_baseline.path);
  assert.equal(v44.schema_version, 44);
  assert.equal(v44.status, 'IMPLEMENTED_OWNER_AUTHORIZED_SOURCE_REPAIR');
  assert.equal(v44.runtime_status, 'NO_GO');
  assert.deepEqual(Object.keys(record.observed_attempt).sort(), [
    'authorization_exhausted',
    'result',
    'runner_exit_code',
    'source_commit',
    'attempt_count',
  ].sort());
  assert.deepEqual(record.observed_attempt, {
    source_commit: '86ff4281094bb7cd35b89a479e2bb7a8e3276919',
    result: 'NOT_FOUND',
    runner_exit_code: 0,
    attempt_count: 1,
    authorization_exhausted: true,
  });
  assert.deepEqual(Object.keys(record.protocol).sort(), [
    'result_prefix',
    'preserved_status_outputs',
    'distinct_failure_outputs',
    'fixed_addon_load_attempt_limit',
    'zero_argument_native_call_limit',
  ].sort());
  assert.deepEqual(record.protocol, {
    result_prefix: 'DOSAI_SERVICE_MANAGEMENT_STATUS_PROOF_V1:',
    preserved_status_outputs: [
      'NOT_REGISTERED',
      'ENABLED',
      'REQUIRES_APPROVAL',
      'NOT_FOUND',
    ],
    distinct_failure_outputs: [
      'NATIVE_ADDON_LOAD_FAILED',
      'NATIVE_STATUS_CALL_FAILED',
      'ELECTRON_READINESS_FAILED',
    ],
    fixed_addon_load_attempt_limit: 1,
    zero_argument_native_call_limit: 1,
  });

  for (const file of record.modified_files) {
    assert.deepEqual(Object.keys(file).sort(), ['path', 'post_sha256', 'pre_sha256']);
    assert.match(file.pre_sha256, /^[0-9a-f]{64}$/);
    assert.match(file.post_sha256, /^[0-9a-f]{64}$/);
    assert.equal(file.pre_sha256, historicalHashes.get(file.path), file.path);
    assert.notEqual(file.post_sha256, file.pre_sha256, file.path);
    assert.equal(
      sha256(await readBytes(file.path)),
      lifecycleSuccessor.expected(file.path, file.post_sha256),
      file.path,
    );
  }
  for (const file of record.support_files) await exactReference(file);

  const postimages = new Map(record.modified_files.map(file => [file.path, file.post_sha256]));
  return Object.freeze({
    expected(path, historicalHash) {
      return lifecycleSuccessor.expected(path, postimages.get(path) ?? historicalHash);
    },
  });
}
