import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '../..');
const v9Path = resolve(root, 'docs/architecture/process-ownership-v9.json');
const v10Path = resolve(root, 'docs/architecture/process-ownership-v10.json');
const v9Bytes = await readFile(v9Path);
const v9 = JSON.parse(v9Bytes);
const v10 = JSON.parse(await readFile(v10Path, 'utf8'));

test('accepted process ownership v10 is hash-bound to immutable accepted v9', () => {
  const digest = createHash('sha256').update(v9Bytes).digest('hex');
  assert.equal(digest, '323f154334e976e1fcbc37e1a585b7562de3acd60b81fc2d16a4393411071725');
  assert.equal(v9.status, 'ACCEPTED');
  assert.equal(v10.schema_version, 10);
  assert.equal(v10.status, 'ACCEPTED');
  assert.deepEqual(v10.supersedes, {
    path: 'docs/architecture/process-ownership-v9.json',
    sha256: digest,
  });
  assert.deepEqual(v10.accepted_adrs, v9.accepted_adrs);
});

test('v10 changes only the execution-service implementation boundary and invariants', () => {
  assert.deepEqual(v10.source_boundaries, v9.source_boundaries);
  assert.deepEqual(
    v10.native_helpers.filter(({ id }) => id !== 'execution-service'),
    v9.native_helpers.filter(({ id }) => id !== 'execution-service'),
  );
  const service = v10.native_helpers.find(({ id }) => id === 'execution-service');
  assert.equal(service.runtime, 'AD_HOC_SIGNED_SWIFT_INERT_WATCHDOG_CONTROL_CORE');
  assert.equal(service.implementation_state, 'ACTIVE_TEST_FIXTURE');
  assert.equal(service.application_reachable, false);
  assert.equal(service.registration_authority, false);
  assert.equal(service.xpc_listener_authority, false);
  assert.deepEqual(service.control_operations, ['INSPECT', 'STOP_ONE', 'STOP_ALL']);
  assert.deepEqual(service.allowed_external_imports, ['Foundation']);
  for (const field of [
    'production_registration_authority',
    'generic_payload_authority',
    'pid_targeting_authority',
    'ownership_release_authority',
    'reconciliation_authority',
    'journal_authority',
    'vm_creation_authority',
    'vm_start_authority',
    'process_launch_authority',
    'filesystem_authority',
    'network_authority',
  ]) {
    assert.equal(service[field], false, field);
  }
});

test('v10 binds the exact two-file Swift implementation', async () => {
  const service = v10.native_helpers.find(({ id }) => id === 'execution-service');
  assert.deepEqual(service.implementation_files, [
    {
      path: 'native-helpers/execution-service/WatchdogControlCore.swift',
      sha256: 'c1f1148225dc4b9dd7a4174f13243a12fe5148d62ea404d9289c01fc346b1e11',
    },
    {
      path: 'native-helpers/execution-service/main.swift',
      sha256: '8bc5e445b7bf2f4b23b81a7ada47146202abfcde797818e15ea95ab4293994cf',
    },
  ]);
  for (const file of service.implementation_files) {
    const digest = createHash('sha256').update(await readFile(resolve(root, file.path))).digest('hex');
    assert.equal(digest, file.sha256, file.path);
  }
});
